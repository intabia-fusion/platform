import { devices, PlaywrightTestConfig } from '@playwright/test'
import { config as dotenvConfig } from 'dotenv'
dotenvConfig()

const PlatformURI = process.env.PLATFORM_URI ?? 'http://localhost:8083'

let maxFailures: number | undefined
if (process.env.TESTS_MAX_FAILURES !== undefined) {
  maxFailures = parseInt(process.env.TESTS_MAX_FAILURES)
}

// 'on-first-retry' traces the retry, which for a flake is the attempt that passed. Locally we
// want the failing attempt's trace instead; CI wants the cheap one. Override with TRACE_MODE.
const traceModes = ['on-first-retry', 'retain-on-failure', 'on', 'off', 'on-all-retries'] as const
type TraceMode = (typeof traceModes)[number]

const isCI = (process.env.CI ?? '') !== ''
const requested = (process.env.TRACE_MODE ?? '').trim()
const traceMode: TraceMode = traceModes.includes(requested as TraceMode)
  ? (requested as TraceMode)
  : isCI
    ? 'on-first-retry'
    : 'retain-on-failure'
if (requested !== '' && requested !== traceMode) {
  console.warn(`TRACE_MODE=${JSON.stringify(requested)} is not one of ${traceModes.join(', ')}; using ${traceMode}`)
}

const config: PlaywrightTestConfig = {
  globalSetup: require.resolve('./global.setup.ts'),
  globalTeardown: require.resolve('./global.teardown.ts'),
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'Platform',
      use: {
        // A toast lives 10s (packages/ui/src/utils.ts) in the bottom-left corner - on top of
        // #profile-button. Every click on it then waits the toast out; that cost 166s of the run
        // and is what timed the flaky tests out. setTestOptions() does the same, but only 8 of
        // the 85 spec files call it, so put it where every context gets it.
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
        trace: {
          mode: traceMode,
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
    // Per-step timings, which the json reporter drops. Consumed by analyze_steps.js.
    [require.resolve('./step-reporter.ts')],
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
