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

import Router from 'koa-router'
import { registerGithub } from '../github'
import { registerGoogle } from '../google'
import { registerOpenid } from '../openid'

jest.mock('openid-client', () => ({
  Issuer: { discover: jest.fn(async () => ({ Client: jest.fn() })) },
  Strategy: jest.fn()
}))

describe.each([
  ['google', registerGoogle, 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  ['github', registerGithub, 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  ['openid', registerOpenid, 'OPENID_CLIENT_ID', 'OPENID_CLIENT_SECRET']
])('%s consent routes', (name, register, idKey, secretKey) => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('starts without consent and rejects a callback without its matching session', async () => {
    process.env[idKey] = 'test-id'
    process.env[secretKey] = 'test-secret'
    process.env.OPENID_ISSUER = 'https://openid.example'
    const router = new Router()
    const passport: any = {
      use: jest.fn(),
      authenticate: jest.fn((strategy, options) => async (ctx: any) => {
        if (strategy === 'oidc' && options.state !== undefined) {
          ctx.request.session['oidc:auth'] = { state: options.state }
        }
      })
    }
    const log: any = { info: jest.fn(), error: jest.fn() }
    register(log, passport, router, 'https://account.example', Promise.resolve({} as any), 'https://front.example', {})
    const start = router.stack.find((route) => route.path === `/auth/${name}`)?.stack[0]
    const callbackHandler = router.stack.find((route) => route.path === `/auth/${name}/callback`)?.stack[0]
    expect(start).toBeDefined()
    expect(callbackHandler).toBeDefined()
    const values = new Map<string, string>()
    const ctx: any = {
      query: {},
      session: {},
      cookies: {
        get: (name: string) => values.get(name),
        set: (name: string, value: string | null) => (value === null ? values.delete(name) : values.set(name, value))
      },
      request: { headers: {} },
      throw: (status: number) => {
        throw new Error(String(status))
      }
    }
    const next = jest.fn(async () => {})
    await expect(callbackHandler?.(ctx, next)).rejects.toThrow('403')
    expect(passport.authenticate).not.toHaveBeenCalled()

    await start?.(ctx, next)
    const state = passport.authenticate.mock.calls[0][1].state
    await expect(
      callbackHandler?.({ ...ctx, query: { state }, cookies: { get: () => undefined } }, next)
    ).rejects.toThrow('403')
    ctx.query = { state }
    await callbackHandler?.(ctx, next)
    expect(passport.authenticate).toHaveBeenCalledTimes(2)
  })
})
