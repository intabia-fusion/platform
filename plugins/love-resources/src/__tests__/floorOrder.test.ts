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

import type { Ref, TxOperations } from '@hcengineering/core'
import type { Floor } from '@hcengineering/love'
import { persistFloorOrder, reorderFloors } from '../floors'

const a = 'floor:a' as Ref<Floor>
const b = 'floor:b' as Ref<Floor>
const c = 'floor:c' as Ref<Floor>

function floor (id: Ref<Floor>, order?: number): Floor {
  return { _id: id, _class: 'love:class:Floor', space: 'space:1', name: String(id), order } as unknown as Floor
}

interface Recorded {
  method: string
  args: any[]
}

function createFakeClient (): { client: TxOperations, calls: Recorded[] } {
  const calls: Recorded[] = []
  const client = {
    diffUpdate: async (...args: any[]) => {
      calls.push({ method: 'diffUpdate', args })
    }
  } as unknown as TxOperations
  return { client, calls }
}

describe('reorderFloors', () => {
  it('moves the dragged floor onto the place of the target one', () => {
    expect(reorderFloors([floor(a), floor(b), floor(c)], c, a)).toEqual([c, a, b])
  })

  it('keeps the order when a floor is dropped onto itself', () => {
    expect(reorderFloors([floor(a), floor(b)], b, b)).toEqual([a, b])
  })

  it('ignores ids the list does not contain', () => {
    expect(reorderFloors([floor(a), floor(b)], 'floor:unknown' as Ref<Floor>, a)).toEqual([a, b])
  })
})

describe('persistFloorOrder', () => {
  it('writes only the floors whose position actually changed', async () => {
    const { client, calls } = createFakeClient()
    // The list is already 0,1,2 - nothing to write at all.
    await persistFloorOrder(client, [floor(a, 0), floor(b, 1), floor(c, 2)], [a, b, c])
    expect(calls).toHaveLength(0)
  })

  it('rewrites every moved floor and skips the one that stayed', async () => {
    const { client, calls } = createFakeClient()
    const floors = [floor(a, 0), floor(b, 1), floor(c, 2)]

    await persistFloorOrder(client, floors, [c, a, b])

    expect(calls.map((it) => [it.args[0]._id, it.args[1].order])).toEqual([
      [c, 0],
      [a, 1],
      [b, 2]
    ])
  })
})
