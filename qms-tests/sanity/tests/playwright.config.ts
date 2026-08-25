import { devices, PlaywrightTestConfig } from '@playwright/test'
import { config as dotenvConfig } from 'dotenv'
dotenvConfig()

const PlatformURI = process.env.PLATFORM_URI ?? 'http://localhost:8083'

let maxFailures: number | undefined
if (process.env.TESTS_MAX_FAILURES !== undefined) {
  maxFailures = parseInt(process.env.TESTS_MAX_FAILURES)
}

const config: PlaywrightTestConfig = {
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'QMS',
      use: {
        // A toast lives 10s (packages/ui/src/utils.ts) in the bottom-left corner, on top of
        // #profile-button - every click on it then waits the toast out. setTestOptions() does the
        // same, but only for the tests that call it.
        storageState: {
          cookies: [],
          origins: [
            {
              origin: PlatformURI,
              localStorage: [{ name: '#platform.notification.timeout', value: '0' }]
            }
          ]
        },
        testIdAttribute: 'data-id',
        permissions: ['clipboard-read', 'clipboard-write'],
        ...devices['Desktop Chrome'],
        screenshot: 'only-on-failure',
        viewport: {
          width: 1440,
          height: 900
        },
        trace: {
          mode: 'retain-on-failure',
          snapshots: true,
          screenshots: true,
          sources: true
        },
        contextOptions: {
          reducedMotion: 'reduce'
        }
      },
      dependencies: ['setup']
    }
  ],
  fullyParallel: false,
  workers: 1,
  retries: 2,
  timeout: 60000,
  maxFailures,
  expect: {
    timeout: 15000
  },
  reporter: [
    ['list'],
    ['html'],
    [
      'allure-playwright',
      {
        detail: false,
        suiteTitle: false
      }
    ]
  ]
}
export default config
