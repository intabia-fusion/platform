import { BillingClient } from '../client'
import { BillingError } from '../error'

const SECRET_BODY = 'Internal stacktrace: /srv/secret/path.js:42 SECRET_LEAK'

function makeFailResponse (status: number, body: string): Response {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({})
  } as unknown as Response
}

describe('BillingClient fetchSafe error handling', () => {
  let client: BillingClient

  beforeEach(() => {
    client = new BillingClient('http://billing.test', 'token-xxx')
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(makeFailResponse(500, SECRET_BODY))
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('throws BillingError with status, not raw server text', async () => {
    let caught: unknown
    try {
      await client.postLiveKitSessions([])
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(BillingError)
    const msg = (caught as BillingError).message
    expect(msg).toContain('500')
    expect(msg).not.toContain('stacktrace')
    expect(msg).not.toContain('SECRET_LEAK')
    expect(msg).not.toContain('/srv/secret')
  })

  it('logs raw server text to console.error, not to BillingError', async () => {
    const consoleSpy = console.error as jest.Mock
    try {
      await client.postLiveKitSessions([])
    } catch {}

    expect(consoleSpy).toHaveBeenCalled()
    const logArgs = consoleSpy.mock.calls[0].join(' ')
    expect(logArgs).toContain(SECRET_BODY)
  })
})
