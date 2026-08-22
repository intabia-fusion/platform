import { devices, PlaywrightTestConfig } from '@playwright/test'
import { config as dotenvConfig } from 'dotenv'
dotenvConfig()

let maxFailures: number | undefined
if (process.env.TESTS_MAX_FAILURES !== undefined) {
  maxFailures = parseInt(process.env.TESTS_MAX_FAILURES)
}

const config: PlaywrightTestConfig = {
  globalSetup: require.resolve('./global.setup.ts'),
  globalTeardown: require.resolve('./global.teardown.ts'),
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'Platform',
      use: {
        testIdAttribute: 'data-id',
        permissions: ['clipboard-read', 'clipboard-write', 'microphone', 'camera'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            // WebRTC ICE: on Linux CI runners mDNS .local hostnames don't
            // resolve, which kills DTLS handshake. Disable mDNS obfuscation so
            // LiveKit gets a real loopback/host IP candidate.
            '--disable-features=WebRtcHideLocalIpsWithMdns'
          ]
        },
        ...devices['Desktop Chrome'],
        screenshot: 'only-on-failure',
        viewport: {
          width: 1440,
          height: 900
        },
        // First attempt runs untraced; only the retry after a failure carries a trace, so a
        // green run pays nothing and a real failure still lands with one.
        trace: {
          mode: 'on-first-retry',
          snapshots: true,
          screenshots: true,
          sources: true
        },
        contextOptions: {
          reducedMotion: 'reduce'
        }
      },
      fullyParallel: false,
      dependencies: ['setup']
    }
  ],
  retries: 2,
  timeout: 60000,
  maxFailures,
  expect: {
    timeout: 15000
  },
  globalTimeout: 2_700_000,
  reporter: [
    ['list'],
    // open: 'never' - the default parks a report server on failure and hangs the terminal.
    ['html', { open: 'never' }],
    // Machine-readable twin of the html report, consumed by analyze_failures.js.
    // Relative to this config's directory, so '..' puts it next to package.json.
    ['json', { outputFile: '../playwright-report.json' }],
    [
      'allure-playwright',
      {
        detail: true,
        suiteTitle: false
      }
    ]
  ]
}
export default config
