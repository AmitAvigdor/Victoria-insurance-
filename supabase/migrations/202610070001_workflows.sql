begin;
alter table public.policies
 add column renewal_stage text not null default 'טרם טופל' check (renewal_stage in ('טרם טופל','יצרתי קשר','נשלחה הצעה','ממתין ללקוח','חודש','לא חודש')),
 add column renewal_follow_up date,
 add column renewal_notes text not null default '' check(char_length(renewal_notes)<=5000),
 add column commission_expected_amount numeric(12,2) check(commission_expected_amount between 0 and 999999999),
 add column commission_received_amount numeric(12,2) not null default 0 check(commission_received_amount between 0 and 999999999),
 add column commission_due_date date;
create index policies_follow_up_idx on public.policies(agency_id,renewal_follow_up) where renewal_stage not in ('חודש','לא חודש');
create function public.save_renewal(policy_id uuid, expected_updated_at timestamptz, stage text, follow_up date, note text) returns void
language plpgsql security invoker set search_path='' as $$
declare p public.policies;
begin
 if public.current_agency_role() not in ('admin','editor') then raise exception 'Denied' using errcode='42501'; end if;
 select * into p from public.policies where id=policy_id and agency_id=public.current_agency_id() for update;
 if not found then raise exception 'Denied' using errcode='42501'; end if;
 if p.updated_at is distinct from expected_updated_at then raise exception 'Record changed' using errcode='40001'; end if;
 update public.policies set renewal_stage=stage,renewal_follow_up=follow_up,renewal_notes=note where id=policy_id;
end; $$;
create function public.add_contact_note(customer_id uuid, note text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.current_agency_role() not in ('admin','editor') or not exists(select 1 from public.customers c where c.id=customer_id and c.agency_id=public.current_agency_id()) then raise exception 'Denied' using errcode='42501'; end if;
 if char_length(btrim(note)) not between 1 and 5000 then raise exception 'Invalid note' using errcode='23514'; end if;
 insert into public.activities(agency_id,customer_id,user_id,action_type,description) values(public.current_agency_id(),customer_id,auth.uid(),'contact.note',btrim(note));
end; $$;
-- Only explicitly selected fields are changed; each reviewed record is checked under a row lock.
create function public.apply_import_updates(updates jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; target text; rid uuid; patch jsonb; current_row jsonb; key text; setters text; allowed text[];
begin
 if public.current_agency_role() not in ('admin','editor') then raise exception 'Denied' using errcode='42501'; end if;
 if jsonb_typeof(updates)<>'array' or jsonb_array_length(updates) not between 1 and 2 then raise exception 'Invalid updates' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(updates) loop
 target:=item->>'table'; rid:=(item->>'id')::uuid; patch:=item->'patch';
 if target='customers' then allowed:=array['first_name','last_name','phone','email','date_of_birth','address','notes'];
 elsif target='policies' then allowed:=array['start_date','end_date','premium','status','notes','compulsory_value','comprehensive_value','commission','commission_expected_amount','commission_received_amount','commission_due_date'];
 else raise exception 'Invalid table' using errcode='23514'; end if;
 if jsonb_typeof(patch)<>'object' or patch='{}'::jsonb then raise exception 'Invalid patch' using errcode='23514'; end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and agency_id=$2 for update',target) into current_row using rid,public.current_agency_id();
 if current_row is null then raise exception 'Denied' using errcode='42501'; end if;
 if (current_row->>'updated_at')::timestamptz is distinct from (item->>'updated_at')::timestamptz then raise exception 'Record changed' using errcode='40001'; end if;
 setters:='';
 for key in select jsonb_object_keys(patch) loop
 if not key=any(allowed) then raise exception 'Invalid field' using errcode='42501'; end if;
 setters:=setters || case when setters='' then '' else ',' end || format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,target,key);
 end loop;
 execute format('update public.%I set %s where id=$2',target,setters) using current_row||patch,rid;
 end loop;
end; $$;
-- Extend the existing transaction-local audit to describe workflow changes.
create or replace function public.audit_record() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; customer uuid; message text; action text;
begin
 item:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 customer:=case when tg_table_name='customers' then (item->>'id')::uuid else (item->>'customer_id')::uuid end;
 action:=tg_table_name||'.'||lower(tg_op);
 case tg_table_name
 when 'customers' then message:=case when tg_op='INSERT' then 'נוצר כרטיס לקוח' when new.archived_at is distinct from old.archived_at then case when new.archived_at is null then 'הלקוח שוחזר מהארכיון' else 'הלקוח הועבר לארכיון' end else 'פרטי הלקוח עודכנו' end;
 when 'policies' then
 message:=case when tg_op='INSERT' then 'נוצרה פוליסה: ' else 'עודכנה פוליסה: ' end || coalesce(nullif(item->>'policy_number',''),item->>'vehicle_registration','');
 if tg_op='UPDATE' and (new.renewal_stage is distinct from old.renewal_stage or new.renewal_follow_up is distinct from old.renewal_follow_up or new.renewal_notes is distinct from old.renewal_notes) then
 message:='חידוש: '||new.renewal_stage||case when new.renewal_follow_up is null then '' else ' · מעקב: '||new.renewal_follow_up::text end||case when new.renewal_notes='' then '' else ' · '||new.renewal_notes end; action:='renewal.updated'; end if;
 when 'tasks' then message:=case when item->>'status'='הושלמה' then 'הושלמה משימה: ' when tg_op='INSERT' then 'נוצרה משימה: ' else 'עודכנה משימה: ' end || (item->>'title');
 when 'documents' then message:=case when tg_op='DELETE' then 'נמחק מסמך: ' else 'הועלה מסמך: ' end || (item->>'file_name');
 end case;
 insert into public.activities(agency_id,customer_id,user_id,action_type,description) values((item->>'agency_id')::uuid,customer,auth.uid(),action,message);
 return null;
end; $$;
revoke all on function public.save_renewal(uuid,timestamptz,text,date,text), public.add_contact_note(uuid,text), public.apply_import_updates(jsonb) from public,anon;
grant execute on function public.save_renewal(uuid,timestamptz,text,date,text), public.add_contact_note(uuid,text), public.apply_import_updates(jsonb) to authenticated;
commit;
