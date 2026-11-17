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

import { YandexMetrikaProvider } from '../yandexMetrika'

const COUNTER_ID = 123

interface TestWindow {
  ym: jest.Mock
  location: URL
}

function setup (pathname: string = '/signup'): { provider: YandexMetrikaProvider, ym: jest.Mock } {
  const win: TestWindow = { ym: jest.fn(), location: new URL(pathname, 'https://platform.test') }
  ;(globalThis as any).window = win
  ;(globalThis as any).document ??= { referrer: '' }

  const provider = new YandexMetrikaProvider()
  // counterId normally comes from init(), which also injects the tag script - not needed here.
  ;(provider as any).counterId = COUNTER_ID

  return { provider, ym: win.ym }
}

describe('YandexMetrikaProvider signup goals', () => {
  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).document
  })

  it('reports a click on the enabled signup button as signup_click', () => {
    const { provider, ym } = setup()

    provider.handleEvent('signup.submitAttempt', { via: 'click', method: 'otp' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click', {
      method: 'otp',
      via: 'click',
      invite: false
    })
  })

  it('reports Enter as an attempt as well', () => {
    const { provider, ym } = setup()

    provider.handleEvent('signup.submitAttempt', { via: 'enter', method: 'otp' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click', {
      method: 'otp',
      via: 'enter',
      invite: false
    })
  })

  it('reports a click on a disabled button as signup_click_blocked with the reason', () => {
    const { provider, ym } = setup()

    provider.handleEvent('signup.submitAttempt', { reason: 'consents', via: 'click', method: 'email' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click_blocked', {
      method: 'email',
      via: 'click',
      reason: 'consents',
      invite: false
    })
  })

  it('marks attempts coming from an invite link', () => {
    const { provider, ym } = setup('/login/join')

    provider.handleEvent('signup.submitAttempt', { reason: 'invalid', via: 'enter', method: 'otp' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click_blocked', {
      method: 'otp',
      via: 'enter',
      reason: 'invalid',
      invite: true
    })
  })

  it('keeps reporting a successful submit as signup_submit', () => {
    const { provider, ym } = setup()

    provider.handleEvent('signup.viaEmail', { ok: true })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_submit', { method: 'email', invite: false })
  })

  it('does not report goals for unrelated events', () => {
    const { provider, ym } = setup()

    provider.handleEvent('login.viaPassword', { ok: true })
    provider.handleEvent('signup.viaEmail', { ok: false })

    expect(ym).not.toHaveBeenCalled()
  })

  it('only forwards known signup parameters and values', () => {
    const { provider, ym } = setup()
    provider.handleEvent('signup.submitAttempt', {
      method: 'otp',
      via: 'click',
      token: 'SECRET',
      email: 'guest@example.com'
    })
    expect(ym).toHaveBeenLastCalledWith(COUNTER_ID, 'reachGoal', 'signup_click', {
      method: 'otp',
      via: 'click',
      invite: false
    })

    provider.handleEvent('signup.submitAttempt', { method: 'SECRET', via: 'SECRET', reason: 'SECRET' })
    expect(ym).toHaveBeenLastCalledWith(COUNTER_ID, 'reachGoal', 'signup_click', { invite: false })

    provider.handleEvent('signup.SECRET.completed')
    expect(ym).toHaveBeenLastCalledWith(COUNTER_ID, 'reachGoal', 'signup_submit', { method: 'oauth', invite: false })
    expect(JSON.stringify(ym.mock.calls)).not.toContain('SECRET')
  })
})

