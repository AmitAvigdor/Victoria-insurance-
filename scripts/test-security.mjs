import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const db = new PGlite()
let checks = 0
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222',
  u = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  v = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ca = '10000000-0000-4000-8000-000000000001',
  cb = '10000000-0000-4000-8000-000000000002',
  ca2 = '10000000-0000-4000-8000-000000000003',
  pa = '20000000-0000-4000-8000-000000000001',
  pb = '20000000-0000-4000-8000-000000000002',
  ta = '30000000-0000-4000-8000-000000000001',
  tb = '30000000-0000-4000-8000-000000000002',
  da = '40000000-0000-4000-8000-000000000001',
  dbId = '40000000-0000-4000-8000-000000000002'
async function test(name, fn) {
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
async function reject(sql, code) {
  try {
    await db.exec(sql)
    assert.fail('Expected rejection')
  } catch (e) {
    assert.equal(e.code, code, e.message)
  }
}
async function count(sql, expected) {
  const { rows } = await db.query(sql)
  assert.equal(rows.length, expected)
}
try {
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon; grant select,insert,update,delete on storage.objects to authenticated; create function storage.foldername(name text) returns text[] language sql as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$; create function storage.filename(name text) returns text language sql as $$select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;`,
  )
  await test('complete migration applies to PostgreSQL', async () =>
    db.exec(
      await readFile(
        new URL('../supabase/migrations/202610040001_initial.sql', import.meta.url),
        'utf8',
      ),
    ))
  await db.exec(
    `insert into auth.users values('${u}'),('${v}'); insert into public.agencies(id,name) values('${a}','Agency A'),('${b}','Agency B'); insert into public.profiles(id,agency_id,full_name) values('${u}','${a}','Agent A'),('${v}','${b}','Agent B'); insert into public.customers(id,agency_id,first_name,last_name,identification_number,phone) values('${ca}','${a}','דוד','כהן','000000001','0500000001'),('${cb}','${b}','נועה','לוי','000000001','0500000002'),('${ca2}','${a}','תמר','ברק','000000003','0500000003'); insert into public.policies(id,agency_id,customer_id,insurance_company,policy_number,insurance_type,start_date,end_date,premium) values('${pa}','${a}','${ca}','הראל','A1','רכב',current_date,current_date+10,100),('${pb}','${b}','${cb}','מגדל','B1','דירה',current_date,current_date+10,100); insert into public.tasks(id,agency_id,customer_id,policy_id,title,due_date) values('${ta}','${a}','${ca}','${pa}','A task',current_date),('${tb}','${b}','${cb}','${pb}','B task',current_date); insert into storage.objects(bucket_id,name) values('customer-documents','${a}/${ca}/${da}.pdf'),('customer-documents','${b}/${cb}/${dbId}.pdf'); insert into public.documents(id,agency_id,customer_id,file_name,file_path,document_type,file_size,mime_type,uploaded_by) values('${da}','${a}','${ca}','a.pdf','${a}/${ca}/${da}.pdf','פוליסה',100,'application/pdf','${u}'),('${dbId}','${b}','${cb}','b.pdf','${b}/${cb}/${dbId}.pdf','פוליסה',100,'application/pdf','${v}'); set role authenticated; select set_config('request.jwt.claim.sub','${u}',false);`,
  )
  await test('agency derives from authenticated user', async () =>
    assert.equal((await db.query('select public.current_agency_id() as id')).rows[0].id, a))
  for (const table of [
    'agencies',
    'profiles',
    'customers',
    'policies',
    'tasks',
    'documents',
    'activities',
  ])
    await test(`${table}: foreign agency invisible`, () =>
      count(
        `select * from public.${table} where ${table === 'agencies' ? 'id' : 'agency_id'}='${b}'`,
        0,
      ))
  await test('own customers visible', () => count('select * from public.customers', 2))
  await test('spoofed agency insert rejected', () =>
    reject(
      `insert into public.customers(agency_id,first_name,last_name,identification_number,phone) values('${b}','זיוף','דוגמה','000000004','0500000004')`,
      '42501',
    ))
  await test('cross-agency update changes zero rows', () =>
    count(`update public.customers set first_name='hack' where id='${cb}' returning id`, 0))
  await test('cannot move customer between agencies', () =>
    reject(`update public.customers set agency_id='${b}' where id='${ca}'`, '42501'))
  await test('cannot change own agency membership', () =>
    reject(`update public.profiles set agency_id='${b}' where id='${u}'`, '42501'))
  await test('cannot create own privileged profile', () =>
    reject(
      `insert into public.profiles(id,agency_id,full_name) values(gen_random_uuid(),'${b}','Attacker')`,
      '42501',
    ))
  await test('cross-tenant policy link rejected by composite FK', () =>
    reject(
      `insert into public.policies(agency_id,customer_id,insurance_company,policy_number,insurance_type,start_date,end_date,premium) values('${a}','${cb}','Demo','cross','רכב',current_date,current_date,0)`,
      '23503',
    ))
  await test('same-agency wrong customer task/policy link rejected', () =>
    reject(
      `insert into public.tasks(agency_id,customer_id,policy_id,title,due_date) values('${a}','${ca2}','${pa}','Wrong link',current_date)`,
      '23503',
    ))
  await test('task policy requires customer', () =>
    reject(
      `insert into public.tasks(agency_id,policy_id,title,due_date) values('${a}','${pa}','No customer',current_date)`,
      '23514',
    ))
  await test('valid own-tenant task completion works', () =>
    count(`update public.tasks set status='הושלמה' where id='${ta}' returning id`, 1))
  await test('completion is audited transactionally', () =>
    count(
      `select * from public.activities where customer_id='${ca}' and description='הושלמה משימה: A task'`,
      1,
    ))
  await test('customer editing and archival work', () =>
    count(
      `update public.customers set notes='Updated',archived_at=now() where id='${ca}' returning id`,
      1,
    ))
  await test('policy customer is immutable', () =>
    reject(`update public.policies set customer_id='${ca2}' where id='${pa}'`, '42501'))
  await test('cannot forge audit event', () =>
    reject(
      `insert into public.activities(agency_id,customer_id,action_type,description) values('${a}','${ca}','fake','Fake')`,
      '42501',
    ))
  await test('cannot erase audit history', () => reject('delete from public.activities', '42501'))
  await test('document uploader cannot be spoofed', () =>
    reject(
      `insert into public.documents(id,agency_id,customer_id,file_name,file_path,document_type,file_size,mime_type,uploaded_by) values('40000000-0000-4000-8000-000000000003','${a}','${ca}','c.pdf','${a}/${ca}/40000000-0000-4000-8000-000000000003.pdf','Demo',100,'application/pdf','${v}')`,
      '42501',
    ))
  await test('document path cannot reference another tenant', () =>
    reject(
      `insert into public.documents(id,agency_id,customer_id,file_name,file_path,document_type,file_size,mime_type,uploaded_by) values('40000000-0000-4000-8000-000000000003','${a}','${ca}','c.pdf','${b}/${ca}/40000000-0000-4000-8000-000000000003.pdf','Demo',100,'application/pdf','${u}')`,
      '23514',
    ))
  await test('foreign storage objects invisible', () =>
    count(`select * from storage.objects where name like '${b}/%'`, 0))
  await test('foreign storage upload rejected', () =>
    reject(
      `insert into storage.objects(bucket_id,name) values('customer-documents','${b}/${cb}/${da}.pdf')`,
      '42501',
    ))
  await test('foreign-customer storage upload rejected', () =>
    reject(
      `insert into storage.objects(bucket_id,name) values('customer-documents','${a}/${cb}/${da}.pdf')`,
      '42501',
    ))
  await test('invalid storage extension rejected', () =>
    reject(
      `insert into storage.objects(bucket_id,name) values('customer-documents','${a}/${ca}/${da}.html')`,
      '42501',
    ))
  await test('own-tenant storage upload works', () =>
    count(
      `insert into storage.objects(bucket_id,name) values('customer-documents','${a}/${ca}/40000000-0000-4000-8000-000000000003.pdf') returning id`,
      1,
    ))
  await test('foreign document deletion changes zero rows', () =>
    count(`delete from public.documents where id='${dbId}' returning id`, 0))
  await test('foreign storage deletion changes zero rows', () =>
    count(`delete from storage.objects where name like '${b}/%' returning id`, 0))
  await test('storage overwrite prohibited', () =>
    count(`update storage.objects set name='overwrite' returning id`, 0))
  await test('own document delete works and is audited', async () => {
    await count(`delete from public.documents where id='${da}' returning id`, 1)
    await count(`select * from public.activities where action_type='documents.delete'`, 1)
  })
  await db.exec(`select set_config('request.jwt.claim.sub','${v}',false)`)
  await test('second agency sees only its customer', () =>
    count(`select * from public.customers where agency_id='${b}'`, 1))
  await test('second agency cannot see first agency', () =>
    count(`select * from public.customers where agency_id='${a}'`, 0))
  await db.exec(
    `select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false)`,
  )
  await test('unprovisioned authenticated user sees no records', () =>
    count('select * from public.customers', 0))
  await db.exec('reset role; set role anon;')
  await test('anonymous database access denied', () =>
    reject('select * from public.customers', '42501'))
  await test('anonymous storage access denied', () =>
    reject('select * from storage.objects', '42501'))
  await db.exec('reset role')
  await test('bucket is private', async () =>
    assert.equal(
      (await db.query("select public from storage.buckets where id='customer-documents'")).rows[0]
        .public,
      false,
    ))
  console.log(
    `\n${checks} security checks passed. PostgreSQL executed with stubbed Supabase auth/storage schemas; hosted Auth and Storage APIs still require integration verification.`,
  )
} finally {
  await db.close()
}
