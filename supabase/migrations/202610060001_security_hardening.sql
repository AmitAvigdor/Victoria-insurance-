begin;

alter table public.profiles add column role text not null default 'viewer'
 check(role in ('admin','editor','viewer'));
-- Only the explicitly provisioned owner is promoted; new users are read-only.
update public.profiles set role='admin'
 where id='33b05868-fc18-4c14-91a7-5c935f3a5ea8'
 and agency_id='11111111-1111-4111-8111-111111111111';

-- A valid JWT alone is insufficient after sign-out or eight hours of session age.
create or replace function public.current_agency_id() returns uuid
language sql stable security definer set search_path = '' as $$
 select p.agency_id from public.profiles p where p.id=(select auth.uid())
 and exists(select 1 from auth.sessions s where s.user_id=p.id
   and s.id::text=(select auth.jwt()->>'session_id')
   and s.created_at > now()-interval '8 hours')
$$;
create function public.current_agency_role() returns text
language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id=(select auth.uid())
 and agency_id=(select public.current_agency_id())
$$;
revoke all on function public.current_agency_role() from public;
grant execute on function public.current_agency_role() to authenticated;

create policy customers_write_role on public.customers as restrictive for insert to authenticated
 with check((select public.current_agency_role()) in ('admin','editor'));
create policy customers_update_role on public.customers as restrictive for update to authenticated
 using((select public.current_agency_role()) in ('admin','editor'));
create policy policies_write_role on public.policies as restrictive for insert to authenticated
 with check((select public.current_agency_role()) in ('admin','editor'));
create policy policies_update_role on public.policies as restrictive for update to authenticated
 using((select public.current_agency_role()) in ('admin','editor'));
create policy tasks_write_role on public.tasks as restrictive for insert to authenticated
 with check((select public.current_agency_role()) in ('admin','editor'));
create policy tasks_update_role on public.tasks as restrictive for update to authenticated
 using((select public.current_agency_role()) in ('admin','editor'));
create policy profiles_admin_read on public.profiles for select to authenticated
 using(agency_id=(select public.current_agency_id()) and (select public.current_agency_role())='admin');

create function public.set_member_role(member_id uuid, new_role text) returns void
language plpgsql security definer set search_path='' as $$
declare agency uuid := public.current_agency_id(); target public.profiles;
begin
 if public.current_agency_role() is distinct from 'admin' or new_role not in ('admin','editor','viewer') then
  raise exception 'Not permitted' using errcode='42501'; end if;
 perform 1 from public.agencies where id=agency for update;
 select * into target from public.profiles where id=member_id and agency_id=agency;
 if not found then raise exception 'Not permitted' using errcode='42501'; end if;
 if target.role='admin' and new_role<>'admin' and
  (select count(*) from public.profiles where agency_id=agency and role='admin')<=1 then
  raise exception 'Cannot remove the last administrator' using errcode='42501'; end if;
 update public.profiles set role=new_role where id=member_id;
 insert into public.activities(agency_id,user_id,action_type,description)
 values(agency,auth.uid(),'profiles.role','עודכנה הרשאת משתמש: '||target.full_name||' → '||new_role);
end $$;
revoke all on function public.set_member_role(uuid,text) from public;
grant execute on function public.set_member_role(uuid,text) to authenticated;

-- Personal-use files are explicitly unscanned, never mislabeled as antivirus-clean.
alter table public.documents add column scan_status text not null default 'unscanned'
 check(scan_status in ('unscanned','pending','clean','rejected'));
alter table public.documents add column scanned_at timestamptz;
alter table public.documents add column content_sha256 text;
alter table public.documents add column deleted_at timestamptz;
create function public.audit_document() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activities(agency_id,customer_id,user_id,action_type,description)
 values(new.agency_id,new.customer_id,new.uploaded_by,'documents.insert','הועלה מסמך: '||new.file_name);
 return null;
