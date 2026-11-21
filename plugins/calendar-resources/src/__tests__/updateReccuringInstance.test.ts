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

import type { ReccuringInstance } from '@hcengineering/calendar'
import type { Client, Doc } from '@hcengineering/core'
import { showPopup } from '@hcengineering/ui'
import { updateReccuringInstance } from '../utils'

let client: Client

jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: { metadata: {} },
  createQuery: () => ({ query: jest.fn() }),
  getClient: () => client,
  onClient: jest.fn()
}))

jest.mock('@hcengineering/ui', () => ({
  DAY: 24 * 60 * 60 * 1000,
  showPopup: jest.fn(),
  closePopup: jest.fn()
}))

jest.mock('svelte/store', () => {
  const writable = (value: unknown): unknown => {
    let current = value
    const subscribers = new Set<(v: unknown) => void>()
    return {
      set: (v: unknown) => {
        current = v
        subscribers.forEach((fn): void => {
          fn(current)
        })
      },
      update: (fn: (v: unknown) => unknown) => {
        current = fn(current)
        subscribers.forEach((s): void => {
          s(current)
        })
      },
      subscribe: (fn: (v: unknown) => void) => {
        subscribers.add(fn)
        fn(current)
        return () => subscribers.delete(fn)
      }
    }
  }
  return { writable }
})

// `utils.ts` also re-exports calendar helpers that pull svelte components; the test only needs the
// recurring-update path, so the components are stubbed out.
jest.mock('../components/CalDavAccess.svelte', () => ({}), { virtual: true })

const showPopupMock = showPopup as unknown as jest.Mock

const master = {
  _id: 'master:1',
  _class: 'calendar:class:ReccuringEvent',
  eventId: 'series:1',
  date: 1000,
  dueDate: 2000,
  title: 'master'
} as unknown as Doc

function occurrence (extra: Record<string, unknown> = {}): ReccuringInstance {
  return {
    _id: 'instance:1',
    _class: 'calendar:class:ReccuringInstance',
    space: 'space:1',
    recurringEventId: 'series:1',
    calendar: 'calendar:1',
    virtual: true,
    date: 5000,
    dueDate: 6000,
    title: 'occurrence',
    ...extra
  } as unknown as ReccuringInstance
}

function fakeClient (found: Doc | undefined, update: jest.Mock): Client {
  return {
    findOne: async () => found,
    update
  } as unknown as Client
}

describe('updateReccuringInstance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('applies the change to the whole series without asking which scope to use', async () => {
    const update = jest.fn()
    client = fakeClient(master, update)

    const ok = await updateReccuringInstance({ title: 'renamed' } as any, occurrence())

    expect(ok).toBe(true)
    expect(showPopupMock).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(master, { title: 'renamed' })
  })

  it('keeps the shift the user made, not the time of the occurrence', async () => {
    const update = jest.fn()
    client = fakeClient(master, update)

    // The occurrence was moved an hour later, so the series moves an hour later as well.
    const ops: Record<string, number> = { date: 5000 + 3600000, dueDate: 6000 + 3600000 }
    await updateReccuringInstance(ops as any, occurrence())

    expect(update).toHaveBeenCalledWith(master, { date: 1000 + 3600000, dueDate: 2000 + 3600000 })
  })

  it('updates an occurrence that is a real document in place', async () => {
    const update = jest.fn()
    client = fakeClient(master, update)
    const stored = occurrence({ virtual: false })

    const ok = await updateReccuringInstance({ title: 'renamed' } as any, stored)

    expect(ok).toBe(true)
    expect(showPopupMock).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith(stored, { title: 'renamed' })
  })

  it('reports failure when the series is gone', async () => {
    const update = jest.fn()
    client = fakeClient(undefined, update)

    const ok = await updateReccuringInstance({ title: 'renamed' } as any, occurrence())

    expect(ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
})
