// Verify the actual recovery redirect and password form without sending any email.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'

if (process.env.CONFIRM_HOSTED_TEST !== 'true') throw new Error('Set CONFIRM_HOSTED_TEST=true')
process.loadEnvFile('.env')
const url = process.env.VITE_SUPABASE_URL
const publicKey = process.env.VITE_SUPABASE_ANON_KEY
const ref = new URL(url).hostname.split('.')[0]
const keys = JSON.parse(
  execFileSync(
    process.env.SUPABASE_CLI || 'supabase',
    ['projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ),
)
const key =
  keys.find((k) => k.type === 'secret')?.api_key ||
  keys.find((k) => k.name === 'service_role')?.api_key
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, key, options)
const publicClient = createClient(url, publicKey, options)
const origin = process.env.HOSTED_APP_URL || 'http://127.0.0.1:5173'
const email = `victoria-recovery-${randomUUID()}@example.invalid`
const password = `V!${randomUUID()}a9`
const replacement = `V!${randomUUID()}b8`
function ok(result) {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
let userId
let browser
try {
  userId = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
  const page = await browser.newPage()
  await page.goto(`${origin}/reset-password`)
  await expect(page.getByRole('alert')).toContainText('קישור האיפוס אינו תקף', { timeout: 15000 })
  await expect(page.getByRole('button', { name: 'עדכון סיסמה', exact: true })).toBeDisabled()
  console.log('PASS invalid password reset link is rejected')
  const link = ok(
    await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/reset-password` },
    }),
  )
  const response = await fetch(link.properties.action_link, { redirect: 'manual' })
  const location = new URL(response.headers.get('location'))
  assert.equal(
    location.origin + location.pathname,
    `${origin}/reset-password`,
    'Supabase recovery redirect must return to the running app',
  )
  assert.ok(!location.hash.includes('error='), 'Recovery token must be accepted')
  console.log('PASS Supabase recovery link redirects to the correct app and route')
  // A recovery email opens a fresh document; changing only an existing page's hash
  // would skip the Supabase client's initialization and token detection.
  await page.goto('about:blank')
  await page.goto(location.href)
  await expect(page.getByLabel('סיסמה חדשה', { exact: true })).toBeEnabled({ timeout: 20000 })
  await page.getByLabel('סיסמה חדשה', { exact: true }).fill(replacement)
  await page.getByLabel('אימות סיסמה', { exact: true }).fill('NotTheSame123!')
  await page.getByRole('button', { name: 'עדכון סיסמה', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('הסיסמאות אינן זהות')
  await page.getByLabel('אימות סיסמה', { exact: true }).fill(replacement)
  await page.getByRole('button', { name: 'עדכון סיסמה', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/login`, { timeout: 20000 })
  assert.ok((await publicClient.auth.signInWithPassword({ email, password })).error)
  ok(await publicClient.auth.signInWithPassword({ email, password: replacement }))
  console.log(
    'PASS password form validates confirmation, changes the password and signs out; only the new password works',
  )
} finally {
  await browser?.close()
  if (userId) ok(await admin.auth.admin.deleteUser(userId))
  console.log('Temporary recovery account removed; no emails were sent')
}
