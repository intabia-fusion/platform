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

import core, { type Client, type Doc, type FindResult, setCurrentAccount } from '@hcengineering/core'
import { createQuery, setClient } from '../utils'

interface Subscription {
  query: Record<string, any>
  active: boolean
}

jest.mock('svelte', () => ({ onDestroy: () => {} }))
jest.mock('svelte/store', () => {
  const writable = (value: any): any => {
    const subs = new Set<(v: any) => void>()
    return {
      set: (v: any) => {
        value = v
        subs.forEach((s) => {
          s(v)
        })
      },
      update: (fn: (v: any) => any) => {
        value = fn(value)
      },
      subscribe: (s: (v: any) => void) => {
        subs.add(s)
        s(value)
        return () => subs.delete(s)
      }
    }
  }
  const get = (store: any): any => {
    let v: any
    store.subscribe((it: any) => (v = it))()
    return v
  }
  return { writable, get, derived: () => writable(undefined), readable: writable }
})
jest.mock('@hcengineering/ui', () => ({ getRawCurrentLocation: () => ({ path: [] }), workspaceId: undefined }))
// Records subscriptions and answers each with its own query.
jest.mock('@hcengineering/query', () => ({
  LiveQuery: class {
    static subscriptions: Subscription[] = []

    query (_class: any, query: Record<string, any>, onResult: (res: any) => void): () => void {
      const sub: Subscription = { query, active: true }
      ;(this.constructor as any).subscriptions.push(sub)
      void Promise.resolve().then(() => {
        if (sub.active) onResult([{ query }])
      })
      return () => {
        sub.active = false
      }
    }

    async close (): Promise<void> {}

    isClosed (): boolean {
      return false
    }
  }
}))

const subscriptions = (): Subscription[] => (jest.requireMock('@hcengineering/query').LiveQuery as any).subscriptions

async function settle (): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('LiveQuery', () => {
  beforeAll(async () => {
    setCurrentAccount({ uuid: 'test', role: 'USER', primarySocialId: 'test', socialIds: ['test'] } as any)
    await setClient({ findAll: async () => [], notify: () => {} } as unknown as Client)
  })

  it('resubscribes to A after A -> B -> A within one tick', async () => {
    const q = createQuery(true)
    const received: string[] = []
    const callback = (res: FindResult<Doc>): void => {
      received.push((res[0] as any).query.name)
    }

    q.query(core.class.Doc, { name: 'A' } as any, callback)
    await settle()
    expect(received).toEqual(['A'])

    expect(q.query(core.class.Doc, { name: 'B' } as any, callback)).toBe(true)
    expect(q.query(core.class.Doc, { name: 'A' } as any, callback)).toBe(true)
    await settle()

    const active = subscriptions().filter((it) => it.active)
    expect(active.map((it) => it.query.name)).toEqual(['A'])
    expect(received[received.length - 1]).toBe('A')
  })

  it('does not requery the same request', async () => {
    const q = createQuery(true)
    const callback = (): void => {}
    expect(q.query(core.class.Doc, { name: 'C' } as any, callback)).toBe(true)
    expect(q.query(core.class.Doc, { name: 'C' } as any, callback)).toBe(false)
    await settle()
    expect(q.query(core.class.Doc, { name: 'C' } as any, callback)).toBe(false)
  })
})
