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

import { SortingOrder, type Ref } from '@hcengineering/core'
import { issueViewSort, type Issue } from '..'

const id = (s: string): Ref<Issue> => s as Ref<Issue>

describe('personal issue view ordering', () => {
  const views = [
    { attachedTo: id('a'), modifiedOn: 100 },
    { attachedTo: id('b'), modifiedOn: 300 },
    { attachedTo: id('c'), modifiedOn: 200 }
  ]

  it.each([
    [SortingOrder.Descending, ['b', 'c', 'a']],
    [SortingOrder.Ascending, ['a', 'c', 'b']]
  ])('orders viewed ids and puts unseen issues last (%s)', (direction, expected) => {
    const sort = issueViewSort(views, direction)
    expect(sort._id).toEqual({
      order: SortingOrder.Ascending,
      default: 3,
      cases: expected.map((query, index) => ({ query, index }))
    })
  })

  it('uses the latest duplicate, stable ties and ignores invalid dates', () => {
    const sort = issueViewSort([
      ...views,
      { attachedTo: id('a'), modifiedOn: 300 },
      { attachedTo: id('bad'), modifiedOn: NaN }
    ], SortingOrder.Descending)
    expect(sort._id).toEqual({
      order: SortingOrder.Ascending,
      default: 3,
      cases: ['a', 'b', 'c'].map((query, index) => ({ query, index }))
    })
  })

  it('supports an account without views', () => {
    expect(issueViewSort([], SortingOrder.Descending)._id).toEqual({
      order: SortingOrder.Ascending, default: 0, cases: []
    })
  })
})
