/**
 * A set of tests against a real PostgreSQL database, for both CorockachDB and pure.
 */

import { generateUuid, SocialIdType, type AccountUuid, type PersonId } from '@hcengineering/core'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { type SocialId } from '../types'
import { createAccount, normalizeValue } from '../utils'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

jest.setTimeout(90000)

// Children first — every one of these has an FK to workspace.
// Children before parents; social_id/account_events/user_profile all reference person.
const PERSON_TABLES = ['social_id', 'account_events', 'user_profile', 'account_passwords', 'account', 'person']

const WORKSPACE_TABLES = [
  'invite',
  'workspace_members',
  'workspace_status',
  'workspace_permissions',
  'integrations',
  'subscription',
  'workspace'
]

describe('real-account', () => {
  // It should create a DB and test on it for every execution, and drop it after it.
  //
  // Use environment variable or default to localhost CockroachDB

  // Administrative client for creating/dropping test databases
  // This connects to 'defaultdb' and is used ONLY for DB admin operations

  let dbUuid: string
  let pgDbUuid: string

  let crClient: PostgresClientReference
  let pgClient: PostgresClientReference

  let crAccount: PostgresAccountDB
  let pgAccount: PostgresAccountDB

  const users = [
    {
      name: 'user1',
      uuid: generateUuid() as AccountUuid,
      email: 'user1@example.com',
      firstName: 'Jon',
      lastName: 'Doe'
    },
    {
      name: 'user2',
      uuid: generateUuid() as AccountUuid,
      email: 'user2@example.com',
      firstName: 'Pavel',
      lastName: 'Siaro'
    }
  ]

  async function addSocialId (
    account: PostgresAccountDB,
    user: (typeof users)[0],
    type: SocialIdType,
    value: string
  ): Promise<PersonId> {
    const normalizedValue = normalizeValue(value)
    const newSocialId = {
      type,
      value: normalizedValue,
      personUuid: user.uuid
    }
    return await account.socialId.insertOne(newSocialId)
  }

  async function prepareAccounts (account: PostgresAccountDB): Promise<void> {
    for (const user of users) {
      const ex = await account.account.findOne({ uuid: user.uuid })
      if (ex == null) {
        await account.person.insertOne({ uuid: user.uuid, firstName: user.firstName, lastName: user.lastName })
        await createAccount(account, user.uuid, true)
        await addSocialId(account, user, SocialIdType.EMAIL, user.email)
      }
    }
  }

  // One reused database per flavor: migrations run once (and are skipped on later runs), and nothing
  // is ever dropped — a DROP DATABASE on cockroach queues a 300s GC job per call.
  beforeAll(async () => {
    const [cr, pg] = await Promise.all([
      openRealDb('accountdb', realDbFlavors[0]),
      openRealDb('accountdb', realDbFlavors[1])
    ])
    dbUuid = cr.dbUuid
    pgDbUuid = pg.dbUuid
    crClient = cr.dbRef
    pgClient = pg.dbRef
    crAccount = cr.account
    pgAccount = pg.account

    // The database outlives the run, so clear the previous run's fixtures before seeding.
    await Promise.all([
      clearTables(crClient, dbUuid, [...WORKSPACE_TABLES, ...PERSON_TABLES]),
      clearTables(pgClient, pgDbUuid, [...WORKSPACE_TABLES, ...PERSON_TABLES])
    ])

    await Promise.all([prepareAccounts(pgAccount), prepareAccounts(crAccount)])
  })

  // Workspaces carry a unique url, so they must not survive into the next test. Persons and accounts
  // stay: prepareAccounts already re-creates them only when missing.
  beforeEach(async () => {
    await Promise.all([
      clearTables(crClient, dbUuid, WORKSPACE_TABLES),
      clearTables(pgClient, pgDbUuid, WORKSPACE_TABLES)
    ])
  })

  afterAll(async () => {
    pgClient.close()
    crClient.close()
    await shutdownPostgres()
  })

  it('Check accounts', async () => {
    const user1 = await crAccount.account.findOne({ uuid: users[0].uuid })
    expect(user1).not.toBeNull()
    expect(user1).toBeDefined()

    const user1PG = await pgAccount.account.findOne({ uuid: users[0].uuid })
    expect(user1).not.toBeNull()
    expect(user1PG).toBeDefined()
  })

  it('Check social ids', async () => {
    const user1 = await crAccount.account.findOne({ uuid: users[0].uuid })
    expect(user1).not.toBeNull()
    expect(user1).toBeDefined()

    const socialIds = await crAccount.socialId.find({ personUuid: user1?.uuid })
    expect(socialIds).not.toBeNull()
    expect(socialIds).toBeDefined()
    expect(socialIds.length).toEqual(2)

    const user1PG = await pgAccount.account.findOne({ uuid: users[0].uuid })
    expect(user1).not.toBeNull()
    expect(user1PG).toBeDefined()

    const socialIdsPG = await pgAccount.socialId.find({ personUuid: user1PG?.uuid })
    expect(socialIdsPG).not.toBeNull()
    expect(socialIdsPG).toBeDefined()
    expect(socialIdsPG.length).toEqual(2)

    const em = socialIdsPG.find((it) => it.type === SocialIdType.EMAIL) as SocialId
    expect(em).toBeDefined()
    expect(em.key).toEqual('email:user1@example.com')
  })
  it('List accounts', async () => {
    const users = await crAccount.listAccounts()
    expect(users.length).toBe(2)

    const usersPG = await pgAccount.listAccounts()
    expect(usersPG.length).toBe(2)
  })

  it('check invites', async () => {
    const wsUuid = await crAccount.createWorkspace(
      {
        url: 'test-ws',
        name: 'test-ws',
        allowGuestSignUp: true,
        allowReadOnlyGuest: true
      },
      {
        isDisabled: false,
        mode: 'active',
        versionMajor: 0,
        versionMinor: 7,
        versionPatch: 0
      }
    )
    const inviteLink = await crAccount.invite.insertOne({
      workspaceUuid: wsUuid,
      expiresOn: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).getTime()
    })
    expect(inviteLink).toBeDefined()

    const wsUuidPG = await pgAccount.createWorkspace(
      {
        url: 'test-ws',
        name: 'test-ws',
        allowGuestSignUp: true,
        allowReadOnlyGuest: true
      },
      {
        isDisabled: false,
        mode: 'active',
        versionMajor: 0,
        versionMinor: 7,
        versionPatch: 0
      }
    )
    const inviteLinkPG = await pgAccount.invite.insertOne({
      workspaceUuid: wsUuidPG,
      expiresOn: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).getTime()
    })
    expect(inviteLinkPG).toBeDefined()
  })
})
