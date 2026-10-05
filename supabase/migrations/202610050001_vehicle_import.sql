-- Incomplete source records retain missing values, never fabricated identifiers.
begin;
alter table public.customers drop constraint customers_last_name_check;
alter table public.customers add constraint customers_last_name_check check(char_length(btrim(last_name)) <= 80);
alter table public.customers drop constraint customers_identification_number_check;
alter table public.customers add constraint customers_identification_number_check check(identification_number = '' or identification_number ~ '^[0-9]{9}$');
alter table public.customers drop constraint customers_phone_check;
alter table public.customers add constraint customers_phone_check check(phone = '' or phone ~ '^[+0-9 ()-]{7,25}$');
alter table public.customers drop constraint customers_agency_id_identification_number_key;
create unique index customers_agency_identification_present on public.customers(agency_id,identification_number) where identification_number <> '';
alter table public.customers add column import_key text not null default '' check(char_length(import_key) <= 700);
create unique index customers_agency_import_key on public.customers(agency_id,import_key) where import_key <> '';

alter table public.policies drop constraint policies_policy_number_check;
alter table public.policies add constraint policies_policy_number_check check(char_length(btrim(policy_number)) <= 100);
alter table public.policies drop constraint policies_agency_id_insurance_company_policy_number_key;
create unique index policies_agency_number_present on public.policies(agency_id,insurance_company,policy_number) where policy_number <> '';
alter table public.policies alter column premium drop not null;
alter table public.policies add column vehicle_registration text not null default '' check(char_length(vehicle_registration) <= 50);
alter table public.policies add column compulsory_value text not null default '' check(char_length(compulsory_value) <= 300);
alter table public.policies add column comprehensive_value text not null default '' check(char_length(comprehensive_value) <= 300);
alter table public.policies add column commission text not null default '' check(char_length(commission) <= 300);
alter table public.policies add column import_key text not null default '' check(char_length(import_key) <= 700);
create unique index policies_agency_import_key on public.policies(agency_id,import_key) where import_key <> '';
-- Existing RLS, agency-scoped foreign keys and audit triggers continue to apply.
commit;
