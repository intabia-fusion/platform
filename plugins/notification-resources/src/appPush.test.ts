/* eslint-disable import/first */
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

const g = globalThis as any
g.__mockOnClient = undefined
g.__mockQueryCallback = undefined
g.__mockRemove = jest.fn(async () => {})

jest.mock('@hcengineering/notification', () => ({
  __esModule: true,
  default: { class: { AppPushNotification: 'AppPushNotification' } }
}))
jest.mock('@hcengineering/core', () => ({
  AccountRole: { ReadOnlyGuest: 'READONLYGUEST' },
  getCurrentAccount: () => ({ uuid: 'me', role: 'USER' })
}))
jest.mock('@hcengineering/presentation', () => ({
  createQuery: () => ({
    query: (_class: any, _query: any, callback: any) => {
      g.__mockQueryCallback = callback
    },
    unsubscribe: jest.fn()
  }),
  getClient: () => ({ remove: g.__mockRemove }),
  onClient: (listener: any) => {
    g.__mockOnClient = listener
  }
}))
jest.mock('@hcengineering/ui', () => ({
  deviceOptionsStore: {
    subscribe: (run: any) => {
      run({ isMobile: false })
      return () => {}
    }
  },
  desktopPlatform: true
}))
jest.mock('./webpush', () => ({
  checkPermission: jest.fn(),
  subscribePush: jest.fn(),
  pushAllowed: {
    subscribe: (run: any) => {
      run(false)
      return () => {}
    }
  }
}))

import { appPushStore, removeAppPush } from './appPush'

function collect (): { batches: string[][], stop: () => void } {
  const batches: string[][] = []
  const stop = appPushStore.subscribe((items) => {
    if (items.length > 0) batches.push(items.map((it) => it._id))
  })
  return { batches, stop }
}

const push = (id: string): any => ({ _id: id })

describe('appPushStore', () => {
  beforeAll(async () => {
    await g.__mockOnClient({}, { uuid: 'me' })
  })

  beforeEach(() => {
    g.__mockQueryCallback([])
  })

  it('emits a push once while it stays in the query result', () => {
    const { batches, stop } = collect()

    g.__mockQueryCallback([push('p1')])
    // The query fires again with the same push: reconnect, or another push arrived before removal
    g.__mockQueryCallback([push('p1')])
    g.__mockQueryCallback([push('p1'), push('p2')])

    expect(batches).toEqual([['p1'], ['p2']])
    stop()
  })

  it('does not replay a handled push to a late subscriber', async () => {
    const first = collect()
    g.__mockQueryCallback([push('p1'), push('p2')])
    await removeAppPush(push('p1'))
    first.stop()

    // p1 is handled, p2 is not: only p2 is still owed to someone
    const late = collect()
    expect(late.batches).toEqual([['p2']])
    late.stop()
  })

  it('replays a push nobody has handled', () => {
    g.__mockQueryCallback([push('p1')])

    const late = collect()
    expect(late.batches).toEqual([['p1']])
    late.stop()
  })
})
