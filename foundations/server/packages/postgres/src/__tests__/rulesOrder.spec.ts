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

import { SortingOrder } from '@hcengineering/core'
import { PostgresAdapter } from '../storage'

describe('ORDER BY sorting rules', () => {
  const adapter: any = Object.create(PostgresAdapter.prototype)
  adapter.hierarchy = { findAttribute: () => undefined, isMixin: () => false }
  adapter.dbFlavor = 'postgres'

  const vars = (values: any[]): any => ({
    add: (value: any, type: string = '') => {
      values.push(value)
      return `$${values.length}${type}`
    }
  })

  const cases = [
    { query: 'urgent', index: 0 },
    { query: 'low', index: 1 }
  ]

  it.each([['createdOn', 'tracker_doc."createdOn"']])('puts missing %s last in either direction', (key, sqlKey) => {
    for (const [order, direction] of [
      [SortingOrder.Ascending, 'ASC'],
      [SortingOrder.Descending, 'DESC']
    ] as const) {
      const sql = adapter.buildOrder(vars([]), 'tracker:class:Issue', 'tracker_doc', { [key]: order }, [])
      expect(sql).toBe(`ORDER BY ${sqlKey} ${direction} NULLS LAST`)
    }
  })

  it.each([
    [SortingOrder.Ascending, 'ASC'],
    [SortingOrder.Descending, 'DESC']
  ])('keeps a text value of a jsonb field in text order (%s)', (order, direction) => {
    const sql = adapter.buildOrder(vars([]), 'tracker:class:Issue', 'tracker_doc', { status: order }, [])
    expect(sql).toBe(
      "ORDER BY (CASE WHEN pg_input_is_valid(tracker_doc.data#>>'{status}', 'numeric') " +
        "THEN (tracker_doc.data#>>'{status}')::numeric END) " +
        `${direction} NULLS LAST, tracker_doc.data#>>'{status}' ${direction} NULLS LAST`
    )
  })

  // A jsonb value has no column type: read as text, `7` sorted after `16` and `2` after both.
  it('reads a numeric value of a jsonb field as a number', () => {
    const sql = adapter.buildOrder(
      vars([]),
      'tracker:class:Issue',
      'tracker_doc',
      { reportedTime: SortingOrder.Descending },
      []
    )
    expect(sql).toBe(
      "ORDER BY (CASE WHEN pg_input_is_valid(tracker_doc.data#>>'{reportedTime}', 'numeric') " +
        "THEN (tracker_doc.data#>>'{reportedTime}')::numeric END) DESC NULLS LAST, " +
        "tracker_doc.data#>>'{reportedTime}' DESC NULLS LAST"
    )
  })

  it('puts a value the rules do not name last in either direction', () => {
    const ascValues: any[] = []
    const asc: string = adapter.buildOrder(
      vars(ascValues),
      'tracker:class:Issue',
      'tracker_doc',
      { status: { order: SortingOrder.Ascending, cases } },
      []
    )
    expect(asc).toBe(
      "ORDER BY CASE WHEN tracker_doc.data#>>'{status}' = $1::text THEN 0 " +
        "WHEN tracker_doc.data#>>'{status}' = $2::text THEN 1 END ASC NULLS LAST"
    )
    expect(ascValues).toEqual(['urgent', 'low'])

    const descValues: any[] = []
    const desc: string = adapter.buildOrder(
      vars(descValues),
      'tracker:class:Issue',
      'tracker_doc',
      { status: { order: SortingOrder.Descending, cases } },
      []
    )
    expect(desc).toBe(
      "ORDER BY CASE WHEN tracker_doc.data#>>'{status}' = $1::text THEN 0 " +
        "WHEN tracker_doc.data#>>'{status}' = $2::text THEN 1 END DESC NULLS LAST"
    )
    expect(descValues).toEqual(['urgent', 'low'])
  })
})
