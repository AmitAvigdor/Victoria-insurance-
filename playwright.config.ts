import { defineConfig, devices } from '@playwright/test'
const live = process.env.E2E_LIVE === 'true'
const port = live ? 5176 : 5175
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: live ? 'test-results/hosted' : 'test-results/demo',
  expect: { timeout: live ? 15_000 : 5_000 },
  timeout: live ? 120_000 : 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: live ? 'off' : 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: `npm run dev -- --port ${port} --mode ${live ? 'e2e-live' : 'e2e-demo'}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: live
      ? { VITE_ENABLE_DEMO: 'false' }
      : { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_ENABLE_DEMO: 'true' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
})
