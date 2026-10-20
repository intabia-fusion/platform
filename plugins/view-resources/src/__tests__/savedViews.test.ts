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

import type { Ref } from '@hcengineering/core'
import type { FilteredView } from '@hcengineering/view'
import { applySavedViewOrder } from '../savedViews'

jest.mock('@hcengineering/presentation', () => ({
  getClient: jest.fn()
}))

const ref = (id: string): Ref<FilteredView> => id as Ref<FilteredView>

const makeView = (id: string, createdOn: number): FilteredView => {
  return { _id: ref(id), createdOn } as unknown as FilteredView
}

const ids = (views: FilteredView[]): string[] => views.map((it) => it._id)

describe('applySavedViewOrder', () => {
  it('sorts by creation time when there is no saved order', () => {
    const first = makeView('first', 1)
    const second = makeView('second', 2)
    const third = makeView('third', 3)

    expect(ids(applySavedViewOrder([third, first, second], []))).toEqual(['first', 'second', 'third'])
  })

  it('applies the saved order', () => {
    const first = makeView('first', 1)
    const second = makeView('second', 2)
    const third = makeView('third', 3)
    const order = [ref('third'), ref('first'), ref('second')]

    expect(ids(applySavedViewOrder([first, second, third], order))).toEqual(['third', 'first', 'second'])
  })

  it('appends views missing from the saved order', () => {
    const first = makeView('first', 1)
    const second = makeView('second', 2)
    const third = makeView('third', 3)

    expect(ids(applySavedViewOrder([first, second, third], [ref('third')]))).toEqual(['third', 'first', 'second'])
  })

  it('ignores saved ids that are not in the list', () => {
    const first = makeView('first', 1)
    const second = makeView('second', 2)

    expect(ids(applySavedViewOrder([first, second], [ref('missing'), ref('second')]))).toEqual(['second', 'first'])
  })

  it('breaks creation time ties by id', () => {
    const b = makeView('b', 1)
    const a = makeView('a', 1)

    expect(ids(applySavedViewOrder([b, a], []))).toEqual(['a', 'b'])
  })

  it('does not mutate the source list', () => {
    const first = makeView('first', 1)
    const second = makeView('second', 2)
    const views = [second, first]

    applySavedViewOrder(views, [ref('first')])

    expect(views).toEqual([second, first])
  })
})
