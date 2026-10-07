// Explicit opt-in integration test. Creates only temporary agencies/users and cleans them up.
// Administrator keys and passwords stay in process memory, never in the browser bundle or logs.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

if (process.env.CONFIRM_HOSTED_TEST !== 'true') {
  throw new Error('Set CONFIRM_HOSTED_TEST=true to create and remove isolated hosted test data.')
}
process.loadEnvFile('.env')
const url = process.env.VITE_SUPABASE_URL
const publicKey = process.env.VITE_SUPABASE_ANON_KEY
const cli = process.env.SUPABASE_CLI || 'supabase'
const ref = new URL(url).hostname.split('.')[0]
const keys = JSON.parse(
  execFileSync(
    cli,
    ['projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ),
)
const adminKey =
  keys.find((k) => k.type === 'secret')?.api_key ||
  keys.find((k) => k.name === 'service_role')?.api_key
assert.ok(adminKey, 'Administrator access is required for temporary fixtures')
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(30000) }),
  },
}
const admin = createClient(url, adminKey, options)
const client = () => createClient(url, publicKey, options)
const agencies = [randomUUID(), randomUUID()]
const users = []
const paths = new Set()
let checks = 0
function ok(result) {
  if (result.error) throw new Error(`${result.error.code || 'API'}: ${result.error.message}`)
  return result.data
}
async function check(name, fn) {
  await fn()
  checks++
  console.log(`PASS ${name}`)
}
async function runUI(env) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--project=chromium',
        '--workers=1',
        ...(process.env.E2E_GREP ? ['--grep', process.env.E2E_GREP] : []),
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, E2E_LIVE: 'true', ...env },
      },
    )
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Hosted browser checks failed')),
    )
  })
}
try {
  const bucket = ok(await admin.storage.getBucket('customer-documents'))
  await check('hosted document bucket is private and limits size', async () => {
    assert.equal(bucket.public, false)
    assert.equal(Number(bucket.file_size_limit), 10485760)
  })
  ok(
    await admin
      .from('agencies')
      .insert(agencies.map((id, i) => ({ id, name: `בדיקת ויקטוריה זמנית ${i + 1}` }))),
  )
  for (let i = 0; i < 4; i++) {
    const email = `victoria-qa-${randomUUID()}@example.invalid`
    const password = `V!${randomUUID()}a9`
    const data = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
    users.push({ id: data.user.id, email, password, client: client() })
    if (i < 3)
      ok(
        await admin.from('profiles').insert({
          id: data.user.id,
          agency_id: agencies[i === 2 ? 1 : 0],
          full_name: `סוכן בדיקה ${i + 1}`,
          role: i === 1 ? 'editor' : 'admin',
        }),
      )
    ok(await users[i].client.auth.signInWithPassword({ email, password }))
  }
  const [a, colleague, b, unassigned] = users.map((u) => u.client)
  await check('password login succeeds and wrong password is rejected', async () => {
    assert.ok(
      (await client().auth.signInWithPassword({ email: users[0].email, password: randomUUID() }))
        .error,
    )
    assert.equal(ok(await a.auth.getUser()).user.id, users[0].id)
  })
  const customerInput = (agency, number) => ({
    agency_id: agency,
    first_name: 'בדיקת',
    last_name: 'הרשאות',
    identification_number: number,
    phone: '0500000000',
  })
  const ca = ok(
    await a.from('customers').insert(customerInput(agencies[0], '000009990')).select().single(),
  )
  const cb = ok(
    await b.from('customers').insert(customerInput(agencies[1], '000009990')).select().single(),
  )
  await check('colleagues in the same agency share and edit a customer', async () => {
    assert.equal(ok(await colleague.from('customers').select('id').eq('id', ca.id)).length, 1)
    ok(await colleague.from('customers').update({ notes: 'Shared edit verified' }).eq('id', ca.id))
    assert.equal(
      ok(await a.from('customers').select('notes').eq('id', ca.id).single()).notes,
      'Shared edit verified',
    )
  })
  await check('cross-agency writes and membership changes denied', async () => {
    assert.ok((await a.from('customers').insert(customerInput(agencies[1], '000009991'))).error)
    assert.deepEqual(
      ok(await a.from('customers').update({ notes: 'forbidden' }).eq('id', cb.id).select()),
      [],
    )
    assert.ok(
      (await a.from('profiles').update({ agency_id: agencies[1] }).eq('id', users[0].id)).error,
    )
  })
  await check('anonymous and unassigned users have no customer access', async () => {
    assert.ok((await client().from('customers').select('*')).error)
    assert.deepEqual(ok(await unassigned.from('customers').select('*')), [])
  })
  const now = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)
  const policyInput = {
    agency_id: agencies[0],
    customer_id: ca.id,
    insurance_company: 'חברת בדיקה',
    policy_number: 'HOSTED-QA',
    insurance_type: 'רכב',
    start_date: now,
    end_date: end,
    premium: 100,
  }
  const policy = ok(await a.from('policies').insert(policyInput).select().single())

  await check(
    'renewal and contact-note RPCs are audited, conflict-aware and agency scoped',
    async () => {
      ok(
        await a.rpc('save_renewal', {
          policy_id: policy.id,
          expected_updated_at: policy.updated_at,
          stage: 'יצרתי קשר',
          follow_up: now,
          note: 'Fictional workflow note',
        }),
      )
      assert.equal(
        (
          await a.rpc('save_renewal', {
            policy_id: policy.id,
            expected_updated_at: policy.updated_at,
            stage: 'חודש',
            follow_up: null,
            note: 'stale',
          })
        ).error?.code,
        'PT409',
      )
      ok(await a.rpc('add_contact_note', { customer_id: ca.id, note: 'Fictional contact note' }))
      assert.ok((await b.rpc('add_contact_note', { customer_id: ca.id, note: 'forbidden' })).error)
      assert.ok(
        (
          await b.rpc('save_renewal', {
            policy_id: policy.id,
            expected_updated_at: policy.updated_at,
            stage: 'חודש',
            follow_up: null,
            note: '',
          })
        ).error,
      )
      const events = ok(
        await a.from('activities').select('action_type,user_id').eq('customer_id', ca.id),
      )
      assert.ok(
        events.some((e) => e.action_type === 'renewal.updated' && e.user_id === users[0].id),
      )
      assert.ok(events.some((e) => e.action_type === 'contact.note' && e.user_id === users[0].id))
    },
  )
  await check(
    'reviewed imports and commission updates preserve unselected fields and reject stale writes',
    async () => {
      const current = ok(await a.from('policies').select('*').eq('id', policy.id).single())
      const change = {
        table: 'policies',
        id: policy.id,
        updated_at: current.updated_at,
        patch: {
          commission_expected_amount: 150.25,
          commission_received_amount: 50,
          commission_due_date: now,
        },
      }
      ok(await a.rpc('apply_import_updates', { updates: [change] }))
      const updated = ok(await a.from('policies').select('*').eq('id', policy.id).single())
      assert.equal(Number(updated.commission_expected_amount), 150.25)
      assert.equal(updated.premium, current.premium)
      assert.equal(updated.renewal_stage, 'יצרתי קשר')
      assert.equal(
        (await a.rpc('apply_import_updates', { updates: [change] })).error?.code,
        'PT409',
      )
      assert.ok(
        (
          await b.rpc('apply_import_updates', {
            updates: [{ ...change, updated_at: updated.updated_at }],
          })
        ).error,
      )
      assert.ok(
        (
          await a.rpc('apply_import_updates', {
            updates: [
              { ...change, updated_at: updated.updated_at, patch: { agency_id: agencies[1] } },
            ],
          })
        ).error,
      )
    },
  )
  await check(
    'vehicle imports preserve missing identifiers and raw values with duplicate protection',
    async () => {
      const inputs = ['first', 'second'].map((key) => ({
        agency_id: agencies[0],
        first_name: 'בדיקת רכב',
        last_name: '',
        identification_number: '',
        phone: '',
        import_key: `hosted-vehicle-${key}`,
      }))
      const imported = ok(await a.from('customers').insert(inputs).select())
      assert.equal(imported.length, 2)
      assert.equal((await a.from('customers').insert(inputs[0])).error?.code, '23505')
      const raw = {
        ...policyInput,
        customer_id: imported[0].id,
        policy_number: '',
        premium: null,
        vehicle_registration: '12-345-67',
        compulsory_value: '1,200',
        comprehensive_value: 'יש כיסוי',
        commission: '12%',
        import_key: 'hosted-vehicle-policy',
      }
      const saved = ok(await a.from('policies').insert(raw).select().single())
      assert.equal(saved.premium, null)
      assert.equal(saved.policy_number, '')
      assert.equal(saved.compulsory_value, '1,200')
      assert.equal(saved.comprehensive_value, 'יש כיסוי')
      assert.equal(saved.commission, '12%')
      assert.equal((await a.from('policies').insert(raw)).error?.code, '23505')
      assert.deepEqual(ok(await b.from('customers').select('id').eq('id', imported[0].id)), [])
      assert.deepEqual(ok(await b.from('policies').select('id').eq('id', saved.id)), [])
      assert.ok(
        (
          await a
            .from('policies')
            .insert({ ...raw, import_key: 'foreign-vehicle', customer_id: cb.id })
        ).error,
      )
    },
  )
  await check('policy edits persist and cross-agency customer links are rejected', async () => {
    ok(await colleague.from('policies').update({ premium: 200 }).eq('id', policy.id))
    assert.equal(
      ok(await a.from('policies').select('premium').eq('id', policy.id).single()).premium,
      200,
    )
    assert.ok(
      (
        await a
          .from('policies')
          .insert({ ...policyInput, policy_number: 'BAD-LINK', customer_id: cb.id })
      ).error,
    )
  })
  const task = ok(
    await a
      .from('tasks')
      .insert({
        agency_id: agencies[0],
        customer_id: ca.id,
        policy_id: policy.id,
        title: 'בדיקת משימה',
        due_date: now,
      })
      .select()
      .single(),
  )
  await check('task completion and customer archive/restore are audited', async () => {
    ok(await a.from('tasks').update({ status: 'הושלמה' }).eq('id', task.id))
    ok(await a.from('customers').update({ archived_at: new Date().toISOString() }).eq('id', ca.id))
    assert.ok(
      ok(await a.from('customers').select('archived_at').eq('id', ca.id).single()).archived_at,
    )
    ok(await a.from('customers').update({ archived_at: null }).eq('id', ca.id))
    const events = ok(
      await a.from('activities').select('description').eq('customer_id', ca.id),
    ).map((r) => r.description)
    assert.ok(events.includes('הושלמה משימה: בדיקת משימה'))
    assert.ok(events.includes('הלקוח שוחזר מהארכיון'))
    assert.ok(
      (
        await a
          .from('activities')
          .insert({ agency_id: agencies[0], description: 'forged', action_type: 'fake' })
      ).error,
    )
  })
  const bytes = await readFile('tests/fixtures/fictional-policy.pdf')
  const documentId = randomUUID()
  const filePath = `${agencies[0]}/${ca.id}/${documentId}.pdf`
  paths.add(filePath)
  ok(
    await admin.storage
      .from('customer-documents')
      .upload(filePath, bytes, { contentType: 'application/pdf', upsert: false }),
  )
  ok(
    await admin.from('documents').insert({
      id: documentId,
      agency_id: agencies[0],
      customer_id: ca.id,
      policy_id: policy.id,
      file_name: 'fictional-policy.pdf',
      file_path: filePath,
      document_type: 'פוליסה',
      file_size: bytes.length,
      mime_type: 'application/pdf',
      uploaded_by: users[0].id,
    }),
  )
  // Populate both sides before checking isolation: empty tables cannot prove RLS.
  const otherPolicy = ok(
    await b
      .from('policies')
      .insert({ ...policyInput, agency_id: agencies[1], customer_id: cb.id })
      .select()
      .single(),
  )
  ok(
    await b.from('tasks').insert({
      agency_id: agencies[1],
      customer_id: cb.id,
      policy_id: otherPolicy.id,
      title: 'בדיקת סוכנות שנייה',
      due_date: now,
    }),
  )
  const otherDocument = randomUUID()
  const otherPath = `${agencies[1]}/${cb.id}/${otherDocument}.pdf`
  paths.add(otherPath)
  ok(
    await admin.storage
      .from('customer-documents')
      .upload(otherPath, bytes, { contentType: 'application/pdf' }),
  )
  ok(
    await admin.from('documents').insert({
      id: otherDocument,
      agency_id: agencies[1],
      customer_id: cb.id,
      policy_id: otherPolicy.id,
      file_name: 'other-agency.pdf',
      file_path: otherPath,
      document_type: 'פוליסה',
      file_size: bytes.length,
      mime_type: 'application/pdf',
      uploaded_by: users[2].id,
    }),
  )
  for (const table of [
    'agencies',
    'profiles',
    'customers',
    'policies',
    'tasks',
    'documents',
    'activities',
  ]) {
    await check(`${table}: populated agencies isolated through hosted REST`, async () => {
      const field = table === 'agencies' ? 'id' : 'agency_id'
      assert.ok(ok(await a.from(table).select('id').eq(field, agencies[0])).length > 0)
      assert.ok(ok(await b.from(table).select('id').eq(field, agencies[1])).length > 0)
      assert.deepEqual(ok(await a.from(table).select('*').eq(field, agencies[1])), [])
      assert.deepEqual(ok(await b.from(table).select('*').eq(field, agencies[0])), [])
    })
  }
  async function endpoint(who, body) {
    const session = ok(await who.auth.getSession()).session
    return fetch(url + '/functions/v1/documents', {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${session.access_token}`,
        Origin: 'https://victoria-insurance-tau.vercel.app',
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    })
  }
  const settings = await (
    await fetch(url + '/auth/v1/settings', { headers: { apikey: publicKey } })
  ).json()
  await check('public signup disabled, email verification retained', async () => {
    assert.equal(settings.disable_signup, true)
    assert.equal(settings.mailer_autoconfirm, false)
  })
  await check(
    'browser cannot directly read, sign, upload, overwrite or delete stored documents',
    async () => {
      assert.ok((await a.storage.from('customer-documents').createSignedUrl(filePath, 60)).error)
      assert.ok((await a.storage.from('customer-documents').download(filePath)).error)
      assert.ok(
        (
          await a.storage
            .from('customer-documents')
            .upload(filePath + 'x', bytes, { contentType: 'application/pdf' })
        ).error,
      )
      assert.ok(
        (
          await a.storage
            .from('customer-documents')
            .update(filePath, bytes, { contentType: 'application/pdf' })
        ).error,
      )
      await a.storage.from('customer-documents').remove([filePath])
      assert.ok(ok(await admin.storage.from('customer-documents').download(filePath)))
    },
  )
  await check(
    'unscanned personal download requires uploader consent, never grants colleagues or foreign users',
    async () => {
      assert.equal((await endpoint(a, { document_id: documentId })).status, 403)
      assert.equal(
        (await endpoint(colleague, { document_id: documentId, accept_unscanned: true })).status,
        403,
      )
      assert.equal(
        (await endpoint(b, { document_id: documentId, accept_unscanned: true })).status,
        403,
      )
    },
  )
  const response = await endpoint(a, { document_id: documentId, accept_unscanned: true })
  assert.equal(response.status, 200)
  const signed = (await response.json()).url
  const expiry = JSON.parse(
    Buffer.from(new URL(signed).searchParams.get('token').split('.')[1], 'base64url').toString(),
  ).exp
  await check('personal document uses attachment, exact bytes, and an audit event', async () => {
    const download = await fetch(signed)
    assert.equal(download.status, 200)
    assert.match(download.headers.get('content-disposition'), /attachment/)
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes)
    assert.ok(
      ok(await a.from('activities').select('id').eq('action_type', 'documents.access')).length,
    )
  })
  await check(
    'server upload validates content and attributes file to authenticated uploader',
    async () => {
      const invalid = new FormData()
      invalid.set('file', new File(['fake PDF'], 'fake.pdf', { type: 'application/pdf' }))
      invalid.set('customer_id', ca.id)
      invalid.set('document_type', 'test')
      assert.equal((await endpoint(a, invalid)).status, 400)
      const valid = new FormData()
      valid.set('file', new File([bytes], 'checked.pdf', { type: 'application/pdf' }))
      valid.set('customer_id', ca.id)
      valid.set('document_type', 'test')
      const uploaded = await endpoint(a, valid)
      assert.equal(uploaded.status, 201)
      const id = (await uploaded.json()).id
      const row = ok(await a.from('documents').select('*').eq('id', id).single())
      paths.add(row.file_path)
      assert.equal(row.uploaded_by, users[0].id)
      assert.equal(row.scan_status, 'unscanned')
      assert.match(row.content_sha256, /^[a-f0-9]{64}$/)
    },
  )
  await check(
    'document archive preserves bytes, is audited, denies new links, and restores',
    async () => {
      assert.ok(
        (await colleague.rpc('archive_document', { document_id: documentId, archived: true }))
          .error,
      )
      ok(await a.rpc('archive_document', { document_id: documentId, archived: true }))
      assert.equal(
        (await endpoint(a, { document_id: documentId, accept_unscanned: true })).status,
        403,
      )
      assert.ok(ok(await admin.storage.from('customer-documents').download(filePath)))
      assert.ok(
        ok(await a.from('activities').select('id').eq('action_type', 'documents.archive')).length,
      )
      ok(await a.rpc('archive_document', { document_id: documentId, archived: false }))
      assert.equal(
        (await endpoint(a, { document_id: documentId, accept_unscanned: true })).status,
        200,
      )
    },
  )
  await check('role changes are restricted and viewer writes denied immediately', async () => {
    assert.ok(
      (await colleague.rpc('set_member_role', { member_id: users[1].id, new_role: 'admin' })).error,
    )
    assert.ok(
      (await a.rpc('set_member_role', { member_id: users[2].id, new_role: 'editor' })).error,
    )
    assert.ok(
      (await a.rpc('set_member_role', { member_id: users[0].id, new_role: 'viewer' })).error,
    )
    ok(await a.rpc('set_member_role', { member_id: users[1].id, new_role: 'viewer' }))
    assert.deepEqual(
      ok(await colleague.from('customers').update({ notes: 'forbidden' }).eq('id', ca.id).select()),
      [],
    )
    assert.ok((await colleague.rpc('authorize_document_request', { operation: 'upload' })).error)
  })
  if (process.env.E2E_BASE_URL)
    await check('hosted production browser workflows and session isolation', () =>
      runUI({
        E2E_EMAIL: users[0].email,
        E2E_PASSWORD: users[0].password,
        E2E_OTHER_EMAIL: users[2].email,
        E2E_OTHER_PASSWORD: users[2].password,
      }),
    )
  await check('signed links expire after sixty seconds', async () => {
    const remaining = expiry * 1000 - Date.now() + 2000
    if (remaining > 0) {
      console.log(`Waiting ${Math.ceil(remaining / 1000)} seconds for signed-link expiry`)
      await new Promise((resolve) => setTimeout(resolve, remaining))
    }
    assert.ok(!(await fetch(signed, { headers: { 'Cache-Control': 'no-cache' } })).ok)
  })
  await check('sign-out revokes database access even with the old access token', async () => {
    const token = ok(await colleague.auth.getSession()).session.access_token
    ok(await colleague.auth.signOut())
    const r = await fetch(url + '/rest/v1/customers?select=id', {
      headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
    })
    const result = await r.json()
    assert.ok(r.status === 401 || (r.ok && Array.isArray(result) && result.length === 0))
  })
  console.log(`${checks} hosted checks passed`)
} finally {
  // Only remove UUIDs generated by this run. Never change an existing user's agency or data.
  for (const agency of agencies) {
    const customers = ok(await admin.from('customers').select('id').eq('agency_id', agency))
    for (const customer of customers) {
      const prefix = `${agency}/${customer.id}`
      for (const entry of ok(await admin.storage.from('customer-documents').list(prefix)))
        paths.add(`${prefix}/${entry.name}`)
    }
  }
  if (paths.size) ok(await admin.storage.from('customer-documents').remove([...paths]))
  for (const table of [
    'documents',
    'tasks',
    'policies',
    'activities',
    'customers',
    'profiles',
    'agencies',
  ]) {
    ok(
      await admin
        .from(table)
        .delete()
        .in(table === 'agencies' ? 'id' : 'agency_id', agencies),
    )
  }
  for (const user of users) ok(await admin.auth.admin.deleteUser(user.id))
  console.log('Temporary users, agencies, records and document files removed')
}
