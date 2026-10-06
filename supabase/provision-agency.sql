-- Run with the SQL Editor / trusted database administrator. NEVER from the browser.
-- 1. Create/invite the user in Supabase Dashboard > Authentication > Users.
-- 2. Change the agency/user names if needed.
-- 3. Run this transaction once. Additional users can be inserted into profiles with
--    the same agency_id by the administrator; users cannot self-assign agencies.
begin;

insert into public.agencies(id,name)
values('11111111-1111-4111-8111-111111111111','הסוכנות שלי')
on conflict (id) do update
set name = excluded.name;

insert into public.profiles(id,agency_id,full_name,role)
values('33b05868-fc18-4c14-91a7-5c935f3a5ea8','11111111-1111-4111-8111-111111111111','שם הסוכן','admin')
on conflict (id) do update
set agency_id = excluded.agency_id,
    full_name = excluded.full_name,
    role = excluded.role;

commit;
