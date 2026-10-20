//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//
import { MeasureMetricsContext } from '@hcengineering/core'
import platform from '@hcengineering/platform'
import http from 'http'
import { type AddressInfo } from 'net'
import Koa from 'koa'

import { serveAccount } from '../index'
import { authLimiter } from '../rateLimit'

const mockLogin = jest.fn(async () => ({ id: 1, result: 'ok' }))

jest.mock('@hcengineering/account', () => ({
  ...jest.requireActual('@hcengineering/account'),
  __esModule: true,
  getAccountDB: jest.fn(async () => [{}, jest.fn()]),
  getMethods: jest.fn(() => ({ login: mockLogin })),
  initRegionConfig: jest.fn(),
  cleanExpiredOtp: jest.fn(),
  sweepScheduledDeletions: jest.fn(async () => {})
}))

jest.mock('@hcengineering/auth-providers', () => ({ registerProviders: jest.fn() }))

jest.mock('@hcengineering/kafka', () => ({
  getPlatformQueue: jest.fn(() => ({
    getProducer: jest.fn(() => ({ send: jest.fn(), close: jest.fn() })),
    createBatchConsumer: jest.fn(() => ({ close: jest.fn() })),
    shutdown: jest.fn()
  }))
}))

describe('account rpc dispatch', () => {
  let server: http.Server
  let url: string

  async function call (body: unknown): Promise<{ status: number, body: any }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { status: res.status, body: await res.json() }
  }

  beforeAll(async () => {
    process.env.DB_URL = 'postgresql://localhost/account'
    process.env.TRANSACTOR_URL = 'ws://localhost:3333'
    process.env.SERVER_SECRET = 'secret'

    // serveAccount listens on its own port and hooks the process; take its koa app and serve it here.
    const listen = jest
      .spyOn(Koa.prototype, 'listen')
      .mockImplementation(() => ({ close: jest.fn(), closeAllConnections: jest.fn() }) as any)
    const spies = [
      listen,
      jest.spyOn(process, 'on').mockImplementation(() => process),
      jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref: jest.fn() }) as any),
      jest.spyOn(console, 'log').mockImplementation(() => {})
    ]
    let app: Koa
    try {
      serveAccount(new MeasureMetricsContext('test', {}), {})
      app = listen.mock.contexts[0] as Koa
      // The db promise resolves later and schedules the cleanup timers: keep them mocked.
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      spies.forEach((s) => {
        s.mockRestore()
      })
    }

    const handle = app.callback()
    server = http.createServer((req, res) => {
      void handle(req, res)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    authLimiter.reset()
    mockLogin.mockClear()
  })

  it('hands a known string method to its handler', async () => {
    const res = await call({ id: 7, method: 'login', params: {} })

    expect(res).toEqual({ status: 200, body: { id: 1, result: 'ok' } })
    expect(mockLogin).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an array', ['login']],
    ['a number', 5],
    ['null', null],
    ['an object', { name: 'login' }]
  ])('refuses %s as the method with 400, handler untouched', async (_name, method) => {
    const res = await call({ id: 7, method, params: {} })

    expect(res.status).toBe(400)
    expect(res.body.id).toBe(7)
    expect(res.body.error.code).toBe(platform.status.UnknownMethod)
    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('refuses a request without a method', async () => {
    const res = await call({ id: 7, params: {} })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe(platform.status.UnknownMethod)
  })

  it.each(['constructor', 'toString', 'hasOwnProperty', '__proto__'])(
    'refuses the prototype property %s with 400',
    async (method) => {
      const res = await call({ id: 7, method, params: {} })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe(platform.status.UnknownMethod)
      expect(res.body.error.params).toEqual({ method })
    }
  )

  it('refuses a name that is not a method with 400', async () => {
    const res = await call({ id: 7, method: 'noSuchMethod', params: {} })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe(platform.status.UnknownMethod)
  })

  it('still counts the string method against the limiter, and the array form gets no way around it', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 350; i++) statuses.push((await call({ id: i, method: 'login', params: {} })).status)

    const served = statuses.filter((s) => s === 200).length
    expect(served).toBeLessThanOrEqual(300)
    expect(statuses).toContain(429)
    expect(mockLogin).toHaveBeenCalledTimes(served)

    const viaArray = await call({ id: 1, method: ['login'], params: {} })
    expect(viaArray.status).toBe(400)
    expect(mockLogin).toHaveBeenCalledTimes(served)
  })
})
