import { PGlite } from '@electric-sql/pglite'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digest, verifyBackup } from './archive.mjs'
// Restore into a disposable local PostgreSQL engine. This never connects to production.
export async function rehearseRestore(payload) {
  verifyBackup(payload)
  const db = new PGlite()
  const directory = await mkdtemp(join(tmpdir(), 'victoria-restore-'))
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
    for (const m of payload.migrations) await db.exec(m.sql)
    const users = new Set(
      [
        ...payload.tables.profiles.map((r) => r.id),
        ...payload.tables.documents.map((r) => r.uploaded_by),
        ...payload.tables.activities.map((r) => r.user_id),
      ].filter(Boolean),
    )
    for (const id of users) await db.query('insert into auth.users(id) values($1)', [id])
    // Preserve original history and timestamps instead of generating restore audit noise.
    for (const table of ['customers', 'policies', 'tasks', 'documents'])
      await db.exec(`alter table public.${table} disable trigger user`)
    const counts = {}
    for (const table of [
      'agencies',
      'profiles',
      'customers',
      'policies',
      'tasks',
      'documents',
      'activities',
    ]) {
      const allowedColumns = new Set(
        (
          await db.query(
            'select column_name from information_schema.columns where table_schema=$1 and table_name=$2',
            ['public', table],
          )
        ).rows.map((r) => r.column_name),
      )
      for (const row of payload.tables[table]) {
        const columns = Object.keys(row)
        if (columns.some((c) => !allowedColumns.has(c))) throw new Error('Unknown backup column')
        await db.query(
          `insert into public.${table}(${columns.map((c) => '"' + c + '"').join(',')}) values(${columns.map((_, i) => '$' + (i + 1)).join(',')})`,
          columns.map((c) => row[c]),
        )
      }
      counts[table] = Number((await db.query(`select count(*) from public.${table}`)).rows[0].count)
      if (counts[table] !== payload.tables[table].length) throw new Error('Restored count mismatch')
      // Check every stored value, not only row counts (timestamps and numerics normalize in Postgres).
      for (const row of payload.tables[table]) {
        const values = Object.keys(row).map(
          (key) => `${'"' + key + '"'} is not distinct from $${Object.keys(row).indexOf(key) + 2}`,
        )
        const found = await db.query(
          `select id from public.${table} where id=$1 and ${values.join(' and ')}`,
          [row.id, ...Object.values(row)],
        )
        if (found.rows.length !== 1) throw new Error('Restored value mismatch')
      }
    }
    for (const table of ['customers', 'policies', 'tasks', 'documents'])
      await db.exec(`alter table public.${table} enable trigger user`)
    for (const [i, file] of payload.files.entries()) {
      const target = join(directory, String(i))
      await writeFile(target, Buffer.from(file.base64, 'base64'), { mode: 0o600, flag: 'wx' })
      if (digest(await readFile(target)) !== file.sha256)
        throw new Error('Restored file checksum mismatch')
    }
    return {
      counts,
      files: payload.files.length,
      restoredValuesVerified: true,
      documentChecksumsVerified: true,
    }
  } finally {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  }
}
