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

import contact, { type Person } from '@hcengineering/contact'
import { type PersonId, type Ref, type TxOperations } from '@hcengineering/core'
import { personIdSort } from '../personIdSort'

const pid = (id: string): PersonId => id as PersonId

// What the contact cache loads: SocialIdentity by PersonId, Person in $lookup.
function makeClient (names: Record<string, string>): { client: TxOperations, findAll: jest.Mock } {
  const findAll = jest.fn(async (_class: unknown, query: { _id: { $in: string[] } }) =>
    query._id.$in
      .filter((id) => names[id] !== undefined)
      .map((id) => {
        const person = { _id: `person-${id}` as Ref<Person>, _class: contact.class.Person, name: names[id] }
        return { _id: id, attachedTo: person._id, $lookup: { attachedTo: person } }
      })
  )
  const client = {
    getHierarchy: () => ({ isDerived: () => true }),
    findAll
  } as unknown as TxOperations
  return { client, findAll }
}

describe('personIdSort', () => {
  it('sorts by display name, not by raw PersonId or stored "Last,First" name', async () => {
    const { client } = makeClient({ 'a-1': 'Smith,Zoe', 'z-9': 'Young,Anna' })
    const res = await personIdSort(client, [pid('a-1'), pid('z-9')])
    expect(res).toEqual([pid('z-9'), pid('a-1')])
  })

  it('keeps empty values last and does not lose unresolved ids', async () => {
    const { client } = makeClient({ p1: 'Brown,Bob' })
    const res = await personIdSort(client, [undefined, pid('p1'), null, pid('gone')])
    expect(res.slice(0, 2)).toEqual([pid('gone'), pid('p1')])
    expect(res.slice(2)).toEqual([null, undefined])
  })

  it('does not query persons when there are only empty values', async () => {
    const { client, findAll } = makeClient({})
    const res = await personIdSort(client, [null, undefined])
    expect(res).toEqual([null, undefined])
    expect(findAll).not.toHaveBeenCalled()
  })
})
