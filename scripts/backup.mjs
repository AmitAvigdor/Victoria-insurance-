import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { resolve, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { encryptBackup, decryptBackup, digest } from './backup/archive.mjs'
import { rehearseRestore } from './backup/rehearsal.mjs'
const root = resolve('.private')
const keyPath = join(root, 'victoria-recovery-key.txt')
const destination = resolve(process.env.VICTORIA_BACKUP_DIR || '../Victoria Private Backups')
async function recoveryKey(create) {
  await mkdir(root, { recursive: true, mode: 0o700 })
  try {
    const info = await stat(keyPath)
    if (info.mode & 0o077) throw new Error('Recovery key permissions must be 0600')
    return (await readFile(keyPath, 'utf8')).trim()
  } catch (e) {
    if (e.code !== 'ENOENT' || !create) throw e
    const key = randomBytes(32).toString('hex')
    await writeFile(keyPath, key + '\n', { flag: 'wx', mode: 0o600 })
    return key
  }
}
const command = process.argv[2] || 'create'
if (command === 'verify') {
  const payload = decryptBackup(await readFile(resolve(process.argv[3])), await recoveryKey(false))
  console.log(
    JSON.stringify({
      recoveryRehearsal: await rehearseRestore(payload),
      created_at: payload.created_at,
    }),
  )
} else if (command === 'create') {
  process.loadEnvFile('.env')
  const url = process.env.VITE_SUPABASE_URL
  const ref = new URL(url).hostname.split('.')[0]
  const arguments_ = ['projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json']
  const executionOptions = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  let output
  try {
    output = execFileSync(process.env.SUPABASE_CLI || 'supabase', arguments_, executionOptions)
  } catch (error) {
    if (error.code !== 'ENOENT' || process.env.SUPABASE_CLI)
      throw new Error('Authenticated Supabase CLI access is required')
    try {
      output = execFileSync('npx', ['--no-install', 'supabase', ...arguments_], executionOptions)
    } catch {
      throw new Error('Run npx supabase login before creating a backup')
    }
  }
  const keys = JSON.parse(output)
  const key =
    keys.find((k) => k.type === 'secret')?.api_key ||
    keys.find((k) => k.name === 'service_role')?.api_key
  if (!key) throw new Error('Administrator access is required')
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const check = ({ data, error }) => {
    if (error) throw new Error('Backup read failed: ' + error.code)
    return data
  }
  const tableNames = [
    'agencies',
    'profiles',
    'customers',
    'policies',
    'tasks',
    'documents',
    'activities',
  ]
  async function snapshot() {
    const tables = {}
    for (const name of tableNames) {
      tables[name] = []
      for (let from = 0; ; from += 500) {
        const rows = check(
          await admin
            .from(name)
            .select('*')
            .order('id')
            .range(from, from + 499),
        )
        tables[name].push(...rows)
        if (rows.length < 500) break
      }
    }
    return tables
  }
  const tables = await snapshot()
  const files = []
  async function walk(prefix = '') {
    for (let offset = 0; ; offset += 100) {
      const objects = check(
        await admin.storage
          .from('customer-documents')
          .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
      )
      for (const object of objects) {
        const path = prefix ? prefix + '/' + object.name : object.name
        if (!object.id) await walk(path)
        else {
          const blob = check(await admin.storage.from('customer-documents').download(path))
          const bytes = Buffer.from(await blob.arrayBuffer())
          files.push({
            path,
            size: bytes.length,
            sha256: digest(bytes),
            base64: bytes.toString('base64'),
          })
        }
      }
      if (objects.length < 100) break
    }
  }
  await walk()
  if (
    digest(Buffer.from(JSON.stringify(tables))) !==
    digest(Buffer.from(JSON.stringify(await snapshot())))
  )
    throw new Error('Data changed during backup; retry when edits are finished')
  const workflowSchemaAvailable = !(await admin.from('policies').select('renewal_stage').limit(1))
    .error
  const migrations = []
  for (const name of (await readdir('supabase/migrations'))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    // Include only migrations already applied to the captured table schema.
    if (name.startsWith('20261007') && !workflowSchemaAvailable) continue
    const sql = await readFile('supabase/migrations/' + name, 'utf8')
    migrations.push({ name, sql, sha256: digest(Buffer.from(sql)) })
  }
  const payload = {
    format: 'victoria-business-backup-v1',
    created_at: new Date().toISOString(),
    source_project: ref,
    tables,
    files,
    migrations,
  }
  const password = await recoveryKey(true)
  const bytes = encryptBackup(payload, password)
  // A fresh decode and restoration is required before this is labelled a verified backup.
  const verification = await rehearseRestore(decryptBackup(bytes, password))
  await mkdir(destination, { recursive: true, mode: 0o700 })
  const path = join(
    destination,
    'victoria-' + payload.created_at.replace(/[:.]/g, '-') + '.vbackup',
  )
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
  const receipt = {
    created_at: payload.created_at,
    archive_sha256: digest(bytes),
    ...verification,
    scope:
      'Business tables and private document files; auth passwords, sessions and provider settings are not included',
  }
  await writeFile(path + '.verified.json', JSON.stringify(receipt, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
  console.log(JSON.stringify({ archive: path, recoveryKeyPath: keyPath, verification: receipt }))
} else throw new Error('Use create or verify ARCHIVE')