end $$;
revoke all on function public.audit_document() from public;
drop trigger documents_audit on public.documents;
create trigger documents_audit after insert on public.documents for each row execute function public.audit_document();
create index documents_pending_scan on public.documents(uploaded_at) where scan_status='pending';
revoke insert,update,delete on public.documents from authenticated;
drop policy documents_storage_read on storage.objects;
drop policy documents_storage_insert on storage.objects;
drop policy documents_storage_delete on storage.objects;
-- Other bucket policies must never grant browser access to this private bucket.
create policy documents_server_only on storage.objects as restrictive for all to authenticated
 using(bucket_id<>'customer-documents') with check(bucket_id<>'customer-documents');

create function public.archive_document(document_id uuid, archived boolean default true) returns void
language plpgsql security definer set search_path='' as $$
declare item public.documents;
begin
 if public.current_agency_role() is distinct from 'admin' then
  raise exception 'Not permitted' using errcode='42501'; end if;
 select * into item from public.documents where id=document_id
 and agency_id=public.current_agency_id() for update;
 if not found then raise exception 'Not permitted' using errcode='42501'; end if;
 if (item.deleted_at is not null)=archived then return; end if;
 update public.documents set deleted_at=case when archived then now() else null end where id=item.id;
 insert into public.activities(agency_id,customer_id,user_id,action_type,description)
 values(item.agency_id,item.customer_id,auth.uid(),case when archived then 'documents.archive' else 'documents.restore' end,
 case when archived then 'הועבר מסמך לסל המחזור: ' else 'שוחזר מסמך: ' end||item.file_name);
end $$;
revoke all on function public.archive_document(uuid,boolean) from public;
grant execute on function public.archive_document(uuid,boolean) to authenticated;

create table public.security_request_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 operation text not null, window_start timestamptz not null, requests integer not null,
 primary key(user_id,operation,window_start)
);
alter table public.security_request_limits enable row level security;
revoke all on public.security_request_limits from anon,authenticated;
create function public.authorize_document_request(operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare agency uuid:=public.current_agency_id(); member_role text:=public.current_agency_role();
 requests_used integer; window_time timestamptz:=to_timestamp(floor(extract(epoch from now())/600)*600);
begin
 if agency is null or operation not in ('upload','access') or
 (operation='upload' and member_role not in ('admin','editor')) then
 raise exception 'Not permitted' using errcode='42501'; end if;
 insert into public.security_request_limits values(auth.uid(),operation,window_time,1)
 on conflict on constraint security_request_limits_pkey do update set requests=public.security_request_limits.requests+1
 returning requests into requests_used;
 if requests_used > (case when operation='upload' then 10 else 120 end) then
 raise exception 'Too many requests' using errcode='54000'; end if;
 delete from public.security_request_limits where window_start<now()-interval '1 day';
 return jsonb_build_object('agency_id',agency,'user_id',auth.uid(),'role',member_role);
end $$;
revoke all on function public.authorize_document_request(text) from public;
grant execute on function public.authorize_document_request(text) to authenticated;

create function public.request_document_access(document_id uuid, accept_unscanned boolean default false) returns public.documents
language plpgsql security definer set search_path='' as $$
declare item public.documents;
begin
 select * into item from public.documents where id=document_id
 and agency_id=public.current_agency_id() and deleted_at is null
 and (scan_status='clean' or (scan_status='unscanned' and uploaded_by=auth.uid() and accept_unscanned is true));
 if not found then raise exception 'Document unavailable or not scanned' using errcode='42501'; end if;
 insert into public.activities(agency_id,customer_id,user_id,action_type,description)
 values(item.agency_id,item.customer_id,auth.uid(),'documents.access','בקשת גישה למסמך: '||item.file_name);
 return item;
end $$;
revoke all on function public.request_document_access(uuid,boolean) from public;
grant execute on function public.request_document_access(uuid,boolean) to authenticated;

commit;
