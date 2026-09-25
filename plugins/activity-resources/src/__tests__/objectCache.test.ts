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

import core, { type Class, type Doc, type Ref, type Tx } from '@hcengineering/core'

const findAll = jest.fn()
let txListener: ((txes: Tx[]) => void) | undefined

jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({ findAll }),
  addTxListener: (listener: (txes: Tx[]) => void) => {
    txListener = listener
  }
}))

// Imported after the mock: the module registers its tx listener at import time.
// eslint-disable-next-line import/first
import { getObjectById } from '../objectCache'

const clazz = 'test:class:Doc' as Ref<Class<Doc>>
const id = (n: number): Ref<Doc> => `doc-${n}` as Ref<Doc>

describe('objectCache', () => {
  beforeEach(() => {
    findAll.mockReset()
    findAll.mockImplementation(async (_class: Ref<Class<Doc>>, query: { _id: { $in: Array<Ref<Doc>> } }) =>
      query._id.$in.map((_id) => ({ _id, _class }))
    )
  })

  async function fill (from: number, to: number): Promise<void> {
    for (let n = from; n <= to; n++) {
      await getObjectById(clazz, id(n))
    }
  }

  it('serves a hit from the cache without a query', async () => {
    await fill(1, 3)
    findAll.mockClear()
    expect(await getObjectById(clazz, id(2))).toEqual({ _id: id(2), _class: clazz })
    expect(findAll).not.toHaveBeenCalled()
  })

  it('evicts the least recently used entry at the limit, not the whole cache', async () => {
    await fill(1, 50)
    // Touch the oldest entry: it becomes the most recent one.
    await getObjectById(clazz, id(1))
    findAll.mockClear()

    // One more object pushes out the least recently used one, which is now doc-2.
    await getObjectById(clazz, id(51))
    findAll.mockClear()

    await getObjectById(clazz, id(1))
    await getObjectById(clazz, id(50))
    expect(findAll).not.toHaveBeenCalled()

    await getObjectById(clazz, id(2))
    expect(findAll).toHaveBeenCalledTimes(1)
  })

  it('drops an entry a tx touches', async () => {
    await fill(1, 3)
    txListener?.([{ _class: core.class.TxUpdateDoc, objectId: id(3) } as any])
    findAll.mockClear()
    await getObjectById(clazz, id(3))
    expect(findAll).toHaveBeenCalledTimes(1)
  })
})
