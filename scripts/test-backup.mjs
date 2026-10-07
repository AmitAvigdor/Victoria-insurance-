import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { digest, encryptBackup, decryptBackup } from './backup/archive.mjs'
import { rehearseRestore } from './backup/rehearsal.mjs'
const key = 'test-only-fictional-recovery-key-123456'
async function fixture() {
  const a = '11111111-1111-4111-8111-111111111111',
    u = '33b05868-fc18-4c14-91a7-5c935f3a5ea8',
    c = '10000000-0000-4000-8000-000000000001',
    d = '20000000-0000-4000-8000-000000000001'
  const bytes = Buffer.from('%PDF-1.4 fictional backup document')
  const migrations = []
  for (const name of (await readdir('supabase/migrations')).sort()) {
    const sql = await readFile('supabase/migrations/' + name, 'utf8')
    migrations.push({ name, sql, sha256: digest(Buffer.from(sql)) })
  }
  return {
    format: 'victoria-business-backup-v1',
    created_at: new Date().toISOString(),
    migrations,
    tables: {
      agencies: [{ id: a, name: 'Fictional' }],
      profiles: [{ id: u, agency_id: a, full_name: 'Fictional owner', role: 'admin' }],
      customers: [
        {
          id: c,
          agency_id: a,
          first_name: 'Test',
          last_name: '',
          identification_number: '',
          phone: '',
        },
      ],
      policies: [],
      tasks: [],
      activities: [],
      documents: [
        {
          id: d,
          agency_id: a,
          customer_id: c,
          file_name: 'fixture.pdf',
          file_path: `${a}/${c}/${d}.pdf`,
          document_type: 'policy',
          uploaded_by: u,
          file_size: bytes.length,
          mime_type: 'application/pdf',
          scan_status: 'unscanned',
          deleted_at: '2026-10-07T00:00:00Z',
        },
      ],
    },
    files: [
      {
        path: `${a}/${c}/${d}.pdf`,
        size: bytes.length,
        sha256: digest(bytes),
        base64: bytes.toString('base64'),
      },
    ],
  }
}
test('encrypted backup restores records and archived document bytes', async () => {
  const payload = await fixture()
  const sealed = encryptBackup(payload, key)
  assert.equal(sealed.includes(Buffer.from('Fictional owner')), false)
  const result = await rehearseRestore(decryptBackup(sealed, key))
  assert.equal(result.counts.documents, 1)
  assert.equal(result.files, 1)
  assert.ok(result.restoredValuesVerified)
})
test('wrong keys and modified ciphertext cannot be decrypted', async () => {
  const sealed = encryptBackup(await fixture(), key)
  assert.throws(() => decryptBackup(sealed, 'different-password-123456'))
  sealed[sealed.length - 1] ^= 1
  assert.throws(() => decryptBackup(sealed, key))
})
test('missing document bytes or changed file checksums prevent verification', async () => {
  const payload = await fixture()
  payload.files = []
  assert.throws(() => decryptBackup(encryptBackup(payload, key), key))
  const changed = await fixture()
  changed.files[0].sha256 = 'invalid'
  assert.throws(() => decryptBackup(encryptBackup(changed, key), key))
})
