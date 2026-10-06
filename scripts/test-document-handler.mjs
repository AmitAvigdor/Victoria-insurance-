import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHandler, matchesSignature } from '../supabase/functions/documents/handler.mjs'
function setup({ authorized = true, permitted = true, clean = false } = {}) {
  const calls = []
  const query = {
    select() {
      return this
    },
    eq() {
      return this
    },
    async single() {
      return { data: { id: 'customer' } }
    },
  }
  const storage = {
    async upload() {
      calls.push('upload')
      return { data: {} }
    },
    async remove() {
      calls.push('remove')
      return { data: {} }
    },
    async createSignedUrl() {
      calls.push('signed')
      return { data: { signedUrl: 'https://example.invalid/signed' } }
    },
  }
  const user = {
    auth: {
      async getUser() {
        return authorized ? { data: { user: { id: 'user' } } } : { error: {}, data: { user: null } }
      },
    },
    from() {
      return query
    },
    async rpc(name) {
      if (!permitted) return { error: { code: '42501' } }
      return name === 'authorize_document_request'
        ? { data: { agency_id: 'agency', user_id: 'user', role: 'editor' } }
        : clean
          ? {
              data: {
                agency_id: 'agency',
                scan_status: 'clean',
                file_path: 'path',
                file_name: 'test.pdf',
              },
            }
          : { error: { code: '42501' } }
    },
  }
  const admin = {
    storage: {
      from() {
        return storage
      },
    },
    from() {
      return {
        async insert(row) {
          calls.push(row)
          return { data: {} }
        },
      }
    },
  }
  const handler = createHandler({
    createClient: (_url, key) => (key === 'public' ? user : admin),
    url: 'https://example.invalid',
    publicKey: 'public',
    secretKey: 'secret',
    origins: ['https://victoria-insurance-tau.vercel.app'],
  })
  const request = (body, headers = {}) =>
    new Request('https://example.invalid/documents', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-test-token', ...headers },
      body,
    })
  return { handler, calls, request }
}
test('unknown origin and missing authentication denied before storage', async () => {
  const x = setup()
  assert.equal((await x.handler(x.request('{}', { Origin: 'https://evil.invalid' }))).status, 403)
  assert.equal(
    (
      await x.handler(
        new Request('https://example.invalid/documents', { method: 'POST', body: '{}' }),
      )
    ).status,
    401,
  )
  assert.equal(x.calls.length, 0)
})
test('invalid user and database-denied role never reach privileged storage', async () => {
  for (const options of [{ authorized: false }, { permitted: false }]) {
    const x = setup(options)
    assert.ok((await x.handler(x.request('{}'))).status >= 400)
    assert.equal(x.calls.length, 0)
  }
})
test('pending files do not get a signed URL', async () => {
  const x = setup()
  assert.equal((await x.handler(x.request(JSON.stringify({ document_id: 'id' })))).status, 403)
  assert.equal(x.calls.length, 0)
})
test('authorized clean file receives a short URL through server only', async () => {
  const x = setup({ clean: true })
  assert.equal((await x.handler(x.request(JSON.stringify({ document_id: 'id' })))).status, 200)
  assert.deepEqual(x.calls, ['signed'])
})
test('mismatched file signatures rejected before storage', async () => {
  const x = setup()
  const form = new FormData()
  form.set('file', new File(['not a PDF'], 'test.pdf', { type: 'application/pdf' }))
  form.set('customer_id', 'customer')
  form.set('document_type', 'policy')
  assert.equal((await x.handler(x.request(form))).status, 400)
  assert.equal(x.calls.length, 0)
})
test('valid signature uploads with explicit unscanned status with verified actor and content hash', async () => {
  const x = setup()
  const form = new FormData()
  form.set('file', new File(['%PDF-1.7\n%%EOF'], 'test.pdf', { type: 'application/pdf' }))
  form.set('customer_id', 'customer')
  form.set('document_type', 'policy')
  const result = await x.handler(x.request(form))
  assert.equal(result.status, 201)
  assert.equal(x.calls[1].scan_status, 'unscanned')
  assert.equal(x.calls[1].uploaded_by, 'user')
  assert.match(x.calls[1].content_sha256, /^[0-9a-f]{64}$/)
})
test('signature inspection rejects mislabeled HTML', () => {
  assert.equal(
    matchesSignature(new TextEncoder().encode('<html>bad</html>'), 'application/pdf'),
    false,
  )
})
test('stream size limit applies without a trustworthy content length', async () => {
  const x = setup()
  const result = await x.handler(
    x.request(new Uint8Array(10 * 1024 * 1024 + 65537), {
      'Content-Type': 'multipart/form-data; boundary=x',
    }),
  )
  assert.equal(result.status, 413)
  assert.equal(x.calls.length, 0)
})
