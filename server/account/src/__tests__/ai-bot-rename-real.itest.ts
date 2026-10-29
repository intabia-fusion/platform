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

/** Migration v57 (FUSIO-1379) on a real database, once per flavor in realDbFlavors. */

import { generateUuid, SocialIdType, type AccountUuid, type PersonUuid } from '@hcengineering/core'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { getMigrations } from '../collections/postgres/migrations'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { createAccount } from '../utils'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

// Frozen on purpose: what v57 ran against and its target. The constant may move on, this test may not.
const legacyEmail = 'huly.ai.bot@hc.engineering'
const renamedEmail = 'ai.bot@platform'
const anotherEmail = 'someone@example.com'

jest.setTimeout(90000)

describe.each(realDbFlavors)('real-ai-bot-rename [$flavor]', ({ flavor, adminUri, dbUri }) => {
  const botUuid = generateUuid() as AccountUuid
  const userUuid = generateUuid() as AccountUuid
  const squatterUuid = generateUuid() as AccountUuid
  let dbUuid: string
  let dbClient: PostgresClientReference
  let accountDb: PostgresAccountDB

  const runMigration = async (): Promise<void> => {
    const sql = getMigrations(dbUuid, flavor).find(([id]) => id === 'account_db_v57_ai_bot_email_rename')?.[1]
    expect(sql).toBeDefined()
    const client = await dbClient.getClient()
    await client.unsafe(sql as string)
  }

  const seed = async (uuid: AccountUuid, email: string): Promise<void> => {
    await accountDb.person.insertOne({ uuid, firstName: 'P', lastName: 'P' })
    await createAccount(accountDb, uuid, true)
    await accountDb.socialId.insertOne({
      type: SocialIdType.EMAIL,
      value: email,
      personUuid: uuid as unknown as PersonUuid,
      verifiedOn: Date.now()
    })
  }

  const emailOf = async (email: string): Promise<{ _id: string, personUuid: string } | null> =>
    (await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: email })) as any

  beforeAll(async () => {
    const db = await openRealDb('aibotrename', { flavor, adminUri, dbUri })
    dbUuid = db.dbUuid
    dbClient = db.dbRef
    accountDb = db.account
  })

  beforeEach(async () => {
    await clearTables(dbClient, dbUuid, [
      'otp',
      'integration_secrets',
      'social_id',
      'account_events',
      'account_passwords',
      'account',
      'person'
    ])
    await seed(botUuid, legacyEmail)
    await seed(userUuid, anotherEmail)
  })

  afterAll(async () => {
    dbClient.close()
    await shutdownPostgres()
  })

  it('renames the bot email in place: same row, same person, new key', async () => {
    const before = await emailOf(legacyEmail)
    expect(before).not.toBeNull()

    await runMigration()

    const after = await emailOf(renamedEmail)
    expect(after).not.toBeNull()
    expect(after?._id).toBe(before?._id)
    expect(after?.personUuid).toBe(before?.personUuid)
    expect(await emailOf(legacyEmail)).toBeNull()

    // The natural key is a generated column: it has to follow the value on its own.
    const client = await dbClient.getClient()
    const [row] = await client.unsafe(`SELECT key FROM ${dbUuid}.social_id WHERE _id = $1`, [before?._id] as any)
    expect((row as any).key).toBe(`email:${renamedEmail}`)
  })

  it('leaves another account on its own email', async () => {
    await runMigration()

    expect(await emailOf(anotherEmail)).not.toBeNull()
  })

  it('is harmless when run twice', async () => {
    await runMigration()
    await runMigration()

    expect(await emailOf(renamedEmail)).not.toBeNull()
    expect(await emailOf(legacyEmail)).toBeNull()
  })

  it('keeps the bot on the old address when a real account already owns the new one', async () => {
    await seed(squatterUuid, renamedEmail)

    await runMigration()

    expect(await emailOf(legacyEmail)).not.toBeNull()
    expect(await emailOf(renamedEmail)).not.toBeNull()
  })
})
