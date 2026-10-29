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

import contact, { type Person, type SocialIdentity } from '@hcengineering/contact'
import { buildSocialIdString, type Domain, type Ref, SocialIdType } from '@hcengineering/core'
import { type MigrationClient } from '@hcengineering/model'
import { renameAiBotEmail } from '../migration'

const legacyKey = buildSocialIdString({ type: SocialIdType.EMAIL, value: 'huly.ai.bot@hc.engineering' })
const currentKey = buildSocialIdString({ type: SocialIdType.EMAIL, value: 'ai.bot@platform' })

function emailIdentity (id: string, key: string, value: string, attachedTo: string): SocialIdentity {
  return {
    _id: id,
    _class: contact.class.SocialIdentity,
    space: 'contacts',
    attachedTo,
    attachedToClass: contact.class.Person,
    collection: 'socialIds',
    type: SocialIdType.EMAIL,
    value,
    key
  } as unknown as SocialIdentity
}

// Just enough of a MigrationClient: documents in the channel domain, equality on every query key.
function createClient (docs: SocialIdentity[]): {
  client: MigrationClient
  rows: () => SocialIdentity[]
} {
  const matches = (doc: Record<string, any>, query: Record<string, any>): boolean =>
    Object.entries(query).every(([key, value]) => doc[key] === value)

  const client = {
    migrateState: new Map<string, Set<string>>(),
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    find: jest.fn(async (_domain: Domain, query: Record<string, any>) =>
      docs.filter((it) => matches(it as any, query))
    ),
    update: jest.fn(async (_domain: Domain, query: Record<string, any>, update: Record<string, any>) => {
      for (const doc of docs.filter((it) => matches(it as any, query))) Object.assign(doc, update)
    }),
    deleteMany: jest.fn(async (_domain: Domain, query: Record<string, any>) => {
      for (const doc of docs.filter((it) => matches(it as any, query))) docs.splice(docs.indexOf(doc), 1)
    })
  } as unknown as MigrationClient

  return { client, rows: () => docs }
}

describe('contact migration - rename the ai-bot email', () => {
  const bot = 'ai-bot-person' as Ref<Person>
  const human = 'human-person' as Ref<Person>

  it('moves the bot identity to the current address, keeping its id and owner', async () => {
    const identity = emailIdentity('bot-social-id', legacyKey, 'huly.ai.bot@hc.engineering', bot)
    const other = emailIdentity('human-social-id', currentKey.replace('ai.bot', 'user'), 'user@platform', human)
    const { client, rows } = createClient([identity, other])

    await renameAiBotEmail(client)

    expect(rows()).toEqual([
      expect.objectContaining({
        _id: 'bot-social-id',
        key: currentKey,
        value: 'ai.bot@platform',
        attachedTo: bot
      }),
      expect.objectContaining({ _id: 'human-social-id', key: other.key, value: 'user@platform' })
    ])
  })

  it('drops the old identity when the workspace already provisioned the current one', async () => {
    const stale = emailIdentity('bot-social-id', legacyKey, 'huly.ai.bot@hc.engineering', bot)
    const fresh = emailIdentity('bot-new-id', currentKey, 'ai.bot@platform', bot)
    const { client, rows } = createClient([stale, fresh])

    await renameAiBotEmail(client)

    expect(rows()).toEqual([expect.objectContaining({ _id: 'bot-new-id', key: currentKey, attachedTo: bot })])
  })

  it('does nothing in a workspace the bot never joined', async () => {
    const other = emailIdentity('human-social-id', legacyKey.replace('huly.ai.bot', 'someone'), 'someone@x.io', human)
    const { client } = createClient([other])

    await renameAiBotEmail(client)

    expect(client.update).not.toHaveBeenCalled()
    expect(client.deleteMany).not.toHaveBeenCalled()
  })
})
