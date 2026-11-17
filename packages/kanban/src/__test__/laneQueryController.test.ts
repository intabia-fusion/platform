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

import type { Class, Doc, Ref } from '@hcengineering/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLaneQueryController } from '../laneQueryController'
import type { DocWithRank } from '../types'
import { fakeQueries } from './fakePresentation'

vi.mock('@hcengineering/presentation', async () => await import('./fakePresentation'))
const cls = 'test:Card' as Ref<Class<DocWithRank>>
const groups = (count: number): Map<string, Array<Ref<Doc>>> =>
  new Map(Array.from({ length: count }, (_, index) => [String(index), [String(index) as Ref<Doc>]]))
const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  fakeQueries.calls.length = 0
})

describe('lane query ownership and batching', () => {
  it.each([1, 10, 100])('merges a synchronous burst of %s lane answers once', async (count) => {
    const publish = vi.fn()
    const controller = createLaneQueryController(publish)
    controller.sync(groups(count), cls, undefined)
    publish.mockClear()
    const docs = fakeQueries.calls.map(
      (call, index) => ({ _id: String(index) as Ref<DocWithRank> }) as unknown as DocWithRank
    )
    fakeQueries.calls.forEach((call, index) => {
      call.callback([docs[index]])
    })
    expect(publish).not.toHaveBeenCalled()
    await settle()
    expect(publish).toHaveBeenCalledTimes(1)
    const [loaded, keys] = publish.mock.calls[0]
    expect(loaded.size).toBe(count)
    expect(keys.size).toBe(count)
    for (const doc of docs) expect(loaded.get(doc._id)).toBe(doc)
    controller.sync(groups(count), cls, undefined)
    expect(fakeQueries.calls).toHaveLength(count)
    controller.destroy()
  })

  it('drops queued refreshes and ignores callbacks after destroy', async () => {
    const publish = vi.fn()
    const controller = createLaneQueryController(publish)
    controller.sync(groups(2), cls, undefined)
    publish.mockClear()
    fakeQueries.calls[0].callback([])
    controller.destroy()
    fakeQueries.calls[1].callback([])
    await settle()
    expect(publish).not.toHaveBeenCalled()
    expect(fakeQueries.calls.every((call) => call.owner.closed)).toBe(true)
    controller.sync(groups(3), cls, undefined)
    expect(fakeQueries.calls).toHaveLength(2)
  })

  it('ignores an older answer after the same lane changes its requested ids', async () => {
    const publish = vi.fn()
    const controller = createLaneQueryController(publish)
    controller.sync(groups(1), cls, undefined)
    const old = fakeQueries.calls[0]
    controller.sync(new Map([['0', ['new' as Ref<Doc>]]]), cls, undefined)
    publish.mockClear()
    old.callback([{ _id: 'old' }])
    await settle()
    expect(publish).not.toHaveBeenCalled()
    fakeQueries.calls[1].callback([{ _id: 'new' }])
    await settle()
    expect([...publish.mock.calls[0][0].keys()]).toEqual(['new'])
    controller.destroy()
  })

  it('clears answered lane markers when options recreate the queries', async () => {
    const publish = vi.fn()
    const controller = createLaneQueryController(publish)
    controller.sync(groups(1), cls, undefined)
    fakeQueries.calls[0].callback([])
    await settle()
    expect(publish.mock.calls.at(-1)?.[1].size).toBe(1)
    controller.sync(groups(1), cls, { limit: 2 })
    expect(publish.mock.calls.at(-1)?.[1].size).toBe(0)
    expect(fakeQueries.calls[0].owner.closed).toBe(true)
    controller.destroy()
  })

  it('replaces class-specific queries and ignores the previous class answer', async () => {
    const publish = vi.fn()
    const controller = createLaneQueryController(publish)
    controller.sync(groups(1), cls, undefined)
    const old = fakeQueries.calls[0]
    const otherClass = 'test:OtherCard' as Ref<Class<DocWithRank>>
    controller.sync(groups(1), otherClass, undefined)
    expect(fakeQueries.calls).toHaveLength(2)
    expect(fakeQueries.calls[1].cls).toBe(otherClass)
    expect(old.owner.closed).toBe(true)
    publish.mockClear()
    old.callback([{ _id: 'old' }])
    await settle()
    expect(publish).not.toHaveBeenCalled()
    fakeQueries.calls[1].callback([{ _id: 'new' }])
    await settle()
    expect([...publish.mock.calls[0][0].keys()]).toEqual(['new'])
    controller.destroy()
  })
})
