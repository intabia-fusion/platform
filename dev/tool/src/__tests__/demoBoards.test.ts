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

import { type AccountUuid, type Ref } from '@hcengineering/core'
import { convertBoard, type BoardContext, type DemoBoard } from '../demoBoards'

let seq = 0
const ctx: BoardContext = {
  project: (id) => `p-${id}` as Ref<any>,
  statuses: (name) => (name === 'Nope' ? [] : [`s-${name}` as Ref<any>]),
  category: (name) => `c-${name}` as Ref<any>,
  person: (name) => `person-${name}` as Ref<any>,
  account: (name) => `acc-${name}` as AccountUuid,
  component: (label) => `comp-${label}` as Ref<any>,
  color: (name) => ({ Orange: 7, Firework: 0 })[name],
  filterKey: (field) =>
    ['status', 'assignee', 'component'].includes(field)
      ? { key: { key: field }, kind: 'object' }
      : field === 'priority'
        ? { key: { key: field }, kind: 'value' }
        : undefined,
  me: 'me-person' as Ref<any>,
  newId: () => `id${++seq}`
}

const board: DemoBoard = {
  title: 'Main',
  key: 'main',
  visibility: 'all',
  projects: ['APP'],
  author: 'Anna',
  editors: ['Maria'],
  filter: [
    { field: 'priority', op: 'in', value: ['Urgent', 'Low'] },
    { field: 'status', op: 'not', value: ['Archived'] }
  ],
  columns: [{ title: 'Review', category: 'active', limit: 3, statuses: ['Peer Review', 'Merge'] }],
  swimlanes: [
    { title: 'Rest', rest: true },
    { title: 'Urgent', filter: [{ field: 'priority', op: 'eq', value: ['Urgent'] }] },
    { title: 'Stale', filter: [{ field: 'inStatus', op: 'gt', value: ['3 d'] }] }
  ],
  quickFilters: [
    { title: 'Mine', filter: [{ field: 'assignee', op: 'eq', value: ['me'] }] },
    { title: 'iOS', filter: [{ field: 'component', op: 'eq', value: ['iOS'] }] },
    { title: 'Blockers', filter: [{ field: 'relation', op: 'eq', value: ['blocks'] }] }
  ],
  colorRules: [
    { color: 'Orange', filter: [{ field: 'status', op: 'eq', value: ['Ready'] }] },
    {
      color: 'Orange',
      filter: [
        { field: 'status', op: 'eq', value: ['Ready'] },
        { field: 'inStatus', op: 'gt', value: ['5 d'] }
      ]
    }
  ]
}

describe('convertBoard', () => {
  const { board: out, skipped } = convertBoard(board, ctx)
  const parse = (s: string): any[] => JSON.parse(s)

  it('maps names to refs and keeps column fields', () => {
    expect(out.projects).toEqual(['p-APP'])
    expect(out.author).toBe('acc-Anna')
    expect(out.editors).toEqual(['acc-Maria'])
    expect(out.columns[0]).toMatchObject({
      category: 'c-active',
      limit: 3,
      statuses: ['s-Peer Review', 's-Merge']
    })
  })

  it('writes priority as value pairs and "not" as the exclusion mode', () => {
    const [priority, status] = parse(out.filter)
    expect(priority.value).toEqual([
      [1, [1]],
      [4, [4]]
    ])
    expect(priority.mode).toBe('view:filter:FilterValueIn')
    expect(status.value).toEqual(['s-Archived'])
    expect(status.mode).toBe('view:filter:FilterObjectNin')
  })

  it('resolves "me" and components', () => {
    expect(parse(out.quickFilters[0].condition)[0].value).toEqual(['me-person'])
    expect(parse(out.quickFilters[1].condition)[0].value).toEqual(['comp-iOS'])
  })

  it('puts the rest lane last with no condition', () => {
    expect(out.swimlanes.map((l) => l.title)).toEqual(['Urgent', 'Rest'])
    expect(out.swimlanes[1].condition).toBe('')
  })

  it('maps a color name to the palette index', () => {
    expect(out.colorRules).toHaveLength(1)
    expect(out.colorRules[0].color).toBe(7)
  })

  it('drops items with conditions the product cannot express', () => {
    expect(skipped).toEqual([
      'Main / swimlane "Stale": inStatus gt',
      'Main / quick filter "Blockers": relation eq',
      'Main / color rule "Orange": inStatus gt'
    ])
  })
})
