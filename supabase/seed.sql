-- OPTIONAL. Run only in a development project after creating an Auth user and profile.
-- Replace the UUID below with an agency you own. All customer data is fictional.
-- The entire seed is transactional and idempotent for the same agency.
begin;
do $$
declare agency uuid := '11111111-1111-4111-8111-111111111111'; customer uuid; i integer; names text[][] := array[['דוד','כהן'],['נועה','לוי'],['ישראל','ישראלי'],['תמר','ברק'],['אורי','גפן'],['מיכל','שחר']];
begin
 if not exists(select 1 from public.agencies where id=agency) then raise exception 'Create your development agency and replace the agency UUID in seed.sql first'; end if;
 for i in 1..6 loop
 insert into public.customers(agency_id,first_name,last_name,identification_number,phone,email,address,notes)
 values(agency,names[i][1],names[i][2],lpad(i::text,9,'0'),'050-000-'||lpad(i::text,4,'0'),'customer'||i||'@example.invalid','רחוב הדוגמה 1, עיר לדוגמה','נתונים בדיוניים בלבד')
 on conflict(agency_id,identification_number) do update set notes=excluded.notes returning id into customer;
 insert into public.policies(agency_id,customer_id,insurance_company,policy_number,insurance_type,start_date,end_date,premium,status)
 values(agency,customer,(array['הראל','מגדל','הפניקס','כלל','מנורה מבטחים','איילון'])[i],'DEMO-'||i,(array['רכב','דירה','חיים','בריאות','עסק','נסיעות'])[i],current_date-330,current_date+(i*5),1200+i*300,'עומדת לחידוש')
 on conflict(agency_id,insurance_company,policy_number) do nothing;
 if not exists(select 1 from public.tasks where agency_id=agency and customer_id=customer and title='שיחת חידוש — הדגמה') then
 insert into public.tasks(agency_id,customer_id,title,due_date,priority) values(agency,customer,'שיחת חידוש — הדגמה',current_date+i-2,'רגילה');
 end if;
 end loop;
end $$;
commit;
