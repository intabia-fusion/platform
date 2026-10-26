import { createRestClient } from '../rest/rest'

describe('RestClient rate limit retry', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const mockFetch = (okBody: any): jest.Mock => {
    let calls = 0
    const fn = jest.fn(async () => {
      calls++
      if (calls <= 4) {
        return new Response('', { status: 429, headers: { 'Retry-After-ms': '1' } })
      }
      return new Response(JSON.stringify(okBody), { status: 200 })
    })
    globalThis.fetch = fn as any
    return fn
  }

  it('getAccount retries on 429 beyond the plain retry limit', async () => {
    const fetchMock = mockFetch({ uuid: 'a' })
    const client = createRestClient('http://x.test', 'ws', 'token')

    await expect(client.getAccount()).resolves.toMatchObject({ uuid: 'a' })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('searchFulltext retries on 429 beyond the plain retry limit', async () => {
    const fetchMock = mockFetch({ docs: [] })
    const client = createRestClient('http://x.test', 'ws', 'token')

    await expect(client.searchFulltext({ query: 'q' }, {})).resolves.toMatchObject({ docs: [] })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})

describe('RestClient refused write', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('a collection write gives the reason of the server and is not retried', async () => {
    const status = { severity: 'ERROR', code: 'platform:status:Forbidden', params: { kind: 'author-only' } }
    const fetchMock = jest.fn(
      async () => new Response(JSON.stringify({ message: 'No', error: status }), { status: 403 })
    )
    globalThis.fetch = fetchMock as any
    const client = createRestClient('http://x.test', 'ws', 'token')

    const err = await client
      .updateCollection('cls' as any, 'space' as any, 'doc' as any, 'parent' as any, 'pcls' as any, 'items', {})
      .catch((err) => err)
    expect(err.status).toEqual(status)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
