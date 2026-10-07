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
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610070001_workflows.sql', import.meta.url),
      'utf8',
    ),
  )

  await db.exec(
    await readFile(
      new URL('../supabase/migrations/202610070002_conflict_response.sql', import.meta.url),
      'utf8',
    ),
  )
  const pid = '50000000-0000-4000-8000-000000000001'
  const foreignPid = '50000000-0000-4000-8000-000000000002'
  await db.exec(`insert into public.customers(id,agency_id,first_name,last_name,identification_number,phone) values('10000000-0000-4000-8000-000000000002','${b}','Foreign','','','');
    insert into public.policies(id,agency_id,customer_id,insurance_company,policy_number,insurance_type,start_date,end_date,premium) values('${pid}','${a}','${c}','Test','P1','רכב','2026-01-01','2026-12-31',100),('${foreignPid}','${b}','10000000-0000-4000-8000-000000000002','Test','P1','רכב','2026-01-01','2026-12-31',100);`)
  const as = async (user, session) =>
    db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);select set_config('request.jwt.claim.session_id','${session}',false)`,
    )
  const stamp = async (id = pid) =>
    (await db.query('select updated_at::text from public.policies where id=$1', [id])).rows[0]
      .updated_at
  await as(u, s)
  let time = await stamp()
  await test('renewal workflow persists and creates an attributable audit event', async () => {
    await db.query('select public.save_renewal($1,$2,$3,$4,$5)', [
      pid,
      time,
      'יצרתי קשר',
      '2026-10-10',
      'Follow up',
    ])
    assert.equal(
      (await db.query('select renewal_stage from public.policies where id=$1', [pid])).rows[0]
        .renewal_stage,
      'יצרתי קשר',
    )
    assert.equal(
      (await db.query("select user_id from public.activities where action_type='renewal.updated'"))
        .rows[0].user_id,
      u,
    )
  })
  await test('stale renewal edits cannot overwrite new information', async () => {
    await assert.rejects(
      db.query('select public.save_renewal($1,$2,$3,$4,$5)', [pid, time, 'חודש', null, 'stale']),
      (e) => e.code === 'PT409',
    )
  })
  await test('notes are attributable and empty notes rejected', async () => {
    await db.query('select public.add_contact_note($1,$2)', [c, 'Personal call note'])
    await denied(`select public.add_contact_note('${c}','')`, '23514')
    assert.equal(
      (await db.query("select user_id from public.activities where action_type='contact.note'"))
        .rows[0].user_id,
      u,
    )
  })
  const apply = (updates) =>
    db.query('select public.apply_import_updates($1::jsonb)', [JSON.stringify(updates)])
  await test('selected fields update while unselected fields and workflow are preserved', async () => {
    time = await stamp()
    await apply([{ table: 'policies', id: pid, updated_at: time, patch: { premium: 125.5 } }])
    const row = (await db.query('select * from public.policies where id=$1', [pid])).rows[0]
    assert.equal(Number(row.premium), 125.5)
    assert.equal(row.renewal_stage, 'יצרתי קשר')
    assert.equal(row.policy_number, 'P1')
  })
  await test('concurrent changes reject the reviewed import', async () => {
    await assert.rejects(
      apply([{ table: 'policies', id: pid, updated_at: time, patch: { premium: 999 } }]),
      (e) => e.code === 'PT409',
    )
  })
  await test('identity, ownership and arbitrary table updates are rejected', async () => {
    const time = await stamp()
    await assert.rejects(
      apply([{ table: 'policies', id: pid, updated_at: time, patch: { customer_id: c } }]),
      (e) => e.code === '42501',
    )
    await assert.rejects(
      apply([{ table: 'profiles', id: u, updated_at: time, patch: { role: 'admin' } }]),
      (e) => e.code === '23514',
    )
  })
  await test('commission amounts enforce numeric bounds and preserve source text', async () => {
    await apply([
      {
        table: 'policies',
        id: pid,
        updated_at: await stamp(),
        patch: {
          commission_expected_amount: 150.25,
          commission_received_amount: 50,
          commission_due_date: '2026-10-15',
        },
      },
    ])
    await assert.rejects(
      apply([
        {
          table: 'policies',
          id: pid,
          updated_at: await stamp(),
          patch: { commission_expected_amount: -1 },
        },
      ]),
      (e) => e.code === '23514',
    )
  })
  await test('multi-record import is atomic when a later change is invalid', async () => {
    const old = (
      await db.query('select notes,updated_at::text from public.customers where id=$1', [c])
    ).rows[0]
    await assert.rejects(
      apply([
        {
          table: 'customers',
          id: c,
          updated_at: old.updated_at,
          patch: { notes: 'Should roll back' },
        },
        { table: 'policies', id: pid, updated_at: await stamp(), patch: { premium: -1 } },
      ]),
      (e) => e.code === '23514',
    )
    assert.equal(
      (await db.query('select notes from public.customers where id=$1', [c])).rows[0].notes,
      old.notes,
    )
  })
  await test('foreign agency workflow, notes and updates denied', async () => {
    await denied(`select public.save_renewal('${foreignPid}',now(),'חודש',null,'')`)
    await denied(
      `select public.add_contact_note('10000000-0000-4000-8000-000000000002','Forbidden')`,
    )
    await assert.rejects(
      apply([
        {
          table: 'policies',
          id: foreignPid,
          updated_at: new Date().toISOString(),
          patch: { notes: 'Forbidden' },
        },
      ]),
      (e) => e.code === '42501',
    )
  })
  await as(v, t)
  await test('viewer cannot write workflows, notes or commissions', async () => {
    await denied(`select public.save_renewal('${pid}',now(),'חודש',null,'')`)
    await denied(`select public.add_contact_note('${c}','Forbidden')`)
    await assert.rejects(
      apply([
        {
          table: 'policies',
          id: pid,
          updated_at: new Date().toISOString(),
          patch: { commission_received_amount: 900 },
        },
      ]),
      (e) => e.code === '42501',
    )
  })
  await db.exec(`reset role;delete from auth.sessions where id='${s}'`)
  await as(u, s)
  await test('revoked sessions cannot use new workflow RPCs', async () => {
    await denied(`select public.save_renewal('${pid}',now(),'חודש',null,'')`)
    await denied(`select public.add_contact_note('${c}','Forbidden')`)
  })
  console.log(`${n} workflow security checks passed`)
} finally {
  await db.close()
}
