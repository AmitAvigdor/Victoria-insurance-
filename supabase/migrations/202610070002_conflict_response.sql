-- Use an HTTP conflict, not a PostgreSQL serialization error which PostgREST can retry.
begin;
create or replace function public.save_renewal(policy_id uuid, expected_updated_at timestamptz, stage text, follow_up date, note text) returns void
language plpgsql security invoker set search_path='' as $$
declare p public.policies;
begin
 if public.current_agency_role() not in ('admin','editor') then raise exception 'Denied' using errcode='42501'; end if;
 select * into p from public.policies where id=policy_id and agency_id=public.current_agency_id() for update;
 if not found then raise exception 'Denied' using errcode='42501'; end if;
 if p.updated_at is distinct from expected_updated_at then raise exception 'Record changed' using errcode='PT409'; end if;
 update public.policies set renewal_stage=stage,renewal_follow_up=follow_up,renewal_notes=note where id=policy_id;
end; $$;
create or replace function public.apply_import_updates(updates jsonb) returns void
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
 if (current_row->>'updated_at')::timestamptz is distinct from (item->>'updated_at')::timestamptz then raise exception 'Record changed' using errcode='PT409'; end if;
 setters:='';
 for key in select jsonb_object_keys(patch) loop
 if not key=any(allowed) then raise exception 'Invalid field' using errcode='42501'; end if;
 setters:=setters || case when setters='' then '' else ',' end || format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,target,key);
 end loop;
 execute format('update public.%I set %s where id=$2',target,setters) using current_row||patch,rid;
 end loop;
end; $$;
commit;
