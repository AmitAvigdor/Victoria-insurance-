-- Keshet CRM. Agency membership is provisioned by a trusted administrator only.
-- No policy permits a browser to insert/update profiles, agencies, or audit events.
begin;
create table public.agencies (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 1 and 160),
 created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 agency_id uuid not null references public.agencies(id),
 full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
 created_at timestamptz not null default now(),
 unique (agency_id,id)
);
create index profiles_agency_idx on public.profiles(agency_id);
create or replace function public.current_agency_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select agency_id from public.profiles where id = (select auth.uid()) $$;
revoke all on function public.current_agency_id() from public;
grant execute on function public.current_agency_id() to authenticated;

create table public.customers (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null default public.current_agency_id() references public.agencies(id),
 first_name text not null check(char_length(btrim(first_name)) between 1 and 80),
 last_name text not null check(char_length(btrim(last_name)) between 1 and 80),
 identification_number text not null check(identification_number ~ '^[0-9]{9}$'),
 phone text not null check(phone ~ '^[+0-9 ()-]{7,25}$'),
 email text not null default '' check(char_length(email) <= 254 and (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 date_of_birth date,
 address text not null default '' check(char_length(address)<=300),
 notes text not null default '' check(char_length(notes)<=5000),
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(agency_id,id), unique(agency_id,identification_number)
);
create index customers_name_idx on public.customers(agency_id,last_name,first_name);
create index customers_phone_idx on public.customers(agency_id,phone);
create index customers_email_idx on public.customers(agency_id,lower(email));
create index customers_archived_idx on public.customers(agency_id,archived_at);

create table public.policies (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null default public.current_agency_id() references public.agencies(id),
 customer_id uuid not null,
 insurance_company text not null check(char_length(btrim(insurance_company)) between 1 and 100),
 policy_number text not null check(char_length(btrim(policy_number)) between 1 and 100),
 insurance_type text not null check(insurance_type in ('רכב','דירה','חיים','בריאות','עסק','נסיעות','אחר')),
 start_date date not null,
 end_date date not null check(end_date >= start_date),
 premium numeric(12,2) not null check(premium >= 0 and premium <= 999999999),
 status text not null default 'פעילה' check(status in ('פעילה','עומדת לחידוש','הסתיימה','בוטלה')),
 notes text not null default '' check(char_length(notes)<=5000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (agency_id,customer_id) references public.customers(agency_id,id),
 unique(agency_id,id), unique(agency_id,customer_id,id), unique(agency_id,insurance_company,policy_number)
);
create index policies_customer_idx on public.policies(agency_id,customer_id);
create index policies_renewal_idx on public.policies(agency_id,end_date) where status <> 'בוטלה';
create index policies_status_idx on public.policies(agency_id,status);
create index policies_number_idx on public.policies(agency_id,policy_number);

create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null default public.current_agency_id() references public.agencies(id),
 customer_id uuid,
 policy_id uuid,
 title text not null check(char_length(btrim(title)) between 1 and 200),
 description text not null default '' check(char_length(description)<=5000),
 due_date date not null,
 priority text not null default 'רגילה' check(priority in ('נמוכה','רגילה','גבוהה')),
 status text not null default 'פתוחה' check(status in ('פתוחה','בטיפול','הושלמה')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(policy_id is null or customer_id is not null),
 foreign key (agency_id,customer_id) references public.customers(agency_id,id),
 foreign key (agency_id,customer_id,policy_id) references public.policies(agency_id,customer_id,id),
 unique(agency_id,id)
);
create index tasks_due_idx on public.tasks(agency_id,status,due_date);
create index tasks_customer_idx on public.tasks(agency_id,customer_id);
create index tasks_policy_idx on public.tasks(agency_id,policy_id);

create table public.documents (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null default public.current_agency_id() references public.agencies(id),
 customer_id uuid not null,
 policy_id uuid,
 file_name text not null check(char_length(file_name) between 1 and 240),
 file_path text not null unique,
 document_type text not null check(char_length(btrim(document_type)) between 1 and 100),
 file_size bigint not null check(file_size between 1 and 10485760),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 uploaded_at timestamptz not null default now(),
 uploaded_by uuid not null references auth.users(id),
 foreign key (agency_id,customer_id) references public.customers(agency_id,id),
 foreign key (agency_id,customer_id,policy_id) references public.policies(agency_id,customer_id,id),
 check(file_path = agency_id::text || '/' || customer_id::text || '/' || id::text || case mime_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.docx' end)
);
create index documents_customer_idx on public.documents(agency_id,customer_id,uploaded_at desc);
create index documents_policy_idx on public.documents(agency_id,policy_id);
create index documents_uploader_idx on public.documents(uploaded_by);

create table public.activities (
 id uuid primary key default gen_random_uuid(),
 agency_id uuid not null references public.agencies(id),
 customer_id uuid,
 user_id uuid references auth.users(id) on delete set null,
 action_type text not null,
 description text not null,
 created_at timestamptz not null default now(),
 foreign key (agency_id,customer_id) references public.customers(agency_id,id)
);
create index activities_customer_idx on public.activities(agency_id,customer_id,created_at desc);
create index activities_actor_idx on public.activities(user_id);

-- Keep record identity immutable, set timestamps on the server, and freeze policy ownership.
create function public.guard_record_update() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.id <> old.id or new.agency_id <> old.agency_id then raise exception 'Record identity is immutable' using errcode='42501'; end if;
 if tg_table_name = 'policies' then
  if new.customer_id <> old.customer_id then raise exception 'Policy customer is immutable' using errcode='42501'; end if;
 end if;
 new.created_at := old.created_at;
 new.updated_at := now();
 return new;
end; $$;
create trigger customers_guard before update on public.customers for each row execute function public.guard_record_update();
create trigger policies_guard before update on public.policies for each row execute function public.guard_record_update();
create trigger tasks_guard before update on public.tasks for each row execute function public.guard_record_update();

-- Audit is generated in the same transaction as the source mutation.
create function public.audit_record() returns trigger language plpgsql security definer set search_path = '' as $$
declare item jsonb; customer uuid; message text; action text;
begin
 item := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
 customer := case when tg_table_name='customers' then (item->>'id')::uuid else (item->>'customer_id')::uuid end;
 action := tg_table_name || '.' || lower(tg_op);
 case tg_table_name
 when 'customers' then message := case when tg_op='INSERT' then 'נוצר כרטיס לקוח' when new.archived_at is distinct from old.archived_at then case when new.archived_at is null then 'הלקוח שוחזר מהארכיון' else 'הלקוח הועבר לארכיון' end else 'פרטי הלקוח עודכנו' end;
 when 'policies' then message := case when tg_op='INSERT' then 'נוצרה פוליסה: ' else 'עודכנה פוליסה: ' end || (item->>'policy_number');
 when 'tasks' then message := case when item->>'status'='הושלמה' then 'הושלמה משימה: ' when tg_op='INSERT' then 'נוצרה משימה: ' else 'עודכנה משימה: ' end || (item->>'title');
 when 'documents' then message := case when tg_op='DELETE' then 'נמחק מסמך: ' else 'הועלה מסמך: ' end || (item->>'file_name');
 end case;
 insert into public.activities(agency_id,customer_id,user_id,action_type,description) values((item->>'agency_id')::uuid,customer,auth.uid(),action,message);
 return null;
end; $$;
revoke all on function public.audit_record() from public;
revoke all on function public.guard_record_update() from public;
create trigger customers_audit after insert or update on public.customers for each row execute function public.audit_record();
create trigger policies_audit after insert or update on public.policies for each row execute function public.audit_record();
create trigger tasks_audit after insert or update on public.tasks for each row execute function public.audit_record();
create trigger documents_audit after insert or delete on public.documents for each row execute function public.audit_record();

alter table public.agencies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.policies enable row level security;
alter table public.tasks enable row level security;
alter table public.documents enable row level security;
alter table public.activities enable row level security;
revoke all on public.agencies, public.profiles, public.customers, public.policies, public.tasks, public.documents, public.activities from anon, authenticated;
grant select on public.agencies, public.profiles, public.activities to authenticated;
grant select,insert,update on public.customers, public.policies, public.tasks to authenticated;
grant select,insert,delete on public.documents to authenticated;
create policy agencies_read on public.agencies for select to authenticated using(id=(select public.current_agency_id()));
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy activities_read on public.activities for select to authenticated using(agency_id=(select public.current_agency_id()));
create policy customers_read on public.customers for select to authenticated using(agency_id=(select public.current_agency_id()));
create policy customers_insert on public.customers for insert to authenticated with check(agency_id=(select public.current_agency_id()));
create policy customers_update on public.customers for update to authenticated using(agency_id=(select public.current_agency_id())) with check(agency_id=(select public.current_agency_id()));
create policy policies_read on public.policies for select to authenticated using(agency_id=(select public.current_agency_id()));
create policy policies_insert on public.policies for insert to authenticated with check(agency_id=(select public.current_agency_id()));
create policy policies_update on public.policies for update to authenticated using(agency_id=(select public.current_agency_id())) with check(agency_id=(select public.current_agency_id()));
create policy tasks_read on public.tasks for select to authenticated using(agency_id=(select public.current_agency_id()));
create policy tasks_insert on public.tasks for insert to authenticated with check(agency_id=(select public.current_agency_id()));
create policy tasks_update on public.tasks for update to authenticated using(agency_id=(select public.current_agency_id())) with check(agency_id=(select public.current_agency_id()));
create policy documents_read on public.documents for select to authenticated using(agency_id=(select public.current_agency_id()));
create policy documents_insert on public.documents for insert to authenticated with check(agency_id=(select public.current_agency_id()) and uploaded_by=(select auth.uid()));
create policy documents_delete on public.documents for delete to authenticated using(agency_id=(select public.current_agency_id()));

-- The bucket is private. Browser keys are public; RLS is the security boundary.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-documents','customer-documents',false,10485760,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy documents_storage_read on storage.objects for select to authenticated
using(bucket_id='customer-documents' and (storage.foldername(name))[1]=(select public.current_agency_id())::text);
create policy documents_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='customer-documents' and (storage.foldername(name))[1]=(select public.current_agency_id())::text
 and array_length(storage.foldername(name),1)=2
 and exists(select 1 from public.customers c where c.agency_id=(select public.current_agency_id()) and c.id::text=(storage.foldername(name))[2])
 and storage.filename(name) ~ '^[0-9a-f-]{36}\.(pdf|jpg|png|docx)$');
create policy documents_storage_delete on storage.objects for delete to authenticated
using(bucket_id='customer-documents' and (storage.foldername(name))[1]=(select public.current_agency_id())::text);
-- No UPDATE policy: files cannot be overwritten. Upload a new version as a new record.
commit;
