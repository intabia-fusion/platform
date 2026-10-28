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

import contact from '@hcengineering/contact'
import type { Doc, Ref } from '@hcengineering/core'
import type { SearchItem } from '@hcengineering/presentation'
import { loadGuestIds, splitMentionItems } from '../mentionSections'

const employees = {
  _id: 'contact:ids:EmployeeCategory',
  title: 'contact:string:Employees',
  classToSearch: contact.mixin.Employee
} as any

const organizations = {
  _id: 'contact:ids:OrganizationCategory',
  title: 'contact:string:Organizations',
  classToSearch: 'contact:class:Organization'
} as any

const GUESTS = 'contact:string:Guests' as any

function item (category: any, id: string): SearchItem {
  return {
    num: 0,
    category,
    item: { id, doc: { _id: id as Ref<Doc>, _class: 'contact:class:Person' } } as any
  }
}

function clientAnswering (docs: any[]): { client: any, findAll: jest.Mock } {
  const findAll = jest.fn(async () => docs)
  return { client: { findAll }, findAll }
}

function employee (id: string, role: 'USER' | 'GUEST'): any {
  return { _id: id, _class: 'contact:class:Person', [contact.mixin.Employee]: { role, active: true } }
}

describe('splitMentionItems', () => {
  it('leaves the list untouched when nobody is a guest', () => {
    const items = [item(employees, 'a'), item(organizations, 'o')]

    expect(splitMentionItems(items, new Set(), GUESTS)).toBe(items)
  })

  it('puts guests after employees and before other categories', () => {
    const items = [item(employees, 'a'), item(employees, 'b'), item(organizations, 'o')]

    const result = splitMentionItems(items, new Set(['b'] as Array<Ref<Doc>>), GUESTS)

    expect(result.map((it) => it.item.doc._id)).toEqual(['a', 'b', 'o'])
    expect(result[0].category.title).toBe(employees.title)
    expect(result[1].category.title).toBe(GUESTS)
    expect(result[2].category).toBe(organizations)
  })

  it('starts every section at zero so the header is drawn once', () => {
    const items = [item(employees, 'a'), item(employees, 'b'), item(employees, 'c')]

    const result = splitMentionItems(items, new Set(['c'] as Array<Ref<Doc>>), GUESTS)

    expect(result.map((it) => it.num)).toEqual([0, 1, 0])
  })

  it('shows only the guest section when every found person is a guest', () => {
    const items = [item(employees, 'a'), item(employees, 'b')]

    const result = splitMentionItems(items, new Set(['a', 'b'] as Array<Ref<Doc>>), GUESTS)

    expect(result).toHaveLength(2)
    expect(result.every((it) => it.category.title === GUESTS)).toBe(true)
    expect(result.map((it) => it.num)).toEqual([0, 1])
  })

  it('keeps Everyone and Here in the employee section', () => {
    const items = [item(employees, contact.mention.Everyone), item(employees, 'a')]

    const result = splitMentionItems(items, new Set(['a'] as Array<Ref<Doc>>), GUESTS)

    expect(result[0].item.doc._id).toBe(contact.mention.Everyone)
    expect(result[0].category.title).toBe(employees.title)
    expect(result[1].category.title).toBe(GUESTS)
  })
})

describe('loadGuestIds', () => {
  it('asks the mixin for the found ids and keeps only guests', async () => {
    const { client, findAll } = clientAnswering([employee('a', 'GUEST'), employee('b', 'USER')])
    const cache = new Map()

    const guests = await loadGuestIds(client, ['a', 'b'] as Array<Ref<Doc>>, cache)

    expect(findAll).toHaveBeenCalledWith(
      contact.mixin.Employee,
      { _id: { $in: ['a', 'b'] } },
      { limit: 2 }
    )
    expect([...guests]).toEqual(['a'])
    expect(cache.get('a' as Ref<Doc>)).toBe(true)
    expect(cache.get('b' as Ref<Doc>)).toBe(false)
  })

  it('does not ask again for persons it already knows', async () => {
    const { client, findAll } = clientAnswering([employee('a', 'GUEST')])
    const cache = new Map()
    await loadGuestIds(client, ['a'] as Array<Ref<Doc>>, cache)

    const guests = await loadGuestIds(client, ['a'] as Array<Ref<Doc>>, cache)

    expect(findAll).toHaveBeenCalledTimes(1)
    expect([...guests]).toEqual(['a'])
  })

  it('asks again for a person the query did not return', async () => {
    const { client, findAll } = clientAnswering([])
    const cache = new Map()

    await loadGuestIds(client, ['a'] as Array<Ref<Doc>>, cache)
    await loadGuestIds(client, ['a'] as Array<Ref<Doc>>, cache)

    expect(findAll).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(0)
  })

  it('keeps the popup alive when the role query fails', async () => {
    const client = { findAll: jest.fn(async () => { throw new Error('offline') }) }

    await expect(loadGuestIds(client, ['a'] as Array<Ref<Doc>>, new Map())).resolves.toEqual(new Set())
  })
})
