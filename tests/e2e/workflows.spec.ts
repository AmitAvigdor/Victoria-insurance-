import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
const at = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}
async function login(page: Page) {
  await page.goto('/login')
  await expect(page).toHaveTitle('ויקטוריה | ניהול סוכנות ביטוח')
  if (process.env.E2E_LIVE === 'true') {
    await page.getByLabel('כתובת אימייל', { exact: true }).fill(process.env.E2E_EMAIL!)
    await page.getByLabel('סיסמה', { exact: true }).fill(process.env.E2E_PASSWORD!)
    await page.getByRole('button', { name: 'כניסה למערכת', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'כניסה לסביבת הדגמה', exact: true }).click()
  }
  await expect(
    page.getByRole('heading', { name: 'התמונה המלאה של הסוכנות', exact: true }),
  ).toBeVisible()
}
async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'שמירה', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test('customer → policy → renewal → task → document → persistence → protected logout', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept())
  await login(page)
  await page.goto('/customers')
  await page.getByRole('button', { name: 'לקוח חדש', exact: true }).click()
  await page.getByLabel('שם פרטי *', { exact: true }).fill('בדיקה')
  await page.getByLabel('שם משפחה', { exact: true }).fill('אוטומטית')
  await page.getByLabel('מספר זהות', { exact: true }).fill('000009992')
  await page.getByLabel('טלפון', { exact: true }).fill('050-000-9992')
  await page.getByLabel('אימייל', { exact: true }).fill('test@example.invalid')
  await save(page)
  await expect(page.getByRole('heading', { name: 'בדיקה אוטומטית', exact: true })).toBeVisible()
  const profile = page.url()
  await page.getByRole('button', { name: 'פוליסה חדשה', exact: true }).click()
  await page.getByLabel('חברת ביטוח *', { exact: true }).fill('חברת דוגמה')
  await page.getByLabel('מספר פוליסה', { exact: true }).fill('E2E-FICTIONAL-1')
  await page.getByLabel('תאריך התחלה *', { exact: true }).fill(at(-1))
  await page.getByLabel('תאריך סיום *', { exact: true }).fill(at(6))
  await page.getByLabel('פרמיה שנתית (₪)', { exact: true }).fill('2400')
  await save(page)
  await page.goto('/renewals')
  await page.getByRole('button', { name: '7 ימים', exact: true }).click()
  await page.getByLabel('חיפוש חידושים', { exact: true }).fill('E2E-FICTIONAL-1')
  await expect(page.getByText('חברת דוגמה · רכב · E2E-FICTIONAL-1', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'בדיקה אוטומטית', exact: true }).click()
  await page.getByRole('button', { name: 'משימה חדשה', exact: true }).click()
  await page.getByLabel('כותרת המשימה *', { exact: true }).fill('משימת בדיקה אוטומטית')
  await page
    .getByRole('combobox', { name: 'פוליסה משויכת', exact: true })
    .selectOption({ label: 'רכב · חברת דוגמה · E2E-FICTIONAL-1' })
  await save(page)
  await page.getByRole('tab', { name: 'משימות (1)', exact: true }).click()
  await page.getByRole('button', { name: 'השלמת משימה: משימת בדיקה אוטומטית', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'פתיחה מחדש: משימת בדיקה אוטומטית', exact: true }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'פעילות', exact: true }).click()
  await expect(page.getByText('הושלמה משימה: משימת בדיקה אוטומטית', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'מסמכים (0)', exact: true }).click()
  await page.getByRole('button', { name: 'העלאת מסמך', exact: true }).click()
  await page
    .getByLabel('קובץ להעלאה', { exact: true })
    .setInputFiles(path.resolve('tests/fixtures/fictional-policy.pdf'))
  await page.getByRole('dialog').getByRole('button', { name: 'העלאת מסמך', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('fictional-policy.pdf', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('fictional-policy.pdf', { exact: true })).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'הורדת מסמך fictional-policy.pdf', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('fictional-policy.pdf')
  await page.getByRole('button', { name: 'מחיקת מסמך fictional-policy.pdf', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'מחיקת מסמך', exact: true }).click()
  await expect(page.getByText('fictional-policy.pdf', { exact: true })).toHaveCount(0)
  if (process.env.E2E_LIVE === 'true') {
    await page.goto('/security')
    await expect(page.getByText('fictional-policy.pdf', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'שחזור', exact: true }).click()
    await expect(page.getByText('fictional-policy.pdf', { exact: true })).toHaveCount(0)
    await page.goto(profile)
    await page.getByRole('tab', { name: 'מסמכים (1)', exact: true }).click()
    await expect(page.getByText('fictional-policy.pdf', { exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: 'תפריט משתמש', exact: true }).click()
  await page.getByRole('menuitem', { name: 'התנתקות', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto(profile)
  await expect(page.getByRole('heading', { name: 'טוב שחזרת', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'בדיקה אוטומטית', exact: true })).toHaveCount(0)
})
test('switching agencies never shows the previous customer cache', async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== 'true', 'Requires isolated hosted accounts')
  await login(page)
  await page.goto('/customers')
  await expect(page.getByRole('link', { name: 'בדיקה אוטומטית', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'בדיקה אוטומטית', exact: true }).click()
  const previousCustomer = page.url()
  await page.getByRole('button', { name: 'תפריט משתמש', exact: true }).click()
  await page.getByRole('menuitem', { name: 'התנתקות', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('כתובת אימייל', { exact: true }).fill(process.env.E2E_OTHER_EMAIL!)
  await page.getByLabel('סיסמה', { exact: true }).fill(process.env.E2E_OTHER_PASSWORD!)
  await page.getByRole('button', { name: 'כניסה למערכת', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'הלקוח לא נמצא', exact: true })).toBeVisible()
  await page.goto('/customers')
  await expect(page.getByRole('link', { name: 'בדיקת הרשאות', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'בדיקה אוטומטית', exact: true })).toHaveCount(0)
  await page.goto(previousCustomer)
  await expect(page.getByRole('heading', { name: 'הלקוח לא נמצא', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'הלקוח לא נמצא', exact: true })).toBeVisible()
})
test('responsive viewport stays within document bounds', async ({ page }) => {
  await login(page)
  for (const route of [
    '/',
    '/today',
    '/customers',
    '/policies',
    '/renewals',
    '/tasks',
    '/documents',
    '/commissions',
  ]) {
    await page.goto(route)
    await expect(page.locator('.page-heading')).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, route).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  }
})

test('idle session is locked after reload and fresh login still works', async ({ page }) => {
  test.skip(process.env.E2E_LIVE !== 'true', 'Only hosted sessions use idle expiry')
  await login(page)
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('victoria-last-active:'))
    if (!key) throw new Error('Activity marker missing')
    localStorage.setItem(key, String(Date.now() - 16 * 60 * 1000))
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'טוב שחזרת', exact: true })).toBeVisible({
    timeout: 20000,
  })
  await login(page)
})
