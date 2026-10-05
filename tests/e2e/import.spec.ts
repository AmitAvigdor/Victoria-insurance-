import { test, expect, type Page } from '@playwright/test'
import { utils, write } from 'xlsx'

test.skip(
  process.env.E2E_LIVE === 'true',
  'Import fixtures run only in the isolated demo environment',
)
async function enter(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה לסביבת הדגמה', exact: true }).click()
  await page.goto('/customers')
  await page.getByRole('link', { name: 'ייבוא מאקסל', exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'ייבוא מאקסל', exact: true })).toBeVisible()
}
function fixture() {
  const book = utils.book_new()
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([['קובץ בדיקה בדיוני'], ['בחרו בגיליון הבא']]),
    'הסבר',
  )
  const headers = [
    'שם מלא',
    'ת״ז',
    'נייד',
    'יום הולדת',
    'כתובת',
    'חברת ביטוח',
    'מספר פוליסה',
    'סוג ביטוח',
    'תאריך התחלה',
    'תאריך סיום',
    'פרמיה',
    'הערה אישית',
  ]
  const row = [
    'לקוח ייבוא',
    7777,
    500007777,
    '31/12/1990',
    'רחוב בדיקה 1',
    'חברת ייבוא',
    'IMPORT-1',
    'רכב',
    '01/01/2026',
    '31/12/2026',
    1200,
    'לתאם בשעות הבוקר',
  ]
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ['רשימת לקוחות'],
      headers,
      row,
      [...row.slice(0, 6), 'IMPORT-2', ...row.slice(7)],
      row,
      ['לקוח שגוי', 'זהות לא תקינה', ...row.slice(2)],
    ]),
    'נתונים',
  )
  return {
    name: 'fictional-customers.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(write(book, { type: 'buffer', bookType: 'xlsx' })),
  }
}
test('Excel → sheet and header selection → mapping → explicit review → linked records → safe retry', async ({
  page,
}, testInfo) => {
  await enter(page)
  await page.getByLabel('קובץ אקסל לייבוא', { exact: true }).setInputFiles(fixture())
  await page.getByLabel('גיליון', { exact: true }).selectOption('1')
  await page.getByLabel('מספר שורת הכותרות באקסל', { exact: true }).fill('2')
  await page.getByLabel('סוג הנתונים', { exact: true }).selectOption('combined')
  await page.getByLabel('תאריך לידה', { exact: true }).selectOption('3')
  await expect(page.getByLabel('מספר זהות', { exact: true })).toHaveValue('1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  )
  await page.getByRole('button', { name: 'בדיקה ותצוגה מקדימה', exact: true }).click()
  await expect(page.getByText('2 שורות מוכנות', { exact: true })).toBeVisible()
  await expect(page.getByText('1 שורות עם שגיאות', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ייבוא הנתונים', exact: true })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('excel-import-preview.png'), fullPage: true })
  await page.locator('summary').first().click()
  await expect(page.getByText('הערה אישית: לתאם בשעות הבוקר', { exact: true })).toBeVisible()
  await expect(page.getByText('0500007777', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  )
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'ייבוא הנתונים', exact: true }).click()
  await expect(
    page.getByText('נשמרו 1 לקוחות, 2 פוליסות ו־0 משימות.', { exact: true }),
  ).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'הורדת דוח ייבוא', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('victoria-import-report.csv')
  await page.getByRole('button', { name: 'ייבוא נוסף / ניסיון חוזר', exact: true }).click()
  await page.getByRole('button', { name: 'בדיקה ותצוגה מקדימה', exact: true }).click()
  await expect(page.getByText('0 שורות מוכנות', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ייבוא הנתונים', exact: true })).toBeDisabled()
  await page.goto('/customers')
  await page.getByLabel('חיפוש לקוחות', { exact: true }).fill('000007777')
  await page.getByRole('link', { name: 'לקוח ייבוא', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'לקוח ייבוא', exact: true })).toBeVisible()
  await expect(page.getByText('הערה אישית: לתאם בשעות הבוקר', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'פוליסות (2)', exact: true }).click()
  await expect(page.getByRole('button', { name: 'IMPORT-1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'IMPORT-2', exact: true })).toBeVisible()
})

test('invalid files and unmapped identities cannot be imported', async ({ page }) => {
  await enter(page)
  await page.getByLabel('קובץ אקסל לייבוא', { exact: true }).setInputFiles({
    name: 'bad.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a workbook'),
  })
  await expect(page.getByRole('alert')).toContainText('בחרו קובץ XLSX, XLS או CSV')
  await page.getByLabel('קובץ אקסל לייבוא', { exact: true }).setInputFiles({
    name: 'customers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFFשם פרטי,שם משפחה,מספר זהות,טלפון\nבדיקה,לקוח,000007777,0500007777'),
  })
  await page.getByLabel('מספר זהות', { exact: true }).selectOption('')
  await page.getByRole('button', { name: 'בדיקה ותצוגה מקדימה', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('יש לשייך עמודה למספר זהות')
  await expect(page.getByRole('button', { name: 'ייבוא הנתונים', exact: true })).toBeDisabled()
})
