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

// `$lookup.<path>.<field>` projection keys cut a joined document down to the listed fields,
// through a direct and a reverse lookup alike, while sorting by the join still works.

import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type RestClient
} from '@hcengineering/api-client'
import { generateId, SortingOrder, type Ref, type TxOperations } from '@hcengineering/core'
import contact, { AvatarType, type Channel, type Person } from '@hcengineering/contact'

const PLATFORM_URL = process.env.PLATFORM_URL ?? 'http://localhost:8183'
const WORKSPACE = 'api-tests'

describe('lookup projection (api-tests)', () => {
  let rest: RestClient
  let ops: TxOperations
  let person: Ref<Person>
  let name: string
  const lastMessages = [2000, 500]

  beforeAll(async () => {
    const config = await loadServerConfig(PLATFORM_URL)
    const token = await getWorkspaceToken(
      PLATFORM_URL,
      { email: 'user1', password: '1234', workspace: WORKSPACE },
      config
    )
    rest = createRestClient(token.endpoint, token.workspaceId, token.token)
    ops = await createRestTxOperations(token.endpoint, token.workspaceId, token.token)

    name = `projected-${generateId()}`
    person = await ops.createDoc(contact.class.Person, contact.space.Contacts, {
      name,
      avatarType: AvatarType.COLOR
    })
    for (const lastMessage of lastMessages) {
      await ops.addCollection(contact.class.Channel, contact.space.Contacts, person, contact.class.Person, 'channels', {
        provider: contact.channelProvider.Email,
        value: `${name}-${lastMessage}@example.com`,
        lastMessage
      })
    }
  })

  afterAll(async () => {
    try {
      await ops.remove((await ops.findOne(contact.class.Person, { _id: person })) as Person)
    } catch {}
  })

  it('keeps only the listed field of a direct lookup', async () => {
    const channels = await rest.findAll(
      contact.class.Channel,
      { attachedTo: person },
      {
        lookup: { attachedTo: contact.class.Person },
        projection: { '$lookup.attachedTo.name': 1 }
      }
    )
    expect(channels).toHaveLength(lastMessages.length)
    for (const channel of channels) {
      const owner = channel.$lookup?.attachedTo as Person
      expect(owner._id).toEqual(person)
      expect(owner.name).toEqual(name)
      expect(owner.avatarType).toBeUndefined()
      // The base document is selected whole.
      expect(channel.value).toBeDefined()
    }
  })

  it('keeps only the listed field of a reverse lookup and still sorts by it', async () => {
    const persons = await rest.findAll(
      contact.class.Person,
      { _id: person },
      {
        lookup: { _id: { channels: contact.class.Channel } },
        projection: { '$lookup.channels.lastMessage': 1 },
        sort: { '$lookup.channels.lastMessage': SortingOrder.Descending }
      }
    )
    expect(persons).toHaveLength(1)
    const channels = (persons[0].$lookup as any).channels as Channel[]
    expect(channels.map((it) => it.lastMessage).sort((a, b) => (b ?? 0) - (a ?? 0))).toEqual(lastMessages)
    expect(channels.every((it) => it.value === undefined)).toBe(true)
    expect(persons[0].name).toEqual(name)
  })
})
