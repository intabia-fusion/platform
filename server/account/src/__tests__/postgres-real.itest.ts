/**
 * A set of tests against a real database, once per flavor configured in realDbFlavors.
 */

import { AccountRole, generateUuid, SocialIdType, type AccountUuid, type PersonId } from '@hcengineering/core'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { SubscriptionStatus, SubscriptionType, type SocialId } from '../types'
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

describe.each(realDbFlavors)('real-account [$flavor]', ({ flavor, adminUri, dbUri }) => {
  let dbUuid: string
  let dbClient: PostgresClientReference
  let accountDb: PostgresAccountDB

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

  // One reused database per flavor: migrations run once (skipped later), nothing is dropped -
  // DROP DATABASE on cockroach queues a 300s GC job per call.
  beforeAll(async () => {
    const db = await openRealDb('accountdb', { flavor, adminUri, dbUri })
    dbUuid = db.dbUuid
    dbClient = db.dbRef
    accountDb = db.account

    // The database outlives the run, so clear the previous run's fixtures before seeding.
    await clearTables(dbClient, dbUuid, [...WORKSPACE_TABLES, ...PERSON_TABLES])
    await prepareAccounts(accountDb)
  })

  // Workspaces carry a unique url, so they can't survive into the next test. Persons/accounts
  // stay - prepareAccounts re-creates them only when missing.
  beforeEach(async () => {
    await clearTables(dbClient, dbUuid, WORKSPACE_TABLES)
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = NULL`)
  })

  afterAll(async () => {
    dbClient.close()
    await shutdownPostgres()
  })

  it('Check accounts', async () => {
    const user1 = await accountDb.account.findOne({ uuid: users[0].uuid })
    expect(user1).not.toBeNull()
    expect(user1).toBeDefined()
  })

  it('Check social ids', async () => {
    const user1 = await accountDb.account.findOne({ uuid: users[0].uuid })
    expect(user1).not.toBeNull()
    expect(user1).toBeDefined()

    const socialIds = await accountDb.socialId.find({ personUuid: user1?.uuid })
    expect(socialIds).not.toBeNull()
    expect(socialIds).toBeDefined()
    expect(socialIds.length).toEqual(2)

    const em = socialIds.find((it) => it.type === SocialIdType.EMAIL) as SocialId
    expect(em).toBeDefined()
    expect(em.key).toEqual('email:user1@example.com')
  })

  it('List accounts', async () => {
    const users = await accountDb.listAccounts()
    expect(users.length).toBe(2)
  })

  it('filters unfinished onboarding before pagination', async () => {
    const client = await dbClient.getClient()
    const filter = { onboardingOnly: true }
    expect(await accountDb.listAccounts(undefined, 0, 1, 'name', filter)).toHaveLength(0)
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[0].uuid,
      { intent: { kind: 'workspace' }, stage: 'name' }
    ])
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'workspace' }, stage: 'complete' }
    ])
    expect((await accountDb.listAccounts(undefined, 0, 1, 'name', filter)).map((a) => a.uuid)).toEqual([users[0].uuid])
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[0].uuid,
      { intent: { kind: 'workspace' }, stage: 'workspace' }
    ])
    expect((await accountDb.listAccounts(undefined, 0, 1, 'name', filter)).map((a) => a.uuid)).toEqual([users[0].uuid])
  })

  it('check invites', async () => {
    const wsUuid = await accountDb.createWorkspace(
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
    const inviteLink = await accountDb.invite.insertOne({
      workspaceUuid: wsUuid,
      inviterUuid: users[0].uuid,
      expiresOn: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).getTime()
    })
    expect(inviteLink).toBeDefined()
    expect((await accountDb.invite.findOne({ id: inviteLink }))?.inviterUuid).toBe(users[0].uuid)
  })

  it('creates one onboarding workspace under concurrent and repeated requests', async () => {
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[0].uuid,
      { intent: { kind: 'workspace' }, stage: 'workspace' }
    ])
    const status = {
      isDisabled: true,
      mode: 'pending-creation' as const,
      versionMajor: 0,
      versionMinor: 7,
      versionPatch: 0
    }
    const data = {
      name: 'Onboarding',
      url: 'onboarding',
      region: 'eu',
      allowGuestSignUp: true,
      allowReadOnlyGuest: true
    }
    await accountDb.person.update({ uuid: users[0].uuid }, { firstName: '', lastName: '' })
    const results = await Promise.all(
      Array.from({ length: 3 }, async () => await accountDb.createOnboardingWorkspace(users[0].uuid, data, status))
    )
    expect(results.filter((result) => result?.created === true)).toHaveLength(1)
    expect(results.every((result) => result?.completed === false)).toBe(true)
    const workspace = results[0]?.workspace
    expect(results.every((result) => result?.workspace === workspace)).toBe(true)
    expect(await accountDb.workspace.find({ url: data.url })).toHaveLength(1)
    expect(await accountDb.getWorkspaceRole(users[0].uuid, workspace as any)).toBe(AccountRole.Owner)
    expect((await accountDb.account.findOne({ uuid: users[0].uuid }))?.onboarding).toMatchObject({
      stage: 'name',
      workspace
    })
    await expect(
      accountDb.setOnboardingName(users[0].uuid, users[0].firstName, users[0].lastName)
    ).resolves.toMatchObject({ completed: true })
    expect((await accountDb.account.findOne({ uuid: users[0].uuid }))?.onboarding).toMatchObject({
      stage: 'complete',
      workspace
    })
    expect((await accountDb.workspaceStatus.findOne({ workspaceUuid: workspace as any }))?.mode).toBe(
      'pending-creation'
    )
    await expect(
      accountDb.createOnboardingWorkspace(users[0].uuid, { ...data, url: 'different', region: 'us' }, status)
    ).resolves.toEqual({
      workspace,
      url: 'onboarding',
      region: 'eu',
      created: false,
      completed: false
    })
  })

  it('completes onboarding once when workspace creation races with the name', async () => {
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[0].uuid,
      { intent: { kind: 'workspace' }, stage: 'name', workspaceName: 'Race', region: 'eu' }
    ])
    const data = {
      name: 'Race',
      url: 'onboarding-race',
      region: 'eu',
      allowGuestSignUp: true,
      allowReadOnlyGuest: true
    }
    const status = {
      isDisabled: true,
      mode: 'pending-creation' as const,
      versionMajor: 0,
      versionMinor: 7,
      versionPatch: 0
    }
    const [workspace, name] = await Promise.all([
      accountDb.createOnboardingWorkspace(users[0].uuid, data, status),
      accountDb.setOnboardingName(users[0].uuid, users[0].firstName, users[0].lastName)
    ])
    expect([workspace?.completed, name?.completed].filter(Boolean)).toHaveLength(1)
    expect((await accountDb.account.findOne({ uuid: users[0].uuid }))?.onboarding).toMatchObject({
      stage: 'complete',
      workspace: workspace?.workspace
    })
  })

  it('accepts an invitation only once under concurrent and repeated requests', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const invite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    await accountDb.socialId.update({ personUuid: users[1].uuid, type: SocialIdType.EMAIL }, { verifiedOn: Date.now() })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'invite', inviteId: invite }, stage: 'name' }
    ])
    const results = await Promise.all(
      Array.from({ length: 3 }, async () => await accountDb.completeOnboardingInvite(users[1].uuid))
    )
    expect(results.every((result) => result.result === 'ok' && result.workspace === workspace)).toBe(true)
    expect(results.filter((result) => result.changed === true)).toHaveLength(1)
    expect((await accountDb.invite.findOne({ id: invite }))?.remainingUses).toBe(0)
    expect(await accountDb.getWorkspaceRole(users[1].uuid, workspace)).toBe(AccountRole.User)
    await expect(accountDb.completeOnboardingInvite(users[1].uuid)).resolves.toMatchObject({
      result: 'ok',
      workspace,
      changed: false
    })
  })

  it.each([
    ['new account', '', '', 'First', 'Last'],
    ['missing surname', 'Existing', '', 'Existing', 'Last'],
    ['complete profile', 'Existing', 'Name', 'Existing', 'Name']
  ])(
    'fills only missing profile names for an invitation: %s',
    async (_case, first, last, expectedFirst, expectedLast) => {
      const workspace = await accountDb.createWorkspace(
        { name: 'Invite', url: 'invite-profile', allowGuestSignUp: true, allowReadOnlyGuest: true },
        { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
      )
      const invite = await accountDb.invite.insertOne({
        workspaceUuid: workspace,
        expiresOn: Date.now() + 60000,
        remainingUses: 1,
        role: AccountRole.User
      })
      await accountDb.person.update({ uuid: users[1].uuid }, { firstName: first, lastName: last })
      const client = await dbClient.getClient()
      await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
        users[1].uuid,
        { intent: { kind: 'invite', inviteId: invite }, stage: 'name' }
      ])
      try {
        await expect(
          accountDb.completeOnboardingInvite(users[1].uuid, invite, workspace, {
            firstName: 'First',
            lastName: 'Last'
          })
        ).resolves.toMatchObject({ result: 'ok', workspace })
        expect(await accountDb.person.findOne({ uuid: users[1].uuid })).toMatchObject({
          firstName: expectedFirst,
          lastName: expectedLast
        })
        await expect(accountDb.completeOnboardingInvite(users[1].uuid, invite, workspace)).resolves.toMatchObject({
          result: 'ok',
          workspace,
          changed: false
        })
        expect((await accountDb.invite.findOne({ id: invite }))?.remainingUses).toBe(0)
      } finally {
        await accountDb.person.update(
          { uuid: users[1].uuid },
          { firstName: users[1].firstName, lastName: users[1].lastName }
        )
      }
    }
  )

  it('accepts concurrent onboarding completion with names once', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'concurrent-name-invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const invite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'invite', inviteId: invite }, stage: 'name' }
    ])
    await accountDb.person.update({ uuid: users[1].uuid }, { firstName: '', lastName: '' })
    try {
      const results = await Promise.all(
        Array.from(
          { length: 3 },
          async () =>
            await accountDb.completeOnboardingInvite(users[1].uuid, undefined, undefined, {
              firstName: 'First',
              lastName: 'Last'
            })
        )
      )
      expect(results.every((result) => result.result === 'ok' && result.workspace === workspace)).toBe(true)
      expect(results.filter((result) => result.changed === true)).toHaveLength(1)
      expect((await accountDb.invite.findOne({ id: invite }))?.remainingUses).toBe(0)
    } finally {
      await accountDb.person.update(
        { uuid: users[1].uuid },
        { firstName: users[1].firstName, lastName: users[1].lastName }
      )
    }
  })

  it('rejects onboarding completion when another tab replaced the invitation', async () => {
    const status = { isDisabled: false, mode: 'active' as const, versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    const first = await accountDb.createWorkspace(
      { name: 'First', url: 'invite-first', allowGuestSignUp: true, allowReadOnlyGuest: true },
      status
    )
    const second = await accountDb.createWorkspace(
      { name: 'Second', url: 'invite-second', allowGuestSignUp: true, allowReadOnlyGuest: true },
      status
    )
    const firstInvite = await accountDb.invite.insertOne({
      workspaceUuid: first,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    const secondInvite = await accountDb.invite.insertOne({
      workspaceUuid: second,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'invite', inviteId: secondInvite }, stage: 'name' }
    ])
    await accountDb.person.update({ uuid: users[1].uuid }, { firstName: '', lastName: '' })
    try {
      await expect(
        accountDb.completeOnboardingInvite(
          users[1].uuid,
          undefined,
          undefined,
          { firstName: 'First', lastName: 'Last' },
          firstInvite
        )
      ).resolves.toEqual({ result: 'forbidden' })
      expect(await accountDb.getWorkspaceRole(users[1].uuid, first)).toBeNull()
      expect(await accountDb.getWorkspaceRole(users[1].uuid, second)).toBeNull()
      expect(await accountDb.person.findOne({ uuid: users[1].uuid })).toMatchObject({ firstName: '', lastName: '' })
      expect((await accountDb.invite.findOne({ id: secondInvite }))?.remainingUses).toBe(1)
    } finally {
      await accountDb.person.update(
        { uuid: users[1].uuid },
        { firstName: users[1].firstName, lastName: users[1].lastName }
      )
    }
  })

  it('completes an unfinished invitation when accepting a replacement as the current account', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'replacement', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const oldInvite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: 1,
      role: AccountRole.User
    })
    const replacement = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'invite', inviteId: oldInvite }, stage: 'name' }
    ])

    await accountDb.person.update({ uuid: users[1].uuid }, { firstName: '' })
    try {
      await expect(accountDb.completeOnboardingInvite(users[1].uuid, replacement, workspace)).resolves.toEqual({
        result: 'forbidden'
      })
      expect((await accountDb.invite.findOne({ id: replacement }))?.remainingUses).toBe(1)
      expect(await accountDb.getWorkspaceRole(users[1].uuid, workspace)).toBeNull()
      expect((await accountDb.account.findOne({ uuid: users[1].uuid }))?.onboarding).toEqual({
        intent: { kind: 'invite', inviteId: oldInvite },
        stage: 'name'
      })
    } finally {
      await accountDb.person.update({ uuid: users[1].uuid }, { firstName: users[1].firstName })
    }

    await expect(accountDb.completeOnboardingInvite(users[1].uuid, replacement, workspace)).resolves.toMatchObject({
      result: 'ok',
      workspace
    })
    expect((await accountDb.account.findOne({ uuid: users[1].uuid }))?.onboarding).toEqual({
      intent: { kind: 'invite', inviteId: replacement },
      stage: 'complete',
      workspace
    })
    expect(await accountDb.getWorkspaceRole(users[1].uuid, workspace)).toBe(AccountRole.User)
    expect((await accountDb.invite.findOne({ id: replacement }))?.remainingUses).toBe(0)
  })

  it('completes unfinished workspace onboarding when accepting an invitation', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'workspace-invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const invite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'workspace' }, stage: 'workspace' }
    ])
    await accountDb.person.update({ uuid: users[1].uuid }, { firstName: '', lastName: '' })
    await accountDb.setOnboardingName(users[1].uuid, users[1].firstName, users[1].lastName)
    expect(await accountDb.person.findOne({ uuid: users[1].uuid })).toMatchObject({
      firstName: users[1].firstName,
      lastName: users[1].lastName
    })

    await expect(accountDb.completeOnboardingInvite(users[1].uuid, invite, workspace)).resolves.toMatchObject({
      result: 'ok',
      workspace
    })
    expect((await accountDb.account.findOne({ uuid: users[1].uuid }))?.onboarding).toEqual({
      intent: { kind: 'invite', inviteId: invite },
      stage: 'complete',
      workspace
    })
  })

  it('lets multiple accounts use a shared invitation up to its limit', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Shared invite', url: 'shared-invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const invite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 2,
      role: AccountRole.User
    })
    const results = await Promise.all(
      users.map(async (user) => await accountDb.completeOnboardingInvite(user.uuid, invite, workspace))
    )
    expect(results).toEqual([
      expect.objectContaining({ result: 'ok', workspace }),
      expect.objectContaining({ result: 'ok', workspace })
    ])
    expect((await accountDb.invite.findOne({ id: invite }))?.remainingUses).toBe(0)
    expect(await accountDb.completeOnboardingInvite(users[1].uuid, invite, workspace)).toEqual({ result: 'forbidden' })
  })

  it.each([
    ['expired', { expiresOn: 1 }, 'expired'],
    ['another email', { email: 'other@example.com' }, 'forbidden'],
    ['use limit', { remainingUses: 0 }, 'forbidden']
  ])('refuses an invitation with %s', async (_name, override, expected) => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const invite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User,
      ...override
    })
    await accountDb.socialId.update({ personUuid: users[1].uuid, type: SocialIdType.EMAIL }, { verifiedOn: Date.now() })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'invite', inviteId: invite }, stage: 'name' }
    ])
    await expect(accountDb.completeOnboardingInvite(users[1].uuid)).resolves.toMatchObject({ result: expected })
    expect(await accountDb.getWorkspaceRole(users[1].uuid, workspace)).toBeNull()
  })

  it('does not update the profile when the invitation belongs to another email', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'wrong-email-profile', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const invite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User,
      email: 'other@example.com'
    })
    await accountDb.person.update({ uuid: users[1].uuid }, { firstName: '', lastName: '' })
    try {
      await expect(
        accountDb.completeOnboardingInvite(users[1].uuid, invite, workspace, {
          firstName: 'First',
          lastName: 'Last'
        })
      ).resolves.toEqual({ result: 'forbidden' })
      expect(await accountDb.person.findOne({ uuid: users[1].uuid })).toMatchObject({ firstName: '', lastName: '' })
      expect(await accountDb.getWorkspaceRole(users[1].uuid, workspace)).toBeNull()
      expect((await accountDb.invite.findOne({ id: invite }))?.remainingUses).toBe(1)
    } finally {
      await accountDb.person.update(
        { uuid: users[1].uuid },
        { firstName: users[1].firstName, lastName: users[1].lastName }
      )
    }
  })

  it.each(['*', '^other@example\\.com$'])(
    'accepts an existing invitation with legacy mask %s',
    async (emailPattern) => {
      const workspace = await accountDb.createWorkspace(
        { name: 'Invite', url: 'invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
        { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
      )
      const invite = await accountDb.invite.insertOne({
        workspaceUuid: workspace,
        expiresOn: Date.now() + 60000,
        remainingUses: 2,
        role: AccountRole.User,
        emailPattern
      })
      const result = await accountDb.completeOnboardingInvite(users[1].uuid, invite, workspace)
      expect(result).toMatchObject({ result: 'ok', workspace })
      expect((await accountDb.invite.findOne({ id: invite }))?.remainingUses).toBe(1)
    }
  )

  it('admits an invited member when no paid seats remain', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Seats', url: 'seats', createdBy: users[0].uuid, allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    await accountDb.assignWorkspace(users[0].uuid, workspace, AccountRole.Owner)
    const existingUser = generateUuid() as AccountUuid
    await accountDb.person.insertOne({ uuid: existingUser, firstName: 'Existing', lastName: 'User' })
    await createAccount(accountDb, existingUser, true)
    await accountDb.assignWorkspace(existingUser, workspace, AccountRole.User)
    await accountDb.subscription.insertOne({
      id: generateUuid(),
      workspaceUuid: workspace,
      accountUuid: users[0].uuid,
      provider: 'free',
      providerSubscriptionId: 'onboarding-seats',
      type: SubscriptionType.Tier,
      status: SubscriptionStatus.Active,
      plan: 'free',
      limits: { usersLimit: 2, storageLimitGB: 0, trafficLimitGB: 0, meetingMinutesLimit: 0, tokenLimit: 0 }
    })
    const invite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    await accountDb.socialId.update({ personUuid: users[1].uuid, type: SocialIdType.EMAIL }, { verifiedOn: Date.now() })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      users[1].uuid,
      { intent: { kind: 'invite', inviteId: invite }, stage: 'name' }
    ])
    await expect(accountDb.completeOnboardingInvite(users[1].uuid)).resolves.toMatchObject({ result: 'ok' })
    expect((await accountDb.invite.findOne({ id: invite }))?.remainingUses).toBe(0)
    expect(await accountDb.getWorkspaceRole(users[1].uuid, workspace)).toBe(AccountRole.User)
    expect(await accountDb.getWorkspaceMembers(workspace)).toEqual(
      expect.arrayContaining([
        { person: users[0].uuid, role: AccountRole.Owner },
        { person: existingUser, role: AccountRole.User },
        { person: users[1].uuid, role: AccountRole.User, seatOrder: 1 }
      ])
    )
    const other = generateUuid() as AccountUuid
    await accountDb.person.insertOne({ uuid: other, firstName: 'Existing', lastName: 'Account' })
    await createAccount(accountDb, other, true)
    const anotherInvite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    await expect(accountDb.completeOnboardingInvite(other, anotherInvite, workspace)).resolves.toEqual({
      result: 'seat-limit'
    })
    expect((await accountDb.invite.findOne({ id: anotherInvite }))?.remainingUses).toBe(1)
    await accountDb.assignWorkspace(other, workspace, AccountRole.Guest)
    await expect(accountDb.completeOnboardingInvite(other, anotherInvite, workspace)).resolves.toMatchObject({
      result: 'ok'
    })
    expect(await accountDb.getWorkspaceRole(other, workspace)).toBe(AccountRole.User)
    await accountDb.unassignWorkspace(users[1].uuid, workspace)
    await accountDb.assignWorkspace(users[1].uuid, workspace, AccountRole.Guest)
    expect((await accountDb.getWorkspaceMembers(workspace)).find((m) => m.person === users[1].uuid)).toEqual({
      person: users[1].uuid,
      role: AccountRole.Guest
    })
  })

  it('keeps the assigned role when a membership is added again', async () => {
    const workspace = await accountDb.createWorkspace(
      {
        name: 'Reassign',
        url: 'reassign-role',
        createdBy: users[0].uuid,
        allowGuestSignUp: false,
        allowReadOnlyGuest: false
      },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    await accountDb.assignWorkspace(users[0].uuid, workspace, AccountRole.Owner)
    await accountDb.assignWorkspace(users[0].uuid, workspace, AccountRole.User)
    expect(await accountDb.getWorkspaceRole(users[0].uuid, workspace)).toBe(AccountRole.Owner)

    await accountDb.batchAssignWorkspace([[users[0].uuid, workspace, AccountRole.Guest]])
    expect(await accountDb.getWorkspaceRole(users[0].uuid, workspace)).toBe(AccountRole.Owner)

    await accountDb.updateWorkspaceRole(users[0].uuid, workspace, AccountRole.Maintainer)
    expect(await accountDb.getWorkspaceRole(users[0].uuid, workspace)).toBe(AccountRole.Maintainer)
  })

  it('lists all members and only their verified email addresses', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'List', url: 'seat-list', createdBy: users[0].uuid, allowGuestSignUp: false, allowReadOnlyGuest: false },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    await accountDb.assignWorkspace(users[0].uuid, workspace, AccountRole.Owner)
    await accountDb.assignWorkspace(users[1].uuid, workspace, AccountRole.Guest)
    const client = await dbClient.getClient()
    await client.unsafe(
      `UPDATE ${dbUuid}.social_id SET verified_on = CASE WHEN person_uuid = $1 THEN 1 ELSE 0 END WHERE person_uuid IN ($1, $2) AND type = 'email'`,
      [users[0].uuid, users[1].uuid]
    )
    const members = await accountDb.getWorkspaceMemberDetails(workspace)
    expect(members.find((member) => member.person === users[0].uuid)).toMatchObject({
      firstName: 'Jon',
      email: users[0].email
    })
    expect(members.find((member) => member.person === users[1].uuid)).toMatchObject({
      firstName: 'Pavel',
      role: AccountRole.Guest,
      email: undefined
    })
  })
})
