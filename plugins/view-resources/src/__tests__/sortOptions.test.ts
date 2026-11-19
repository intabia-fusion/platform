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

import { SortingOrder, type Doc, type FindOptions } from '@hcengineering/core'
import { noLookupSortOptions } from '../sortOptions'

const opts = (value: Record<string, unknown>): FindOptions<Doc> => value as unknown as FindOptions<Doc>

describe('noLookupSortOptions', () => {
  // The list reads the rows with a query that joins nothing; the order the user picked must survive it.
  it('keeps a sort over a field of the document', () => {
    expect(noLookupSortOptions(opts({ sort: { reportedTime: SortingOrder.Descending } })).sort).toEqual({
      reportedTime: SortingOrder.Descending
    })
  })

  it('drops the join and the sort over a joined field', () => {
    const result = noLookupSortOptions(
      opts({
        lookup: { status: 'tracker:class:IssueStatus' },
        sort: { '$lookup.status.rank': SortingOrder.Ascending }
      })
    )
    expect(result.sort).toBeUndefined()
    expect(result.lookup).toBeUndefined()
  })

  it('keeps the document part of a mixed sort', () => {
    expect(
      noLookupSortOptions(
        opts({
          lookup: { status: 'tracker:class:IssueStatus' },
          sort: { '$lookup.status.rank': SortingOrder.Ascending, reportedTime: SortingOrder.Descending }
        })
      ).sort
    ).toEqual({ reportedTime: SortingOrder.Descending })
  })

  it('leaves other options untouched and adds no empty sort', () => {
    const result = noLookupSortOptions(opts({ limit: 10 }))
    expect(result).toEqual({ limit: 10 })
    expect('sort' in result).toBe(false)
  })
})
