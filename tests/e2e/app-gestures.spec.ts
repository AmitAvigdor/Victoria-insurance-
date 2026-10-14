import { test, expect, type Page } from '@playwright/test'

test.skip(process.env.E2E_LIVE === 'true', 'Gestures use the isolated demo app')

async function pinch(page: Page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Input.synthesizePinchGesture', {
    x: 180,
    y: 400,
    scaleFactor: 1.8,
    relativeSpeed: 800,
    gestureSourceType: 'touch',
  })
  await client.detach()
}

test('installed iPhone app blocks pinch and Safari gestures while keeping scrolling and forms usable', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Requires a touch viewport')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true })
  })
  await page.goto('/login')
  await expect(page.locator('html')).toHaveAttribute('data-installed-app', '')
  await page.getByRole('button', { name: 'כניסה לסביבת הדגמה', exact: true }).click()
  await expect(page.locator('.page-heading')).toBeVisible()
  const cancelled = await page.evaluate(() =>
    ['gesturestart', 'gesturechange', 'gestureend'].map((type) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    }),
  )
  expect(cancelled).toEqual([true, true, true])
  const before = await page.evaluate(() => visualViewport!.scale)
  await pinch(page)
  expect(await page.evaluate(() => visualViewport!.scale)).toBeCloseTo(before, 2)
  const client = await page.context().newCDPSession(page)
  await client.send('Input.synthesizeScrollGesture', {
    x: 180,
    y: 600,
    yDistance: -350,
    gestureSourceType: 'touch',
  })
  await client.detach()
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
  await page.goto('/customers')
  await page.getByRole('button', { name: 'לקוח חדש', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const input = dialog.getByLabel('שם פרטי *', { exact: true })
  await input.fill('בדיקת מגע')
  await expect(input).toHaveValue('בדיקת מגע')
  const fontSizes = await dialog
    .locator('input, select, textarea')
    .evaluateAll((elements) =>
      elements.map((element) => parseFloat(getComputedStyle(element).fontSize)),
    )
  expect(fontSizes.length).toBeGreaterThan(0)
  expect(fontSizes.every((size) => size >= 16)).toBe(true)
  await pinch(page)
  expect(await page.evaluate(() => visualViewport!.scale)).toBeCloseTo(1, 2)
  await dialog.getByRole('button', { name: 'סגירה', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('ordinary mobile browser retains pinch zoom and does not intercept Safari gestures', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Requires a touch viewport')
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה לסביבת הדגמה', exact: true }).waitFor()
  expect(await page.locator('html').getAttribute('data-installed-app')).toBeNull()
  expect(
    await page.evaluate(() => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    }),
  ).toBe(false)
  await pinch(page)
  await expect.poll(() => page.evaluate(() => visualViewport!.scale)).toBeGreaterThan(1.1)
})

test('mobile search and filter controls stay at readable size without horizontal overflow', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Requires a mobile viewport')
  await page.goto('/login')
  await page.getByRole('button', { name: 'כניסה לסביבת הדגמה', exact: true }).click()
  for (const route of ['/search', '/customers', '/policies', '/renewals', '/tasks', '/documents']) {
    await page.goto(route)
    await expect(page.locator('.page-heading')).toBeVisible()
    const sizes = await page
      .locator(
        'input:visible:not([type="checkbox"]):not([type="radio"]), select:visible, textarea:visible',
      )
      .evaluateAll((elements) =>
        elements.map((element) => parseFloat(getComputedStyle(element).fontSize)),
      )
    expect(
      sizes.every((size) => size >= 16),
      route,
    ).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      route,
    ).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
  }
})
