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

/** Migration v56 on a real database, once per flavor in realDbFlavors. */

import {
  aiBotAccountEmail,
  generateUuid,
  SocialIdType,
  type AccountUuid,
  type PersonUuid,
  type WorkspaceUuid
} from '@hcengineering/core'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { getMigrations } from '../collections/postgres/migrations'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { createAccount } from '../utils'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

jest.setTimeout(90000)

describe.each(realDbFlavors)('real-ai-bot-reset [$flavor]', ({ flavor, adminUri, dbUri }) => {
  const botUuid = generateUuid() as AccountUuid
  const userUuid = generateUuid() as AccountUuid
  const workspace = generateUuid() as WorkspaceUuid
  let dbUuid: string
  let dbClient: PostgresClientReference
  let accountDb: PostgresAccountDB

  const passwordOf = async (uuid: AccountUuid): Promise<boolean> =>
    (await accountDb.account.findOne({ uuid }))?.hash != null

  const rowCount = async (table: string): Promise<number> => {
    const client = await dbClient.getClient()
    // CockroachDB returns count(*) as a string
    return Number(((await client.unsafe(`SELECT count(*) AS n FROM ${dbUuid}.${table}`)) as any)[0].n)
  }

  const runMigration = async (): Promise<void> => {
    const sql = getMigrations(dbUuid, flavor).find(([id]) => id === 'account_db_v56_ai_bot_credentials_reset')?.[1]
    expect(sql).toBeDefined()
    const client = await dbClient.getClient()
    await client.unsafe(sql as string)
  }

  const seed = async (uuid: AccountUuid, email: string): Promise<void> => {
    await accountDb.person.insertOne({ uuid, firstName: 'P', lastName: 'P' })
    await createAccount(accountDb, uuid, true)
    const socialId = await accountDb.socialId.insertOne({
      type: SocialIdType.EMAIL,
      value: email,
      personUuid: uuid as unknown as PersonUuid,
      verifiedOn: Date.now()
    })
    await accountDb.setPassword(uuid, Buffer.from('hash'), Buffer.from('salt'))
    await accountDb.integrationSecret.insertOne({
      socialId,
      kind: 'webhook' as any,
      workspaceUuid: workspace,
      key: `key-${email}`,
      secret: '{}'
    })
    await accountDb.otp.insertOne({
      socialId,
      purpose: 'login',
      code: '123456',
      expiresOn: Date.now() + 600 * 1000,
      createdOn: Date.now()
    })
  }

  beforeAll(async () => {
    const db = await openRealDb('aibotreset', { flavor, adminUri, dbUri })
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
    await seed(botUuid, aiBotAccountEmail)
    await seed(userUuid, 'ai-bot-reset-user@example.com')
  })

  afterAll(async () => {
    dbClient.close()
    await shutdownPostgres()
  })

  it('removes the password, the api key and the code of the bot, keeps the account and the email', async () => {
    expect(await passwordOf(botUuid)).toBe(true)

    await runMigration()

    expect(await passwordOf(botUuid)).toBe(false)
    expect(await accountDb.account.findOne({ uuid: botUuid })).not.toBeNull()
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: aiBotAccountEmail })).not.toBeNull()
    expect(await accountDb.integrationSecret.find({ workspaceUuid: workspace })).toHaveLength(1)
    expect(await rowCount('otp')).toBe(1)
  })

  it('leaves another account with its password', async () => {
    await runMigration()

    expect(await passwordOf(userUuid)).toBe(true)
    expect(await rowCount('account_passwords')).toBe(1)
  })

  it('is harmless when run twice', async () => {
    await runMigration()
    await runMigration()

    expect(await passwordOf(botUuid)).toBe(false)
    expect(await passwordOf(userUuid)).toBe(true)
  })

  it('does nothing when no account owns the bot email', async () => {
    await clearTables(dbClient, dbUuid, ['otp', 'integration_secrets', 'social_id'])
    await runMigration()

    expect(await passwordOf(botUuid)).toBe(true)
    expect(await passwordOf(userUuid)).toBe(true)
  })
})
