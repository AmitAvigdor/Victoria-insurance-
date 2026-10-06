import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const db = new PGlite()
let n = 0
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222'
const u = '33b05868-fc18-4c14-91a7-5c935f3a5ea8',
  v = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  w = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const s = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  t = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  z = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const c = '10000000-0000-4000-8000-000000000001',
  d = '40000000-0000-4000-8000-000000000001'
const test = async (name, fn) => {
  await fn()
  n++
  console.log('PASS ' + name)
}
async function denied(sql, code = '42501') {
  await assert.rejects(db.exec(sql), (e) => e.code === code)
}
async function rows(sql, count) {
  assert.equal((await db.query(sql)).rows.length, count)
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key); create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security; grant usage on schema storage to authenticated,anon;
 grant select,insert,update,delete on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 create function storage.filename(name text) returns text language sql as $$select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)]$$;`)
  for (const name of ['202610040001_initial.sql', '202610050001_vehicle_import.sql'])
    await db.exec(
      await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
    )
  await db.exec(
    `insert into auth.users values('${u}'),('${v}'),('${w}');insert into auth.sessions(id,user_id) values('${s}','${u}'),('${t}','${v}'),('${z}','${w}');insert into public.agencies(id,name) values('${a}','A'),('${b}','B');insert into public.profiles(id,agency_id,full_name) values('${u}','${a}','Owner'),('${v}','${a}','Colleague'),('${w}','${b}','Other');insert into public.customers(id,agency_id,first_name,last_name,identification_number,phone) values('${c}','${a}','Test','','','');insert into public.documents(id,agency_id,customer_id,file_name,file_path,document_type,file_size,mime_type,uploaded_by) values('${d}','${a}','${c}','test.pdf','${a}/${c}/${d}.pdf','policy',100,'application/pdf','${u}');insert into storage.objects(bucket_id,name) values('customer-documents','${a}/${c}/${d}.pdf');`,
  )
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610060001_security_hardening.sql', import.meta.url),
      'utf8',
    ),
  )
  await test('existing owner promoted, colleague least privilege, old file accurately labeled unscanned', async () => {
    assert.equal(
      (await db.query(`select role from public.profiles where id='${u}'`)).rows[0].role,
      'admin',
    )
    assert.equal(
      (await db.query(`select role from public.profiles where id='${v}'`)).rows[0].role,
      'viewer',
    )
    assert.equal(
      (await db.query(`select scan_status from public.documents where id='${d}'`)).rows[0]
        .scan_status,
      'unscanned',
    )
  })
  const as = async (user, session) =>
    db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);select set_config('request.jwt.claim.session_id','${session}',false)`,
    )
  await as(u, s)
  await test('active admin can read data', () => rows('select * from public.customers', 1))
  await test('uploader can explicitly authorize downloading their own unscanned document', () =>
    rows(`select public.request_document_access('${d}',true)`, 1))
  await test('pending document cannot be accessed', () =>
    denied(`select public.request_document_access('${d}')`))
  await test('no direct storage read or deletion, even admin', async () => {
    await rows('select * from storage.objects', 0)
    await rows('delete from storage.objects returning id', 0)
  })
  await test('no direct storage upload', () =>
    denied(
      `insert into storage.objects(bucket_id,name) values('customer-documents','${a}/${c}/50000000-0000-4000-8000-000000000001.pdf')`,
    ))
  await test('no direct document deletion or scan-status changes', async () => {
    await denied(`delete from public.documents where id='${d}'`)
    await denied(`update public.documents set scan_status='clean' where id='${d}'`)
  })
  await test('last admin cannot be demoted', () =>
    denied(`select public.set_member_role('${u}','viewer')`))
  await as(v, t)
  await test('viewer reads but cannot alter records', async () => {
    await rows('select * from public.customers', 1)
    await rows(`update public.customers set notes='forbidden' returning id`, 0)
  })
  await test('viewer cannot self-promote or archive or upload', async () => {
    await denied(`select public.set_member_role('${v}','admin')`)
    await denied(`select public.archive_document('${d}',true)`)
    await denied(`select public.authorize_document_request('upload')`)
  })
  await test('viewer cannot access another user unscanned file even with consent', () =>
    denied(`select public.request_document_access('${d}',true)`))
  await as(u, s)
  await test('admin assigns editor in own agency only', async () => {
    await db.exec(`select public.set_member_role('${v}','editor')`)
    await denied(`select public.set_member_role('${w}','editor')`)
  })
  await as(v, t)
  await test('editor can edit but cannot delete documents', async () => {
    await rows(`update public.customers set notes='allowed' returning id`, 1)
    await denied(`select public.archive_document('${d}',true)`)
  })
  await as(u, s)
  await test('archive is audited, reversible, retains bytes and idempotent', async () => {
    await db.exec(
      `select public.archive_document('${d}',true);select public.archive_document('${d}',true)`,
    )
    await rows(`select * from public.activities where action_type='documents.archive'`, 1)
    await db.exec(`reset role`)
    await rows('select * from storage.objects', 1)
    await as(u, s)
    await db.exec(`select public.archive_document('${d}',false)`)
    await rows(`select * from public.activities where action_type='documents.restore'`, 1)
  })
  await db.exec(`reset role;update public.documents set scan_status='clean' where id='${d}'`)
  await as(u, s)
  await test('clean access is audited', async () => {
    await rows(`select public.request_document_access('${d}')`, 1)
    await rows(`select * from public.activities where action_type='documents.access'`, 2)
  })
  await test('archived clean file is inaccessible', async () => {
    await db.exec(`select public.archive_document('${d}',true)`)
    await denied(`select public.request_document_access('${d}')`)
    await db.exec(`select public.archive_document('${d}',false)`)
  })
  await as(w, z)
  await test('foreign agency cannot read, access, archive, restore or alter roles', async () => {
    await rows('select * from public.customers', 0)
    await denied(`select public.request_document_access('${d}')`)
    await denied(`select public.archive_document('${d}',false)`)
    await denied(`select public.set_member_role('${u}','viewer')`)
  })
  await as(u, s)
  await test('upload rate cap is enforced in database', async () => {
    for (let i = 0; i < 10; i++) await db.exec(`select public.authorize_document_request('upload')`)
    await denied(`select public.authorize_document_request('upload')`, '54000')
  })
  await db.exec(
    `reset role;update auth.sessions set created_at=now()-interval '9 hours' where id='${s}'`,
  )
  await as(u, s)
  await test('eight-hour session limit blocks data and privileged RPCs', async () => {
    await rows('select * from public.customers', 0)
    await denied(`select public.archive_document('${d}',true)`)
    await denied(`select public.authorize_document_request('access')`)
  })
  await db.exec(`reset role;delete from auth.sessions where id='${s}'`)
  await as(u, s)
  await test('revoked session JWT cannot access data', () =>
    rows('select * from public.customers', 0))
  console.log(`${n} hardening checks passed`)
} finally {
  await db.close()
}