describe('YandexMetrikaProvider lifecycle', () => {
  let scripts: HTMLScriptElement[]

  beforeEach(() => {
    scripts = []
    const parent = {
      appendChild: (script: HTMLScriptElement) => {
        Object.assign(script, { parentNode: parent })
        scripts.push(script)
      },
      insertBefore: (script: HTMLScriptElement) => {
        parent.appendChild(script)
      },
      removeChild: (script: HTMLScriptElement) => {
        scripts.splice(scripts.indexOf(script), 1)
      }
    }
    ;(globalThis as any).document = {
      getElementsByTagName: () => scripts,
      createElement: () => ({}),
      head: parent,
      referrer: '',
      title: 'Test'
    }
  })

  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).document
  })

  it.each(['/workbench/acme', '/login/selectWorkspace', '/admin', '/login/downloads', '/admin?next=/signup'])(
    'does not load the SDK on %s',
    (path) => {
      const { provider, ym } = setup(path)
      expect(provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })).toBe(true)
      expect(scripts).toHaveLength(0)
      expect(ym).not.toHaveBeenCalled()
      provider.handleEvent('signup.submitAttempt', { via: 'click' })
      expect(ym).not.toHaveBeenCalled()
    }
  )

  it.each(['/login', '/login/', '/login/signup', '/login/join', '/login/createWorkspace', '/onboard'])(
    'loads the SDK on %s',
    (path) => {
      const { provider, ym } = setup(path)
      provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
      expect(scripts).toHaveLength(1)
      expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'init', expect.objectContaining({ defer: true, webvisor: false }))
    }
  )

  it.each([
    '/login/auth?token=SECRET',
    '/login/auth?token%3DSECRET%26autoJoin%3Dtrue',
    '/login/auth?%74oken=SECRET',
    '/login/auth?access_token=SECRET',
    '/login/auth?id_token=SECRET',
    '/login/auth?refresh_token=SECRET',
    '/login/auth?code=SECRET&state=SECRET',
    '/login/loginLink#token=SECRET',
    '/login/recovery?id=SECRET',
    '/login/confirm?id=SECRET',
    '/login/join?inviteId=SECRET',
    '/login/signup?navigateUrl=%2Flogin%2Fauth%3Ftoken%3DSECRET',
    '/login/signup?utm_source=mail#token=SECRET'
  ])('does not initialize or send goals on a credential URL: %s', (path) => {
    const { provider, ym } = setup(path)
    provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
    provider.handleEvent('signup.viaOtp', { ok: true })
    expect(scripts).toHaveLength(0)
    expect(ym).not.toHaveBeenCalled()
    expect(window.location.href).toBe(new URL(path, 'https://platform.test').href)
  })

  it('does not load the SDK if the document referrer contains credentials', () => {
    const { provider, ym } = setup('/login/signup')
    Object.assign(document, { referrer: 'https://platform.test/login/auth?token=SECRET' })
    provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
    provider.navigate('/login/signup')
    provider.handleEvent('signup.submitAttempt', { method: 'otp', via: 'click' })
    expect(scripts).toHaveLength(0)
    expect(ym.mock.calls.filter((call) => call[1] !== 'destruct')).toHaveLength(0)
  })

  it('allows campaign attribution but strips query and fragment from explicit hits and referrers', () => {
    const { provider, ym } = setup('/login/signup?utm_source=mail&utm_campaign=autumn&yclid=123&gclid=456')
    Object.assign(document, { referrer: 'https://example.com/promo?utm_source=mail' })
    provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
    expect(ym).toHaveBeenLastCalledWith(COUNTER_ID, 'hit', 'https://platform.test/login/signup', {
      referer: 'https://example.com/promo',
      title: 'Test'
    })
    window.location.href = 'https://platform.test/login/createWorkspace?utm_source=mail'
    provider.navigate('/login/createWorkspace?utm_source=mail')
    expect(ym).toHaveBeenLastCalledWith(COUNTER_ID, 'hit', 'https://platform.test/login/createWorkspace', {
      referer: 'https://example.com/promo',
      title: 'Test'
    })
  })

  it('destroys the counter and clears pending initialization before a token page can load the SDK', () => {
    const { provider } = setup('/login/signup')
    delete window.ym
    provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
    const queue = window.ym.a
    const script = scripts[0]
    window.location.href = 'https://platform.test/login/auth?token=SECRET'
    provider.navigate('/login/auth?token=SECRET')
    expect(queue).toHaveLength(0)
    expect(scripts).toHaveLength(0)

    const lateSdk = jest.fn()
    window.ym = lateSdk
    script.onload?.(new Event('load'))
    expect(lateSdk).toHaveBeenCalledWith(COUNTER_ID, 'destruct')
    expect(lateSdk.mock.calls).toHaveLength(1)
    expect(window.ym).toBeUndefined()
  })

  it.each(['/workbench/acme', '/login/selectWorkspace', '/admin'])(
    'destroys the counter immediately when leaving for %s',
    (path) => {
      const { provider, ym } = setup()
      provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
      window.location.pathname = path
      provider.navigate(path)
      expect(ym).toHaveBeenLastCalledWith(COUNTER_ID, 'destruct')
      expect(scripts).toHaveLength(0)
      expect(window.ym).toBeUndefined()
    }
  )

  it('clears queued hits and goals if navigation wins the script download race', () => {
    const { provider } = setup()
    delete window.ym
    provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
    provider.handleEvent('signup.submitAttempt', { via: 'click' })
    const queue = window.ym.a
    const script = scripts[0]
    expect(queue.length).toBeGreaterThan(0)

    window.location.pathname = '/workbench/acme'
    provider.navigate('/workbench/acme')
    expect(queue).toHaveLength(0)

    const lateSdk = jest.fn()
    window.ym = lateSdk
    script.onload?.(new Event('load'))
    expect(lateSdk).toHaveBeenCalledWith(COUNTER_ID, 'destruct')
    expect(window.ym).toBeUndefined()
  })

  it('loads again when returning to signup after leaving the auth flow', () => {
    const { provider } = setup()
    provider.init({ YANDEX_METRIKA_ID: COUNTER_ID })
    window.location.pathname = '/workbench/acme'
    provider.navigate('/workbench/acme')
    window.location.pathname = '/login/signup'
    provider.navigate('/login/signup')
    expect(scripts).toHaveLength(1)
    expect(window.ym.a).toEqual(expect.arrayContaining([expect.objectContaining({ 1: 'init' })]))
  })
})
