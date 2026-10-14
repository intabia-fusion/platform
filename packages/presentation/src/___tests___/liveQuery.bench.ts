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

import core, { bench, type Client, describeBench, reduceCalls, setCurrentAccount } from '@hcengineering/core'
import { createQuery, setClient } from '../utils'

// BENCH=1 pnpm bench: presentation LiveQuery bookkeeping, the client LiveQuery is mocked out.
jest.mock('svelte', () => ({ onDestroy: () => {} }))
jest.mock('svelte/store', () => {
  const writable = (value?: any): any => ({
    set: (v: any) => {
      value = v
    },
    update: () => {},
    subscribe: (s: (v: any) => void) => {
      s(value)
      return () => {}
    }
  })
  const get = (store: any): any => {
    let v: any
    store.subscribe((it: any) => (v = it))
    return v
  }
  return { writable, get, derived: () => writable(undefined), readable: writable }
})
jest.mock('@hcengineering/ui', () => ({
  getRawCurrentLocation: () => ({ path: [] }),
  workspaceId: undefined,
  isSafari: () => false
}))
jest.mock('@hcengineering/query', () => ({
  LiveQuery: class {
    query (): () => void {
      return () => {}
    }

    async close (): Promise<void> {}

    async refreshConnect (): Promise<void> {}

    isClosed (): boolean {
      return false
    }
  }
}))

// A macrotask settles both the microtask flush and the reduceCalls chain: a fair comparison.
// MessageChannel is a macrotask without the 1ms setTimeout floor, which would hide the cost.
async function settle (): Promise<void> {
  const { port1, port2 } = new MessageChannel()
  await new Promise((resolve) => {
    port1.onmessage = resolve
    port2.postMessage(null)
  })
  port1.close()
}

describeBench('presentation LiveQuery', () => {
  beforeAll(async () => {
    setCurrentAccount({ uuid: 'bench', role: 'USER', primarySocialId: 'bench', socialIds: ['bench'] } as any)
    await setClient({ findAll: async () => [], notify: () => {}, close: async () => {} } as unknown as Client)
  })

  it('deferral primitives, 100 coalesced calls', async () => {
    let runs = 0
    const reduced = reduceCalls(async () => {
      runs++
    })
    await bench('reduceCalls x100', async () => {
      let last: Promise<void> = Promise.resolve()
      for (let i = 0; i < 100; i++) last = reduced()
      await last
    })

    let scheduled = false
    await bench('queueMicrotask + flag x100', async () => {
      await new Promise<void>((resolve) => {
        for (let i = 0; i < 100; i++) {
          if (!scheduled) {
            scheduled = true
            queueMicrotask(() => {
              scheduled = false
              runs++
              resolve()
            })
          }
        }
      })
    })
    if (runs === 0) throw new Error('nothing ran')
  })

  it('query() 10 times in one tick', async () => {
    const q = createQuery(true)
    const callback = (): void => {}
    let n = 0
    await bench('query x10 + settle', async () => {
      for (let i = 0; i < 10; i++) q.query(core.class.Doc, { name: `q${n++}` } as any, callback)
      await settle()
    })
    q.unsubscribe()
  })

  it('A -> B -> A in one tick', async () => {
    const q = createQuery(true)
    const callback = (): void => {}
    await bench('query A, B, A + settle', async () => {
      q.query(core.class.Doc, { name: 'A' } as any, callback)
      q.query(core.class.Doc, { name: 'B' } as any, callback)
      q.query(core.class.Doc, { name: 'A' } as any, callback)
      await settle()
      q.unsubscribe()
    })
  })

  it('create, query, unsubscribe', async () => {
    const callback = (): void => {}
    let n = 0
    await bench('createQuery + query + settle + unsubscribe', async () => {
      const q = createQuery(true)
      q.query(core.class.Doc, { name: `c${n++}` } as any, callback)
      await settle()
      q.unsubscribe()
    })
  })

  it('settle alone (baseline for the cases above)', async () => {
    await bench('settle', settle)
  })
})
