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

// Contacts table sorts the "Contact info" column by '$lookup.channels.lastMessage',
// a key inside a reverse lookup; Postgres used to fail it with 42703.

import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type RestClient
} from '@hcengineering/api-client'
import { generateId, SortingOrder, type Ref, type TxOperations } from '@hcengineering/core'
import contact, { AvatarType, type Person } from '@hcengineering/contact'

const PLATFORM_URL = process.env.PLATFORM_URL ?? 'http://localhost:8183'
const WORKSPACE = 'api-tests'

describe('contact channels sort (api-tests)', () => {
  let rest: RestClient
  let ops: TxOperations
  const persons: Array<Ref<Person>> = []

  // lastMessage per person; the sort key is the newest (desc) / oldest (asc) of its channels
  const setup: Array<{ name: string, lastMessages: number[] }> = [
    { name: 'b-middle', lastMessages: [2000, 500] },
    { name: 'a-newest', lastMessages: [3000] },
    { name: 'c-oldest', lastMessages: [1000, 100] }
  ]

  beforeAll(async () => {
    const config = await loadServerConfig(PLATFORM_URL)
    const token = await getWorkspaceToken(
      PLATFORM_URL,
      { email: 'user1', password: '1234', workspace: WORKSPACE },
      config
    )
    rest = createRestClient(token.endpoint, token.workspaceId, token.token)
    ops = await createRestTxOperations(token.endpoint, token.workspaceId, token.token)

    const suffix = generateId()
    for (const it of setup) {
      const person = await ops.createDoc(contact.class.Person, contact.space.Contacts, {
        name: `${it.name}-${suffix}`,
        avatarType: AvatarType.COLOR
      })
      persons.push(person)
      for (const lastMessage of it.lastMessages) {
        await ops.addCollection(
          contact.class.Channel,
          contact.space.Contacts,
          person,
          contact.class.Person,
          'channels',
          {
            provider: contact.channelProvider.Email,
            value: `${it.name}-${lastMessage}-${suffix}@example.com`,
            lastMessage
          }
        )
      }
    }
  })

  afterAll(async () => {
    for (const p of persons) {
      try {
        await ops.remove((await ops.findOne(contact.class.Person, { _id: p })) as Person)
      } catch {}
    }
  })

  async function sortedNames (order: SortingOrder): Promise<string[]> {
    const res = await rest.findAll(
      contact.class.Person,
      { _id: { $in: persons } },
      {
        lookup: { _id: { channels: contact.class.Channel } },
        sort: { '$lookup.channels.lastMessage': order } as any
      }
    )
    return res.map((it) => it.name.split('-').slice(0, 2).join('-'))
  }

  it('sorts descending by newest channel lastMessage', async () => {
    expect(await sortedNames(SortingOrder.Descending)).toEqual(['a-newest', 'b-middle', 'c-oldest'])
  })

  it('sorts ascending by oldest channel lastMessage', async () => {
    expect(await sortedNames(SortingOrder.Ascending)).toEqual(['c-oldest', 'b-middle', 'a-newest'])
  })
})
