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

import type { Rank, Ref, TxOperations } from '@hcengineering/core'
import type { Floor } from '@hcengineering/love'
import { reorderFloors } from '../floors'
import { persistMovedRank, rankAfterMove } from '../order'

const a = 'floor:a' as Ref<Floor>
const b = 'floor:b' as Ref<Floor>
const c = 'floor:c' as Ref<Floor>

const first = '0|000001' as Rank
const second = '0|000002' as Rank
const third = '0|000003' as Rank

function floor (id: Ref<Floor>, rank?: Rank): Floor {
  return { _id: id, _class: 'love:class:Floor', space: 'space:1', name: String(id), rank } as unknown as Floor
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

describe('rankAfterMove', () => {
  it('places the moved row between its new neighbours', () => {
    const floors = [floor(a, first), floor(b, second), floor(c, third)]

    const rank = rankAfterMove(floors, [a, b, c], b) as Rank

    expect(rank > first && rank < third).toBe(true)
  })

  it('puts a row dropped first before every other one', () => {
    const floors = [floor(a, first), floor(b, second), floor(c, third)]

    const rank = rankAfterMove(floors, [b, a, c], b) as Rank

    expect(rank < first).toBe(true)
  })

  it('puts a row dropped last after every other one', () => {
    const floors = [floor(a, first), floor(b, second), floor(c, third)]

    const rank = rankAfterMove(floors, [a, c, b], b) as Rank

    expect(rank > third).toBe(true)
  })

  it('ignores a row the list does not contain', () => {
    expect(rankAfterMove([floor(a, first)], [a], 'floor:unknown' as Ref<Floor>)).toBeUndefined()
  })
})

describe('persistMovedRank', () => {
  it('writes the moved floor only, its neighbours keep their ranks', async () => {
    const { client, calls } = createFakeClient()
    const floors = [floor(a, first), floor(b, second), floor(c, third)]

    await persistMovedRank(client, floors, [c, a, b], c)

    expect(calls).toHaveLength(1)
    expect(calls[0].args[0]._id).toBe(c)
    expect((calls[0].args[1].rank as Rank) < first).toBe(true)
  })

  it('writes nothing for a floor that is not in the list', async () => {
    const { client, calls } = createFakeClient()

    await persistMovedRank(client, [floor(a, first)], [a], 'floor:unknown' as Ref<Floor>)

    expect(calls).toHaveLength(0)
  })
})
