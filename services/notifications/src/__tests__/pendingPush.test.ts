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

import type { AccountUuid, Doc, Ref } from '@hcengineering/core'
import type { QueueNotifyMessage } from '@hcengineering/notification'

import { PendingPushHolder, type HeldPush } from '../pendingPush'

const acc = 'acc-1' as AccountUuid
const other = 'acc-2' as AccountUuid
const doc = 'doc-1' as Ref<Doc>

function held (overrides: Partial<HeldPush> = {}): HeldPush {
  const id = overrides.notificationId ?? 'msg-1'
  return {
    account: acc,
    notificationId: id,
    objectId: doc,
    createdOn: 100,
    message: { id } as unknown as QueueNotifyMessage,
    ...overrides
  }
}

function make (): {
  holder: PendingPushHolder
  publish: jest.Mock
  isRead: jest.Mock
  onError: jest.Mock
} {
  const publish = jest.fn().mockResolvedValue(undefined)
  const isRead = jest.fn().mockResolvedValue(false)
  const onError = jest.fn()
  const holder = new PendingPushHolder({ holdMs: 60_000, publish, isRead, onError })
  return { holder, publish, isRead, onError }
}

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('PendingPushHolder', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('publishes an unread push when the cap ends, after checking the read position', async () => {
    const { holder, publish, isRead } = make()
    holder.hold(held())
    expect(holder.size).toBe(1)

    jest.advanceTimersByTime(59_999)
    expect(publish).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    await flushPromises()
    expect(isRead).toHaveBeenCalledWith(acc, doc, 100)
    expect(publish).toHaveBeenCalledWith({ id: 'msg-1' })
    expect(holder.size).toBe(0)
  })

  it('drops the push when the person read the message meanwhile', async () => {
    const { holder, publish, isRead } = make()
    isRead.mockResolvedValue(true)
    holder.hold(held())

    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(publish).not.toHaveBeenCalled()
    expect(holder.size).toBe(0)
  })

  it('cancels by object up to the read position, keeping newer pushes and other accounts', async () => {
    const { holder, publish } = make()
    holder.hold(held({ notificationId: 'old', createdOn: 100 }))
    holder.hold(held({ notificationId: 'newer', createdOn: 200 }))
    holder.hold(held({ notificationId: 'theirs', createdOn: 100, account: other }))

    expect(holder.cancelByObject(acc, doc, 150)).toBe(1)
    expect(holder.size).toBe(2)

    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(publish.mock.calls.map(([m]) => m.id).sort((a, b) => a.localeCompare(b))).toEqual(['newer', 'theirs'])
  })

  it('cancels one push by id and reports whether it was there', () => {
    const { holder } = make()
    holder.hold(held())
    expect(holder.cancel(acc, 'msg-1')).toBe(true)
    expect(holder.cancel(acc, 'msg-1')).toBe(false)
    expect(holder.size).toBe(0)
  })

  it('a second hold of the same push replaces the timer instead of doubling it', async () => {
    const { holder, publish } = make()
    holder.hold(held())
    jest.advanceTimersByTime(30_000)
    holder.hold(held())
    expect(holder.size).toBe(1)

    jest.advanceTimersByTime(30_000)
    await flushPromises()
    expect(publish).not.toHaveBeenCalled()

    jest.advanceTimersByTime(30_000)
    await flushPromises()
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('releases the pushes of one account at once when they leave, others keep waiting', async () => {
    const { holder, publish } = make()
    holder.hold(held({ notificationId: 'mine' }))
    holder.hold(held({ notificationId: 'theirs', account: other }))

    await holder.flushByAccount(acc)
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['mine'])
    expect(holder.size).toBe(1)
  })

  it('flushAll releases everything, still skipping what was read', async () => {
    const { holder, publish, isRead } = make()
    holder.hold(held({ notificationId: 'unread' }))
    holder.hold(held({ notificationId: 'read', createdOn: 50 }))
    isRead.mockImplementation(async (_a: AccountUuid, _d: Ref<Doc>, createdOn: number) => createdOn === 50)

    await holder.flushAll()
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['unread'])
    expect(holder.size).toBe(0)
  })

  it('reports a failing publish and never throws', async () => {
    const { holder, publish, onError } = make()
    publish.mockRejectedValue(new Error('broker down'))
    holder.hold(held())

    await expect(holder.flushAll()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ notificationId: 'msg-1' }))
  })
})
