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

import contact, { getName } from '@hcengineering/contact'
import type { Doc, Ref } from '@hcengineering/core'
import type { SearchItem } from '@hcengineering/presentation'
import { findMentionEmployees, mergeMentionSections } from '../mentionSections'

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

const hierarchy = { isDerived: () => true } as any

function employeeDoc (id: string, name: string): any {
  return {
    _id: id as Ref<Doc>,
    _class: 'contact:class:Person',
    name,
    [contact.mixin.Employee]: { role: 'USER', active: true }
  }
}

function item (category: any, id: string): SearchItem {
  return {
    num: 0,
    category,
    item: { id, doc: { _id: id as Ref<Doc>, _class: 'contact:class:Person' } } as any
  }
}

function clientAnswering (docs: any[]): { client: any, findAll: jest.Mock } {
  const findAll = jest.fn(async () => docs)
  return { client: { findAll, getHierarchy: () => hierarchy }, findAll }
}

describe('findMentionEmployees', () => {
  it('asks the database for employees only, guests are filtered before the limit', async () => {
    const { client, findAll } = clientAnswering([])

    await findMentionEmployees(client, 'иван', employees)

    expect(findAll).toHaveBeenCalledWith(
      contact.mixin.Employee,
      { name: { $like: '%иван%' }, role: 'USER' },
      { limit: 5, sort: { name: 1 } }
    )
  })

  it('builds rows the same way the search does', async () => {
    const doc = employeeDoc('person-1', 'Петров,Иван')
    const { client } = clientAnswering([doc])

    const result = await findMentionEmployees(client, 'иван', employees)

    expect(result).toHaveLength(1)
    expect(result[0].num).toBe(0)
    expect(result[0].category).toBe(employees)
    expect(result[0].item.id).toBe('person-1')
    expect(result[0].item.title).toBe(getName(hierarchy, doc))
    expect(result[0].item.iconComponent).toEqual({
      component: contact.component.AvatarRef,
      props: { _id: 'person-1' }
    })
    expect(result[0].item.titleComponent).toEqual({
      component: contact.component.ContactNamePresenter,
      props: { name: 'Петров,Иван' }
    })
  })

  it('matches everything for an empty query', async () => {
    const { client, findAll } = clientAnswering([])

    await findMentionEmployees(client, '', employees)

    expect(findAll).toHaveBeenCalledWith(
      contact.mixin.Employee,
      { name: { $like: '%%' }, role: 'USER' },
      expect.anything()
    )
  })

  it('keeps the popup alive when the query fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      findAll: jest.fn(async () => {
        throw new Error('offline')
      }),
      getHierarchy: () => hierarchy
    }

    await expect(findMentionEmployees(client as any, 'иван', employees)).resolves.toEqual([])
    consoleError.mockRestore()
  })
})

describe('mergeMentionSections', () => {
  it('puts employees first, then Everyone/Here, then the other categories', () => {
    const employeesItems = [item(employees, 'a'), item(employees, 'b')]
    const special = [item(employees, 'everyone'), item(employees, 'here')]
    const others = [item(organizations, 'o')]

    const result = mergeMentionSections(employeesItems, special, others)

    expect(result.map((it) => it.item.doc._id)).toEqual(['a', 'b', 'everyone', 'here', 'o'])
  })

  it('numbers the employee section and Everyone/Here as one list, others keep their numbers', () => {
    const employeesItems = [item(employees, 'a'), item(employees, 'b')]
    const special = [item(employees, 'everyone')]
    const others = [{ ...item(organizations, 'o'), num: 0 }]

    const result = mergeMentionSections(employeesItems, special, others)

    expect(result.map((it) => it.num)).toEqual([0, 1, 2, 0])
    expect(result[3].category).toBe(organizations)
  })
})
