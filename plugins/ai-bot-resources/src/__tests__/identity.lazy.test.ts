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

jest.mock('svelte/store', () => ({
  writable: (initial: unknown) => {
    let value = initial
    const subs = new Set<(v: unknown) => void>()
    return {
      subscribe: (run: (v: unknown) => void) => {
        subs.add(run)
        run(value)
        return () => subs.delete(run)
      },
      set: (v: unknown) => {
        value = v
        subs.forEach((s) => {
          s(value)
        })
      },
      update: (fn: (v: unknown) => unknown) => {
        value = fn(value)
        subs.forEach((s) => {
          s(value)
        })
      }
    }
  },
  get: (store: { subscribe: (run: (v: unknown) => void) => () => void }) => {
    let value: unknown
    store.subscribe((v) => {
      value = v
    })()
    return value
  }
}))

jest.mock('@hcengineering/contact', () => ({
  __esModule: true,
  default: { class: { SocialIdentity: 'contact:class:SocialIdentity', Person: 'contact:class:Person' } },
  getFirstName: (name: string) => name.split(',')[1] ?? name
}))

jest.mock('@hcengineering/ai-bot', () => ({ aiBotEmailSocialKey: 'email:bot@example.com' }))

const mockQueryInstances: Array<{ query: jest.Mock, unsubscribe: jest.Mock }> = []
const mockOnClientCallbacks: Array<() => void> = []

jest.mock('@hcengineering/presentation', () => ({
  createQuery: jest.fn(() => {
    const inst = { query: jest.fn(), unsubscribe: jest.fn() }
    mockQueryInstances.push(inst)
    return inst
  }),
  onClient: jest.fn((cb: () => void) => {
    mockOnClientCallbacks.push(cb)
    cb()
  })
}))

function identityCalls (): unknown[][] {
  return mockQueryInstances.flatMap((inst) =>
    inst.query.mock.calls.filter((c) => c[0] === 'contact:class:SocialIdentity')
  )
}

describe('AI bot identity loaded on demand', () => {
  it('sends nothing with the client', async () => {
    await import('../utils')

    expect(identityCalls()).toHaveLength(0)
  })

  it('queries the identity once for concurrent callers and resolves when it answers', async () => {
    const { ensureAiBotIdentityLoaded, aiBotSocialIdentityStore, aiBotNameStore } = await import('../utils')
    const { get } = await import('svelte/store')

    const first = ensureAiBotIdentityLoaded()
    const second = ensureAiBotIdentityLoaded()
    expect(identityCalls()).toHaveLength(1)

    const identity = { _id: 'sid-bot', attachedTo: 'person-bot' }
    ;(identityCalls()[0][2] as (res: unknown[]) => void)([identity])
    await Promise.all([first, second])

    expect(get(aiBotSocialIdentityStore)).toBe(identity)
    const personCall = mockQueryInstances
      .flatMap((inst) => inst.query.mock.calls)
      .find((c) => c[0] === 'contact:class:Person')
    expect(personCall?.[1]).toEqual({ _id: 'person-bot' })
    ;(personCall?.[2] as (res: unknown[]) => void)([{ name: 'Bot,Julia' }])
    expect(get(aiBotNameStore)).toBe('Julia')
  })
})
