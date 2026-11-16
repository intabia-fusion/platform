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

import { joinWithProvider, loginOrSignUpWithProvider } from '@hcengineering/account'
import { SocialIdType } from '@hcengineering/core'
import Koa from 'koa'
import Router from 'koa-router'
import passport from 'koa-passport'
import { Issuer } from 'openid-client'
import { createHash } from 'crypto'
import { registerOpenid } from '../openid'
import { registerProviders } from '../index'
import { consumeAuthState, encodeState, handleProviderAuth, safeParseAuthState } from '../utils'

jest.mock('@hcengineering/account', () => ({
  joinWithProvider: jest.fn(),
  loginOrSignUpWithProvider: jest.fn()
}))

function cookies (): any {
  const values = new Map<string, string>()
  return {
    get: (name: string) => values.get(name),
    set: (name: string, value: string | null) => (value === null ? values.delete(name) : values.set(name, value))
  }
}

describe('provider consent', () => {
  it('keeps independently started signed cookies for two provider callbacks', async () => {
    const app = new Koa()
    app.keys = ['test-secret']
    app.use(async (ctx) => {
      const provider = String(ctx.query.provider)
      if (ctx.path === '/auth/start') {
        ctx.body = encodeState(ctx, {}, provider, '/auth')
      } else {
        consumeAuthState(ctx, provider, '/auth')
        ctx.body = 'ok'
      }
    })
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    try {
      const port = (server.address() as { port: number }).port
      const base = `http://127.0.0.1:${port}/auth`
      const [first, second] = await Promise.all([
        fetch(`${base}/start?provider=google`),
        fetch(`${base}/start?provider=google`)
      ])
      const states = await Promise.all([first.text(), second.text()])
      const cookie = [...first.headers.getSetCookie(), ...second.headers.getSetCookie()]
        .map((item) => item.split(';')[0])
        .join('; ')
      const response = await fetch(`${base}/callback?provider=google&state=${encodeURIComponent(states[0])}`, {
        headers: { cookie }
      })
      expect(response.status).toBe(200)
      const other = await fetch(`${base}/callback?provider=google&state=${encodeURIComponent(states[1])}`, {
        headers: { cookie }
      })
      expect(other.status).toBe(200)
      expect(
        first.headers.getSetCookie().some((item) => item.includes('httponly') && item.includes('path=/auth'))
      ).toBe(true)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => {
          if (err === undefined) resolve()
          else reject(err)
        })
      )
    }
  })

  it('keeps OpenID state and PKCE independent across two callbacks', async () => {
    const env = { ...process.env }
    process.env.OPENID_CLIENT_ID = 'client'
    process.env.OPENID_CLIENT_SECRET = 'secret'
    process.env.OPENID_ISSUER = 'https://issuer.example'
    const issuer = new Issuer({
      issuer: 'https://issuer.example',
      authorization_endpoint: 'https://issuer.example/auth',
      userinfo_endpoint: 'https://issuer.example/userinfo'
    })
    jest.spyOn(Issuer, 'discover').mockResolvedValue(issuer)
    const checks = new Map<string, string>()
    jest
      .spyOn(issuer.Client.prototype, 'callback')
      .mockImplementation(async (_uri: any, params: any, expected: any) => {
        expect(params.state).toBe(expected.state)
        checks.set(params.state, createHash('sha256').update(expected.code_verifier).digest('base64url'))
        return { access_token: 'token' } as any
      })
    jest
      .spyOn(issuer.Client.prototype, 'userinfo')
      .mockResolvedValue({ sub: 'user', email: 'user@example.com', email_verified: true } as any)
    jest.mocked(loginOrSignUpWithProvider).mockResolvedValue({ account: 'account', token: 'token' } as any)
    const app = new Koa()
    app.keys = ['test-secret']
    app.use(passport.initialize())
    const router = new Router()
    const log: any = { info: jest.fn(), error: jest.fn() }
    registerOpenid(log, passport, router, 'http://localhost', Promise.resolve({} as any), 'https://front.example', {})
    await new Promise<void>((resolve) => setImmediate(resolve))
    app.use(router.routes())
    const server = app.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    try {
      const port = (server.address() as { port: number }).port
      const base = `http://127.0.0.1:${port}/auth/openid`
      const responses = await Promise.all([fetch(base, { redirect: 'manual' }), fetch(base, { redirect: 'manual' })])
      const urls = responses.map((response) => new URL(response.headers.get('location') as string))
      const cookie = responses
        .flatMap((response) => response.headers.getSetCookie())
        .map((item) => item.split(';')[0])
        .join('; ')
      for (const url of urls) {
        const state = url.searchParams.get('state') as string
        const response = await fetch(`${base}/callback?code=code&state=${encodeURIComponent(state)}`, {
          headers: { cookie },
          redirect: 'manual'
        })
        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toContain('front.example')
        expect(checks.get(state)).toBe(url.searchParams.get('code_challenge'))
        expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      }
      expect(checks.size).toBe(2)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => {
          if (err === undefined) resolve()
          else reject(err)
        })
      )
      jest.restoreAllMocks()
      process.env = env
    }
  })

  it('requires the state from the initiating session and consumes it once', () => {
    const jar = cookies()
    const query: Record<string, string> = { inviteId: 'invite' }
    const ctx = {
      query,
      request: { headers: {} },
      cookies: jar,
      throw: (status: number) => {
        throw new Error(String(status))
      }
    }
    const state = encodeState(ctx, {}, 'google', '/auth')
    const otherState = encodeState(ctx, {}, 'github', '/auth')
    expect(safeParseAuthState(state).inviteId).toBe('invite')

    const otherSession = { ...ctx, cookies: cookies(), query: { state } }
    expect(() => consumeAuthState(otherSession, 'google', '/auth')).toThrow('403')
    const tampered = { ...ctx, query: { state: encodeURIComponent(JSON.stringify({ consentState: 'wrong' })) } }
    expect(() => consumeAuthState(tampered, 'google', '/auth')).toThrow('403')

    const callback = { ...ctx, query: { state } }
    expect(() => consumeAuthState(callback, 'github', '/auth')).toThrow('403')
    expect(consumeAuthState(callback, 'google', '/auth').inviteId).toBe('invite')
    expect(() => consumeAuthState(callback, 'google', '/auth')).toThrow('403')
    expect(consumeAuthState({ ...ctx, query: { state: otherState } }, 'github', '/auth').inviteId).toBe('invite')
    const expired = encodeState(ctx, {}, 'google', '/auth')
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600001)
    expect(() => consumeAuthState({ ...ctx, query: { state: expired } }, 'google', '/auth')).toThrow('403')
    jest.restoreAllMocks()
  })

  it('waits for consent before creating an account for a new provider identity', async () => {
    jest.mocked(loginOrSignUpWithProvider).mockResolvedValueOnce(null)
    const log: any = { info: jest.fn(), error: jest.fn() }
    const request: any = { cookies: cookies() }
    const url = await handleProviderAuth(
      log,
      {} as any,
      {},
      'https://front.example',
      'google',
      undefined,
      {},
      'new@example.com',
      'First',
      'Last',
      { type: SocialIdType.GOOGLE, value: 'new@example.com' },
      false,
      request,
      '/auth'
    )
    const nonce = new URL(url).searchParams.get('providerConsent')
    expect(request.cookies.get(`oauth-consent-${nonce}`)).toBeDefined()
    expect(jest.mocked(loginOrSignUpWithProvider).mock.lastCall?.slice(-2)).toEqual([true, false])
  })

  it('accepts provider consent only for the matching unexpired session with both agreements', async () => {
    const original = process.env.ACCOUNTS_URL
    process.env.ACCOUNTS_URL = 'https://account.example'
    try {
      const router = new Router()
      const app = new Koa()
      const log: any = { info: jest.fn(), error: jest.fn() }
      registerProviders(log, app, router, Promise.resolve({} as any), 'secret', 'https://front.example', {})
      const endpoint = router.stack.find((route) => route.path === '/auth/consent')?.stack[0]
      expect(endpoint).toBeDefined()
      const nonce = 'a'.repeat(64)
      const pending = {
        nonce,
        createdOn: Date.now(),
        providerType: 'google',
        email: 'new@example.com',
        first: 'First',
        last: 'Last',
        socialKey: { type: SocialIdType.GOOGLE, value: 'new@example.com' }
      }
      const request: any = {
        cookies: cookies(),
        query: { nonce, agreedPersonalData: 'true', agreedRules: 'true' },
        throw: (status: number) => {
          throw new Error(String(status))
        },
        redirect: jest.fn()
      }
      request.cookies.set(`oauth-consent-${nonce}`, Buffer.from(JSON.stringify(pending)).toString('base64url'))
      const secondNonce = 'b'.repeat(64)
      request.cookies.set(
        `oauth-consent-${secondNonce}`,
        Buffer.from(JSON.stringify({ ...pending, nonce: secondNonce, providerType: 'github' })).toString('base64url')
      )
      const next = jest.fn(async () => {})
      await expect(endpoint?.({ ...request, query: { ...request.query, nonce: 'wrong' } }, next)).rejects.toThrow('403')
      await expect(endpoint?.({ ...request, query: { ...request.query, agreedRules: 'false' } }, next)).rejects.toThrow(
        '403'
      )
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 600001)
      await expect(endpoint?.(request, next)).rejects.toThrow('403')
      jest.restoreAllMocks()
      jest.mocked(loginOrSignUpWithProvider).mockResolvedValueOnce({ account: 'account', token: 'token' } as any)
      await endpoint?.(request, next)
      expect(jest.mocked(loginOrSignUpWithProvider).mock.lastCall?.slice(-2)).toEqual([false, true])
      expect(request.cookies.get(`oauth-consent-${nonce}`)).toBeUndefined()
      expect(request.cookies.get(`oauth-consent-${secondNonce}`)).toBeDefined()
      expect(request.redirect).toHaveBeenCalled()
      await expect(endpoint?.(request, next)).rejects.toThrow('403')
      jest.mocked(loginOrSignUpWithProvider).mockResolvedValueOnce({ account: 'account', token: 'token' } as any)
      await endpoint?.({ ...request, query: { ...request.query, nonce: secondNonce } }, next)
      expect(request.cookies.get(`oauth-consent-${secondNonce}`)).toBeUndefined()
    } finally {
      if (original === undefined) delete process.env.ACCOUNTS_URL
      else process.env.ACCOUNTS_URL = original
    }
  })
})

it('preserves the invitation when provider authentication returns unfinished onboarding', async () => {
  jest.mocked(joinWithProvider).mockResolvedValueOnce({
    account: 'account',
    token: 'token',
    onboarding: { intent: { kind: 'workspace' }, stage: 'name' }
  } as any)
  const ctx: any = { info: jest.fn(), error: jest.fn() }
  const state = encodeURIComponent(JSON.stringify({ inviteId: 'invite', navigateUrl: 'workspace' }))
  const url = await handleProviderAuth(
    ctx,
    {} as any,
    {},
    'https://front.example',
    'google',
    state,
    {},
    'user@example.com',
    'First',
    'Last',
    { type: SocialIdType.GOOGLE, value: 'user@example.com' },
    false
  )
  const query = new URLSearchParams(decodeURIComponent(new URL(url).search.slice(1)))
  expect(query.get('token')).toBe('token')
  expect(query.get('inviteId')).toBe('invite')
  expect(query.get('navigateUrl')).toBe('workspace')
})
