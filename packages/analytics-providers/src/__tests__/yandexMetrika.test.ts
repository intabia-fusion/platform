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
  location: { pathname: string }
}

function setup (pathname: string = '/signup'): { provider: YandexMetrikaProvider, ym: jest.Mock } {
  const win: TestWindow = { ym: jest.fn(), location: { pathname } }
  ;(globalThis as any).window = win

  const provider = new YandexMetrikaProvider()
  // counterId normally comes from init(), which also injects the tag script - not needed here.
  ;(provider as any).counterId = COUNTER_ID

  return { provider, ym: win.ym }
}

describe('YandexMetrikaProvider signup goals', () => {
  afterEach(() => {
    delete (globalThis as any).window
  })

  it('reports a click on the enabled signup button as signup_click', () => {
    const { provider, ym } = setup()

    provider.handleEvent('signup.submitAttempt', { blocked: false, reason: '', via: 'click', method: 'otp' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click', {
      method: 'otp',
      invite: false,
      via: 'click'
    })
  })

  it('reports Enter as an attempt as well', () => {
    const { provider, ym } = setup()

    provider.handleEvent('signup.submitAttempt', { blocked: false, reason: '', via: 'enter', method: 'otp' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click', {
      method: 'otp',
      invite: false,
      via: 'enter'
    })
  })

  it('reports a click on a disabled button as signup_click_blocked with the reason', () => {
    const { provider, ym } = setup()

    provider.handleEvent('signup.submitAttempt', { blocked: true, reason: 'consents', via: 'click', method: 'email' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click_blocked', {
      method: 'email',
      invite: false,
      via: 'click',
      reason: 'consents'
    })
  })

  it('marks attempts coming from an invite link', () => {
    const { provider, ym } = setup('/login/join')

    provider.handleEvent('signup.submitAttempt', { blocked: true, reason: 'invalid', via: 'enter', method: 'otp' })

    expect(ym).toHaveBeenCalledWith(COUNTER_ID, 'reachGoal', 'signup_click_blocked', {
      method: 'otp',
      invite: true,
      via: 'enter',
      reason: 'invalid'
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
})
