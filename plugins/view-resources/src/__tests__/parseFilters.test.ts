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

import { parseFilters } from '../filter'

// The parser is pure; the UI packages the module imports need a browser
jest.mock('@hcengineering/presentation', () => ({}))
jest.mock('@hcengineering/ui', () => ({}))

const filter = (index: number | undefined, extra: Record<string, any> = {}): Record<string, any> => ({
  key: {
    _class: 'tracker:class:Issue',
    key: 'priority',
    label: 'tracker:string:Priority',
    component: 'view:component:ValueFilter',
    attribute: { type: { _class: 'tracker:class:TypeIssuePriority' } }
  },
  mode: 'view:filter:FilterValueIn',
  modes: [],
  value: [[1, [1]]],
  index,
  ...extra
})

describe('parseFilters', () => {
  it('reads stored conditions', () => {
    expect(parseFilters(JSON.stringify([filter(5)]))).toEqual([filter(5)])
  })

  it('returns nothing for an empty or broken value', () => {
    expect(parseFilters('')).toEqual([])
    expect(parseFilters('{oops')).toEqual([])
    expect(parseFilters('{"a":1}')).toEqual([])
  })

  it('drops conditions of a wrong shape and keeps the rest', () => {
    const value = JSON.stringify([
      null,
      1,
      { key: 'priority' },
      filter(1, { value: 'urgent' }),
      filter(2, { key: { _class: 'tracker:class:Issue' } }),
      filter(3, { nested: { key: 1 } }),
      filter(4)
    ])
    expect(parseFilters(value).map((f) => f.index)).toEqual([4])
  })

  it('gives a missing or repeated index a new one', () => {
    const parsed = parseFilters(JSON.stringify([filter(7), filter(7), filter(undefined)]))
    expect(parsed).toHaveLength(3)
    expect(parsed[0].index).toBe(7)
    expect(new Set(parsed.map((f) => f.index)).size).toBe(3)
    expect(parsed.every((f) => typeof f.index === 'number')).toBe(true)
  })
})
