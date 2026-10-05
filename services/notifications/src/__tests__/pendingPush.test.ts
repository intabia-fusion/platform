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
    readBy: 'position',
    provider: 'push-provider' as any,
    message: { id } as unknown as QueueNotifyMessage,
    ...overrides
  }
}

function make (): {
  holder: PendingPushHolder
  publish: jest.Mock
  areRead: jest.Mock
  onError: jest.Mock
} {
  const publish = jest.fn().mockResolvedValue(undefined)
  const areRead = jest.fn(async (held: HeldPush[]) => held.map(() => false))
  const onError = jest.fn()
  const holder = new PendingPushHolder({ holdMs: 60_000, publish, areRead, onError })
  return { holder, publish, areRead, onError }
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
    const { holder, publish, areRead } = make()
    holder.hold(held())
    expect(holder.size).toBe(1)

    jest.advanceTimersByTime(59_999)
    expect(publish).not.toHaveBeenCalled()

    jest.advanceTimersByTime(1)
    await flushPromises()
    expect(areRead).toHaveBeenCalledWith([expect.objectContaining({ account: acc, objectId: doc, createdOn: 100 })])
    expect(publish).toHaveBeenCalledWith({ id: 'msg-1' })
    expect(holder.size).toBe(0)
  })

  it('drops the push when the person read the message meanwhile', async () => {
    const { holder, publish, areRead } = make()
    areRead.mockResolvedValue([true])
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

    expect(holder.cancelByObject(acc, doc, 150)).toEqual(['old'])
    expect(holder.size).toBe(2)

    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(publish.mock.calls.map(([m]) => m.id).sort((a, b) => a.localeCompare(b))).toEqual(['newer', 'theirs'])
  })

  it('cancels everything held for the account, whatever it is read by, and nothing of the others', async () => {
    const { holder, publish } = make()
    holder.hold(held({ notificationId: 'msg', createdOn: 100 }))
    holder.hold(held({ notificationId: 'reaction', createdOn: 120, readBy: 'reactions' }))
    holder.hold(held({ notificationId: 'theirs', createdOn: 100, account: other }))

    expect(holder.cancelByAccount(acc).sort((a, b) => a.localeCompare(b))).toEqual(['msg', 'reaction'])
    expect(holder.size).toBe(1)

    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['theirs'])
  })

  it('leaves a push read by its own id alone when the document is read by position', async () => {
    const { holder, publish } = make()
    holder.hold(held({ notificationId: 'msg', createdOn: 100 }))
    holder.hold(held({ notificationId: 'reaction', createdOn: 120, readBy: 'reactions' }))
    holder.hold(held({ notificationId: 'mention', createdOn: 130, readBy: 'mentions' }))
    holder.hold(held({ notificationId: 'common', createdOn: 140, readBy: 'commons' }))

    expect(holder.cancelByObject(acc, doc, 200)).toEqual(['msg'])
    expect(holder.size).toBe(3)
    expect(holder.cancel(acc, 'reaction')).toBe(true)

    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(publish.mock.calls.map(([m]) => m.id).sort((a, b) => a.localeCompare(b))).toEqual(['common', 'mention'])
  })

  it('publishes at once what is held after flushAll, and flushAll waits for a release in flight', async () => {
    const { holder, publish, areRead } = make()
    let answer: (read: boolean[]) => void = () => {}
    areRead.mockImplementationOnce(
      async () =>
        await new Promise<boolean[]>((resolve) => {
          answer = resolve
        })
    )
    holder.hold(held({ notificationId: 'in-flight' }))
    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(holder.size).toBe(0)

    let flushed = false
    const flushing = holder.flushAll().then(() => {
      flushed = true
    })
    await flushPromises()
    expect(flushed).toBe(false)
    answer([false])
    await flushing
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['in-flight'])

    holder.hold(held({ notificationId: 'late' }))
    await flushPromises()
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['in-flight', 'late'])
    expect(holder.size).toBe(0)
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
    const { holder, publish, areRead } = make()
    holder.hold(held({ notificationId: 'unread' }))
    holder.hold(held({ notificationId: 'read', createdOn: 50 }))
    areRead.mockImplementation(async (held: HeldPush[]) => held.map((it) => it.createdOn === 50))

    await holder.flushAll()
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['unread'])
    expect(holder.size).toBe(0)
  })

  it('releases a burst in one batch with one read check, and stops ticking once empty', async () => {
    const { holder, publish, areRead } = make()
    holder.hold(held({ notificationId: 'first' }))
    // Three more within the next second: their caps end between two ticks and one tick takes all.
    jest.advanceTimersByTime(100)
    holder.hold(held({ notificationId: 'a' }))
    jest.advanceTimersByTime(400)
    holder.hold(held({ notificationId: 'b' }))
    holder.hold(held({ notificationId: 'c', account: other }))
    expect(jest.getTimerCount()).toBe(1)

    jest.advanceTimersByTime(59_500)
    await flushPromises()
    expect(areRead).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(1000)
    await flushPromises()
    expect(areRead).toHaveBeenCalledTimes(2)
    expect(areRead.mock.calls[1][0].map((it: HeldPush) => it.notificationId)).toEqual(['a', 'b', 'c'])
    expect(publish).toHaveBeenCalledTimes(4)
    expect(holder.size).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('retries a failed read check a few times, then publishes unchecked rather than losing the push', async () => {
    const { holder, publish, areRead, onError } = make()
    areRead.mockRejectedValue(new Error('db down'))
    holder.hold(held({ notificationId: 'a' }))
    holder.hold(held({ notificationId: 'b' }))

    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(areRead).toHaveBeenCalledTimes(1)
    expect(publish).not.toHaveBeenCalled()
    expect(holder.size).toBe(2)

    // Two more tries five seconds apart; the last failure lets the pushes go.
    jest.advanceTimersByTime(5_000)
    await flushPromises()
    expect(areRead).toHaveBeenCalledTimes(2)
    expect(publish).not.toHaveBeenCalled()

    jest.advanceTimersByTime(5_000)
    await flushPromises()
    expect(areRead).toHaveBeenCalledTimes(3)
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['a', 'b'])
    expect(onError).not.toHaveBeenCalled()
    expect(holder.size).toBe(0)
  })

  it('a check that recovers on a retry still skips what was read', async () => {
    const { holder, publish, areRead } = make()
    areRead.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce([true])
    holder.hold(held())

    jest.advanceTimersByTime(60_000)
    await flushPromises()
    expect(areRead).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(5_000)
    await flushPromises()
    expect(areRead).toHaveBeenCalledTimes(2)
    expect(publish).not.toHaveBeenCalled()
    expect(holder.size).toBe(0)
  })

  it('on close a failed read check publishes unchecked at once: nothing can wait for a retry', async () => {
    const { holder, publish, areRead, onError } = make()
    areRead.mockRejectedValue(new Error('db down'))
    holder.hold(held({ notificationId: 'a' }))

    await holder.flushAll()
    expect(publish.mock.calls.map(([m]) => m.id)).toEqual(['a'])
    expect(onError).not.toHaveBeenCalled()
    expect(holder.size).toBe(0)
  })

  it('a cancel by id takes down every provider of the notification', () => {
    const { holder } = make()
    holder.hold(held({ notificationId: 'n' }))
    holder.hold(held({ notificationId: 'n', provider: 'email-provider' as any }))
    holder.hold(held({ notificationId: 'm' }))
    expect(holder.cancel(acc, 'n')).toBe(true)
    expect(holder.size).toBe(1)
  })

  it('reports a failing publish and never throws', async () => {
    const { holder, publish, onError } = make()
    publish.mockRejectedValue(new Error('broker down'))
    holder.hold(held())

    await expect(holder.flushAll()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ notificationId: 'msg-1' }))
  })
})
