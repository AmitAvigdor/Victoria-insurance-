import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { read, utils } from 'xlsx'

async function enter(page: Page) {
  await page.goto('/login')
  if (process.env.E2E_LIVE === 'true') {
    await page.getByLabel('כתובת אימייל', { exact: true }).fill(process.env.E2E_EMAIL!)
    await page.getByLabel('סיסמה', { exact: true }).fill(process.env.E2E_PASSWORD!)
    await page.getByRole('button', { name: 'כניסה למערכת', exact: true }).click()
  } else await page.getByRole('button', { name: 'כניסה לסביבת הדגמה', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'התמונה המלאה של הסוכנות', exact: true }),
  ).toBeVisible()
  await page.goto('/export')
  await expect(page.getByRole('heading', { name: 'ייצוא לאקסל', exact: true })).toBeVisible()
}
test('Excel export downloads real XLSX with selected sheets, safe cells and protected logout', async ({
  page,
}, testInfo) => {
  await enter(page)
  const labels = [
    'לקוחות',
    'פוליסות וחידושים',
    'ביטוחי רכב במבנה האקסל המקורי',
    'משימות',
    'עמלות',
    'רשימת מסמכים',
    'היסטוריית פעילות',
  ]
  const sheets = ['לקוחות', 'פוליסות', 'ביטוחי רכב', 'משימות', 'עמלות', 'רשימת מסמכים', 'פעילות']
  const counts = await Promise.all(
    labels.map(async (label) => {
      const content = await page
        .getByRole('checkbox', { name: new RegExp(`^${label} \\(`) })
        .locator('..')
        .innerText()
      return Number(content.match(/\((\d+)\)/)![1])
    }),
  )
  await page.getByRole('button', { name: 'הכנת קובץ אקסל', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'הקובץ מוכן' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'הורדת קובץ האקסל', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^victoria-.*\.xlsx$/)
  const workbook = read(await readFile((await download.path())!), { type: 'buffer' })
  expect(workbook.SheetNames).toEqual(sheets)
  for (const [i, name] of sheets.entries()) {
    const sheet = workbook.Sheets[name]
    expect(utils.decode_range(sheet['!ref']!).e.r).toBe(counts[i])
    for (const [address, cell] of Object.entries(sheet))
      if (!address.startsWith('!')) {
        expect(cell.f).toBeUndefined()
        expect(cell.l).toBeUndefined()
      }
  }
  expect(workbook.Sheets['לקוחות'].E2.t).toBe('s')
  expect(workbook.Sheets['לקוחות'].E2.v).toMatch(/^0/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  )
  await page.screenshot({ path: testInfo.outputPath('excel-export.png'), fullPage: true })
  const oldUrl = await page
    .getByRole('link', { name: 'הורדת קובץ האקסל', exact: true })
    .getAttribute('href')
  await page.getByRole('checkbox', { name: /^היסטוריית פעילות/ }).uncheck()
  await expect(page.getByRole('link', { name: 'הורדת קובץ האקסל', exact: true })).toHaveCount(0)
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url!)
        return false
      } catch {
        return true
      }
    }, oldUrl),
  ).toBe(true)
  await page.getByRole('button', { name: 'הכנת קובץ אקסל', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'הקובץ מוכן עם 6 גיליונות' }),
  ).toBeVisible()
  const revisedPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'הורדת קובץ האקסל', exact: true }).click()
  const revised = read(await readFile((await (await revisedPromise).path())!), { type: 'buffer' })
  expect(revised.SheetNames).not.toContain('פעילות')
  await page.getByRole('button', { name: 'תפריט משתמש', exact: true }).click()
  await page.getByRole('menuitem', { name: 'התנתקות', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/export')
  await expect(page).toHaveURL(/\/login/)
})

test('Excel export blocks an empty selection and loads new records before preparation', async ({
  page,
  context,
}) => {
  await enter(page)
  const create = page.getByRole('button', { name: 'הכנת קובץ אקסל', exact: true })
  for (const box of await page.locator('.export-sections input').all()) await box.uncheck()
  await expect(create).toBeDisabled()
  await page.getByRole('checkbox', { name: /^לקוחות \(/ }).check()
  const other = await context.newPage()
  if (process.env.E2E_LIVE !== 'true')
    await other.addInitScript(() => sessionStorage.setItem('keshet-demo-session', 'true'))
  await other.goto('/customers')
  await other.getByRole('button', { name: 'לקוח חדש', exact: true }).click()
  await other.getByLabel('שם פרטי *', { exact: true }).fill('בדיקת ייצוא טרי')
  await other.getByRole('dialog').getByRole('button', { name: 'שמירה', exact: true }).click()
  await expect(other.getByRole('dialog')).toHaveCount(0)
  await other.close()
  await create.click()
  await expect(
    page.getByRole('status').filter({ hasText: 'הקובץ מוכן עם גיליון אחד' }),
  ).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('link', { name: 'הורדת קובץ האקסל', exact: true }).click()
  const book = read(await readFile((await (await pending).path())!), { type: 'buffer' })
  expect(book.SheetNames).toEqual(['לקוחות'])
  expect(utils.sheet_to_json(book.Sheets['לקוחות'])).toEqual(
    expect.arrayContaining([expect.objectContaining({ 'שם פרטי': 'בדיקת ייצוא טרי' })]),
  )
})
