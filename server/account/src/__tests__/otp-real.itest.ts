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

/**
 * Purpose of a code and the count of wrong guesses at login codes on a real database,
 * once per flavor in realDbFlavors.
 */

import {
  AccountRole,
  generateUuid,
  SocialIdType,
  type AccountUuid,
  type MeasureContext,
  type PersonUuid
} from '@hcengineering/core'
import platform, { PlatformError, setMetadata } from '@hcengineering/platform'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { decodeTokenVerbose } from '@hcengineering/server-token'
import crypto from 'crypto'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { getMigrations } from '../collections/postgres/migrations'
import {
  checkAutoJoin,
  checkJoin,
  completeOnboardingInvite,
  confirmEmailOtp as confirmEmailOtpImpl,
  createInvite,
  createWorkspace,
  getLoginInfoByToken,
  getWorkspaceMemberDetails,
  getWorkspaceMembers,
  getWorkspaceSeats,
  login,
  loginByLink,
  loginOtp,
  requestEmailOtp,
  restorePassword,
  setOnboardingName,
  validateOtp
} from '../operations'
import { accountPlugin } from '../plugin'
import { SubscriptionStatus, SubscriptionType, type SocialId } from '../types'
import {
  consumeLoginLink,
  createAccount,
  isOtpValid,
  joinWithProvider,
  loginOrSignUpWithProvider,
  notifyLoginLock,
  resetRegionConfig,
  OTP_MAX_ATTEMPTS,
  sendOtp,
  setPassword
} from '../utils'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

jest.setTimeout(90000)

async function confirmEmailOtp (
  ...args: Parameters<typeof confirmEmailOtpImpl>
): ReturnType<typeof confirmEmailOtpImpl> {
  args[4] = { ...args[4], consent: { personalData: true, rules: true } }
  return await confirmEmailOtpImpl(...args)
}

jest.mock('@hcengineering/platform', () => {
  const actual = jest.requireActual('@hcengineering/platform')
  return {
    ...actual,
    ...actual.default,
    translate: jest.fn(async (id: string, params?: unknown) => `${id} ${JSON.stringify(params ?? {})}`)
  }
})

jest.mock('@hcengineering/server-token', () => ({
  ...jest.requireActual('@hcengineering/server-token'),
  generateToken: jest.fn(() => 'token'),
  decodeTokenVerbose: jest.fn()
}))

describe.each(realDbFlavors)('real-otp [$flavor]', ({ flavor, adminUri, dbUri }) => {
  const personUuid = generateUuid() as AccountUuid
  const email = 'otp-real@example.com'
  const otherEmail = 'otp-real-other@example.com'
  const day = 24 * 60 * 60 * 1000
  const ctx = { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as MeasureContext
  const mailSend = jest.fn()
  let dbUuid: string
  let dbClient: PostgresClientReference
  let accountDb: PostgresAccountDB
  let social: SocialId
  let other: SocialId
  const previousRegionConfig = process.env.REGION_CONFIG_JSON

  const insertCode = async (purpose: 'login' | 'operation', code: string, expiresOn?: number): Promise<void> => {
    if (purpose === 'login') {
      await accountDb.withEmailOtp(email, async (state) => {
        state.code = code
        state.expiresOn = expiresOn ?? Date.now() + 600 * 1000
        state.createdOn = Date.now()
        state.attempts = 0
      })
      return
    }
    await accountDb.otp.insertOne({
      socialId: social._id,
      purpose,
      code,
      expiresOn: expiresOn ?? Date.now() + 600 * 1000,
      createdOn: Date.now()
    })
  }
  const bump = async (purpose: 'login' | 'operation', guess: string): Promise<void> => {
    if (purpose === 'operation') {
      await accountDb.bumpOtpAttempts(social._id)
      return
    }
    await validateOtp(ctx, accountDb, null, '', { email, code: guess }).catch((err) => {
      if (!(err instanceof PlatformError)) throw err
    })
  }
  const reread = async (row: SocialId = social): Promise<SocialId> =>
    (await accountDb.socialId.findOne({ _id: row._id })) as SocialId
  // The count and whether a time is stamped, for both emails of the account.
  const counters = async (): Promise<unknown> =>
    (await Promise.all([reread(social), reread(other)])).map((r) => [
      r.loginOtpMisses,
      r.loginOtpMissedOn === 0 ? 0 : 'stamped'
    ])
  // Moves the last wrong guess back, as if the 1 hour wait had passed.
  const letWaitPass = async (): Promise<void> => {
    await accountDb.withEmailOtp(email, async (state) => {
      state.missedOn = Date.now() - 60 * 60 * 1000 - 1000
    })
  }
  // Both emails of the account carry misses, as after a bout of wrong guesses.
  const plantMisses = async (): Promise<void> => {
    await accountDb.socialId.update({ personUuid }, { loginOtpMisses: 7, loginOtpMissedOn: Date.now() })
  }

  beforeAll(async () => {
    const db = await openRealDb('otp', { flavor, adminUri, dbUri })
    dbUuid = db.dbUuid
    dbClient = db.dbRef
    accountDb = db.account
    // The retry delay is real time here: a second keeps the waits short.
    setMetadata(accountPlugin.metadata.OtpRetryDelaySec, 1)
    setMetadata(accountPlugin.metadata.OtpTimeToLiveSec, 600)
    setMetadata(accountPlugin.metadata.MailQueue, { send: mailSend } as any)
    const endpoints = [{ external: 'http://localhost', internal: 'http://localhost' }]
    process.env.REGION_CONFIG_JSON = JSON.stringify({
      regions: { eu: { transactors: endpoints, collaborators: endpoints } }
    })
    resetRegionConfig()
  })

  beforeEach(async () => {
    mailSend.mockClear()
    setMetadata(accountPlugin.metadata.OtpRetryDelaySec, 1)
    await clearTables(dbClient, dbUuid, [
      'invite',
      'workspace_members',
      'workspace_status',
      'subscription',
      'workspace',
      'email_otp',
      'otp',
      'social_id',
      'account_events',
      'account_passwords',
      'account',
      'person'
    ])
    await accountDb.person.insertOne({ uuid: personUuid, firstName: 'Otp', lastName: 'Real' })
    await createAccount(accountDb, personUuid, true)
    const insertEmail = async (value: string): Promise<SocialId> => {
      const _id = await accountDb.socialId.insertOne({
        type: SocialIdType.EMAIL,
        value,
        personUuid: personUuid as unknown as PersonUuid,
        verifiedOn: Date.now()
      })
      return (await accountDb.socialId.findOne({ _id })) as SocialId
    }
    social = await insertEmail(email)
    other = await insertEmail(otherEmail)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('serializes email OTP state across transactions and rolls back failures', async () => {
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        await accountDb.withEmailOtp(email, async (state) => {
          state.misses++
        })
      })
    )
    await expect(
      accountDb.withEmailOtp(email, async (state) => {
        state.misses++
        throw new Error('rollback')
      })
    ).rejects.toThrow('rollback')
    const misses = await accountDb.withEmailOtp(email, async (state) => state.misses)
    expect(misses).toBe(6)
  })

  it('revokes recovery links after a successful email code even without old misses', async () => {
    const link = 'ab'.repeat(32)
    await accountDb.otp.insertOne({
      socialId: other._id,
      purpose: 'login-link',
      code: crypto.createHash('sha256').update(link).digest('hex'),
      createdOn: Date.now(),
      expiresOn: Date.now() + 600000
    })
    await requestEmailOtp(ctx, accountDb, null, '', { email })
    const code = await accountDb.withEmailOtp(email, async (state) => state.code as string)
    await confirmEmailOtp(ctx, accountDb, null, '', { email, code })
    expect(await consumeLoginLink(accountDb, link)).toBeUndefined()
  })

  it('migrates active legacy codes and counters without replacing current state', async () => {
    const now = Date.now()
    await accountDb.socialId.update({ _id: social._id }, { loginOtpMisses: 3, loginOtpMissedOn: now })
    await accountDb.socialId.update({ _id: other._id }, { loginOtpMisses: 5, loginOtpMissedOn: now })
    await accountDb.otp.insertOne({
      socialId: social._id,
      purpose: 'login',
      code: '111111',
      createdOn: now - 1,
      expiresOn: now + 60000,
      attempts: 1
    })
    await accountDb.otp.insertOne({
      socialId: social._id,
      purpose: 'login',
      code: '222222',
      createdOn: now,
      expiresOn: now + 60000,
      attempts: 2
    })
    await accountDb.otp.insertOne({
      socialId: social._id,
      purpose: 'operation',
      code: '333333',
      createdOn: now + 1,
      expiresOn: now + 60000
    })
    const migration = getMigrations(dbUuid, flavor).find(([name]) => name === 'account_db_v60_migrate_login_otp')
    expect(migration).toBeDefined()
    const client = await dbClient.getClient()
    await client.unsafe(migration?.[1] as string)
    expect(await accountDb.withEmailOtp(email, async (state) => ({ ...state }))).toMatchObject({
      code: '222222',
      attempts: 2,
      misses: 3,
      missedOn: now
    })
    expect(await accountDb.withEmailOtp(otherEmail, async (state) => ({ ...state }))).toMatchObject({
      code: null,
      misses: 5,
      missedOn: now
    })
    await accountDb.withEmailOtp(email, async (state) => {
      state.attempts = 4
    })
    await client.unsafe(migration?.[1] as string)
    expect(await accountDb.withEmailOtp(email, async (state) => state.attempts)).toBe(4)
    await expect(validateOtp(ctx, accountDb, null, '', { email, code: '222222' })).resolves.toMatchObject({
      account: personUuid
    })
  })

  it('records consent only after verifying a new email', async () => {
    const address = 'a.b+registration-consent@example.com'
    const consent = { personalData: true, rules: true }
    await requestEmailOtp(ctx, accountDb, null, '', { email: address, consent })
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)

    await expect(
      confirmEmailOtpImpl(ctx, accountDb, null, '', { email: address, code: 'incorrect', consent })
    ).rejects.toMatchObject({
      status: { code: platform.status.InvalidOtp }
    })
    await expect(confirmEmailOtpImpl(ctx, accountDb, null, '', { email: address, code })).rejects.toMatchObject({
      status: { params: { consentRequired: true } }
    })
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()

    const result = await confirmEmailOtpImpl(ctx, accountDb, null, '', {
      email: address,
      code,
      consent
    })
    expect(result.created).toBe(true)
    expect((await accountDb.account.findOne({ uuid: result.account }))?.consentAcceptedOn).toBeGreaterThan(0)

    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const loginCode = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    await expect(
      confirmEmailOtpImpl(ctx, accountDb, null, '', { email: address, code: loginCode })
    ).resolves.toMatchObject({
      account: result.account,
      created: false
    })
  })

  it('does not create a provider account until consent and does not ask again on login', async () => {
    const address = 'provider-consent@example.com'
    const social = { type: SocialIdType.GOOGLE, value: address }
    await expect(loginOrSignUpWithProvider(ctx, accountDb, null, address, 'First', 'Last', social)).resolves.toBeNull()
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    const created = await loginOrSignUpWithProvider(ctx, accountDb, null, address, 'First', 'Last', social, false, true)
    expect(created).not.toBeNull()
    expect(
      (await accountDb.account.findOne({ uuid: created?.account as AccountUuid }))?.consentAcceptedOn
    ).toBeGreaterThan(0)
    const login = await loginOrSignUpWithProvider(ctx, accountDb, null, address, 'First', 'Last', social)
    expect(login?.account).toBe(created?.account)
  })

  it('creates an account only once after a correct email code', async () => {
    const address = 'new-email-otp@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    await expect(confirmEmailOtp(ctx, accountDb, null, '', { email: address, code: 'wrong' })).rejects.toThrow()
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    const results = await Promise.allSettled(
      Array.from({ length: 2 }, async () => await confirmEmailOtp(ctx, accountDb, null, '', { email: address, code }))
    )
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const sid = await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })
    expect(sid).not.toBeNull()
    expect(await accountDb.account.findOne({ uuid: sid?.personUuid as AccountUuid })).not.toBeNull()
  })

  it('rolls back account and OTP when registration fails', async () => {
    const address = 'password-rollback@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code)
    await expect(
      accountDb.withEmailOtp(address, async (state, resolve) => {
        const identity = await resolve(true)
        if (identity === null) throw new Error('account was not created')
        state.code = null
        throw new Error('registration failed')
      })
    ).rejects.toThrow('registration failed')
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    expect(await accountDb.withEmailOtp(address, async (state) => state.code)).toBe(code)
  })

  it('persists the onboarding intent with the new account', async () => {
    const address = 'onboarding@example.com'
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'onboarding-invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const inviteId = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      role: AccountRole.User
    })
    const intent = { kind: 'invite' as const, inviteId }
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    const result = await confirmEmailOtp(ctx, accountDb, null, '', { email: address, code, intent })
    expect(result.onboarding).toEqual({ intent, stage: 'name' })
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: result.account, extra: {} })
    const restored = await getLoginInfoByToken(ctx, accountDb, null, 'token')
    expect(restored).toMatchObject({ onboarding: { intent, stage: 'name' } })
  })

  it('restores the workspace before collecting the name', async () => {
    const address = 'onboarding-workspace@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    const result = await confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: result.account, extra: {} })
    expect(result.onboarding).toMatchObject({ stage: 'workspace', intent: { kind: 'workspace' } })
    await expect(
      createWorkspace(ctx, accountDb, null, 'token', {
        workspaceName: 'A personal space',
        region: 'eu',
        onboarding: true
      })
    ).resolves.toMatchObject({ account: result.account })
    expect(await getLoginInfoByToken(ctx, accountDb, null, 'token')).toMatchObject({
      onboarding: { stage: 'name', workspaceName: 'A personal space', region: 'eu' }
    })
    await expect(
      setOnboardingName(ctx, accountDb, null, 'token', { first: 'First', last: 'Last' })
    ).resolves.toMatchObject({ stage: 'complete', intent: { kind: 'workspace' }, workspaceName: 'A personal space' })
    expect(await accountDb.person.findOne({ uuid: result.account })).toMatchObject({
      firstName: 'First',
      lastName: 'Last'
    })
    expect(await getLoginInfoByToken(ctx, accountDb, null, 'token')).toMatchObject({
      onboarding: { stage: 'complete', workspaceName: 'A personal space', region: 'eu' }
    })
  })

  it.each([AccountRole.User, null])('checks the current role %s on workspace onboarding retry', async (role) => {
    const address = 'onboarding-retry@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    const { account, token } = await confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account, extra: {} })
    const params = { workspaceName: 'Onboarding retry', region: 'eu', onboarding: true }
    const created = await createWorkspace(ctx, accountDb, null, token as string, params)
    expect(created.role).toBe(AccountRole.Owner)
    await expect(createWorkspace(ctx, accountDb, null, token as string, params)).resolves.toMatchObject({
      role: AccountRole.Owner,
      workspace: created.workspace,
      workspaceUrl: created.workspaceUrl
    })

    if (role == null) {
      await accountDb.unassignWorkspace(account, created.workspace)
      await expect(createWorkspace(ctx, accountDb, null, token as string, params)).rejects.toMatchObject({
        status: { code: platform.status.Forbidden }
      })
    } else {
      await accountDb.updateWorkspaceRole(account, created.workspace, role)
      await expect(createWorkspace(ctx, accountDb, null, token as string, params)).resolves.toMatchObject({
        role,
        workspace: created.workspace
      })
    }
  })

  it('requires a verified recipient before checkJoin upgrades a member', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Named invite', url: 'named-invite', region: 'eu', allowGuestSignUp: false, allowReadOnlyGuest: false },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    await accountDb.assignWorkspace(personUuid, workspace, AccountRole.User)
    await accountDb.socialId.update({ _id: other._id }, { verifiedOn: 0 })
    const inviteId = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      email: ` ${otherEmail.toUpperCase()} `,
      remainingUses: 1,
      role: AccountRole.Maintainer
    })
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, workspace, extra: {} })
    await expect(checkJoin(ctx, accountDb, null, 'token', { inviteId })).rejects.toMatchObject({
      status: { code: platform.status.Forbidden }
    })
    await expect(accountDb.getWorkspaceRole(personUuid, workspace)).resolves.toBe(AccountRole.User)

    await accountDb.socialId.update({ _id: other._id }, { verifiedOn: Date.now() })
    await expect(checkJoin(ctx, accountDb, null, 'token', { inviteId })).resolves.toMatchObject({
      account: personUuid,
      workspace,
      role: AccountRole.Maintainer
    })
    await expect(accountDb.getWorkspaceRole(personUuid, workspace)).resolves.toBe(AccountRole.Maintainer)
  })

  it('rejects a blocked maintainer requesting member details with the same session', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Members', url: 'member-details', allowGuestSignUp: false, allowReadOnlyGuest: false },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    await accountDb.assignWorkspace(personUuid, workspace, AccountRole.Maintainer)
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, workspace, extra: {} })
    const session = 'workspace-token'
    await expect(getWorkspaceMemberDetails(ctx, accountDb, null, session)).resolves.toMatchObject([
      { person: personUuid, role: AccountRole.Maintainer, firstName: 'Otp', lastName: 'Real' }
    ])

    await accountDb.account.update({ uuid: personUuid }, { blockedOn: Date.now() })
    await expect(getWorkspaceMemberDetails(ctx, accountDb, null, session)).rejects.toMatchObject({
      status: { code: platform.status.AccountBlocked }
    })
  })

  it.each(['login', 'restorePassword'])('returns unfinished onboarding from %s', async (method) => {
    const address = 'onboarding-password@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    const { account } = await confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })
    const password = 'New-password1!'
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account, extra: { restoreEmail: address } })

    if (method === 'login') {
      await setPassword(ctx, accountDb, null, account, password)
    }
    const result =
      method === 'login'
        ? await login(ctx, accountDb, null, '', { email: address, password })
        : await restorePassword(ctx, accountDb, null, 'recovery-token', { password })
    expect(result).toMatchObject({
      account,
      token: expect.any(String),
      onboarding: { intent: { kind: 'workspace' }, stage: 'workspace' }
    })
  })

  it('does not replace an existing account onboarding intent during login', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'existing-invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const inviteId = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      role: AccountRole.User
    })
    await requestEmailOtp(ctx, accountDb, null, '', { email })
    const code = await accountDb.withEmailOtp(email, async (state) => state.code as string)
    const result = await confirmEmailOtp(ctx, accountDb, null, '', {
      email,
      code,
      intent: { kind: 'invite', inviteId }
    })
    expect(result.account).toBe(personUuid)
    expect(result.onboarding).toBeNull()
    mailSend.mockClear()
    await requestEmailOtp(ctx, accountDb, null, '', { email })
    expect(mailSend).toHaveBeenCalledTimes(1)
  })

  it('replaces an unfinished invitation only after OTP and invitation checks', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'replacement-invite', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const oldInvite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: 1,
      role: AccountRole.User
    })
    const newInvite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      role: AccountRole.User,
      emailPattern: '*'
    })
    const mismatchedInvite = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      role: AccountRole.User,
      email: 'other@example.com'
    })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      personUuid,
      { intent: { kind: 'invite', inviteId: oldInvite }, stage: 'name' }
    ])
    await requestEmailOtp(ctx, accountDb, null, '', { email })
    const code = await accountDb.withEmailOtp(email, async (state) => state.code as string)
    await expect(
      confirmEmailOtp(ctx, accountDb, null, '', {
        email,
        code: 'wrong',
        intent: { kind: 'invite', inviteId: newInvite }
      })
    ).rejects.toThrow()
    expect((await accountDb.account.findOne({ uuid: personUuid }))?.onboarding?.intent).toEqual({
      kind: 'invite',
      inviteId: oldInvite
    })
    await expect(
      confirmEmailOtp(ctx, accountDb, null, '', { email, code, intent: { kind: 'invite', inviteId: oldInvite } })
    ).rejects.toThrow()
    await expect(
      confirmEmailOtp(ctx, accountDb, null, '', { email, code, intent: { kind: 'invite', inviteId: mismatchedInvite } })
    ).rejects.toThrow()
    expect((await accountDb.account.findOne({ uuid: personUuid }))?.onboarding?.intent).toEqual({
      kind: 'invite',
      inviteId: oldInvite
    })
    const result = await confirmEmailOtp(ctx, accountDb, null, '', {
      email,
      code,
      intent: { kind: 'invite', inviteId: newInvite }
    })
    expect(result.onboarding).toEqual({ intent: { kind: 'invite', inviteId: newInvite }, stage: 'name' })
  })

  it('keeps an invitation unused when provider login needs to complete a name', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'provider-replacement', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const inviteId = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      remainingUses: 1,
      role: AccountRole.User
    })
    await accountDb.person.update({ uuid: personUuid }, { firstName: '', lastName: '' })
    const client = await dbClient.getClient()
    const onboarding = { intent: { kind: 'invite', inviteId: 'expired-invite' }, stage: 'name' }
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [personUuid, onboarding])

    const result = await joinWithProvider(ctx, accountDb, null, email, 'Otp', 'Real', inviteId, {
      type: SocialIdType.GOOGLE,
      value: 'provider-replacement'
    })
    expect(result).toMatchObject({ account: personUuid, onboarding })
    expect((await accountDb.invite.findOne({ id: inviteId }))?.remainingUses).toBe(1)
    expect(await accountDb.getWorkspaceRole(personUuid, workspace)).toBeNull()
  })

  it('completes a new provider account invitation after the plan fills', async () => {
    const address = 'provider-invite@example.com'
    const workspace = await accountDb.createWorkspace(
      {
        name: 'Provider invite',
        url: 'provider-invite',
        region: 'eu',
        allowGuestSignUp: false,
        allowReadOnlyGuest: false
      },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    await accountDb.assignWorkspace(personUuid, workspace, AccountRole.Owner)
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, workspace, extra: {} })
    const inviteId = await createInvite(ctx, accountDb, null, 'owner-token', {
      exp: 60000,
      email: address,
      limit: 1,
      role: AccountRole.User
    })
    const legacyInvite = '987654321098765432'
    await accountDb.invite.update({ id: inviteId }, { migratedFrom: legacyInvite })
    await accountDb.subscription.insertOne({
      id: generateUuid(),
      workspaceUuid: workspace,
      accountUuid: personUuid,
      provider: 'manual',
      providerSubscriptionId: 'provider-invite-plan',
      type: SubscriptionType.Tier,
      status: SubscriptionStatus.Active,
      plan: 'free',
      limits: { usersLimit: 1, storageLimitGB: 0, trafficLimitGB: 0, meetingMinutesLimit: 0, tokenLimit: 0 }
    })
    await expect(getWorkspaceSeats(ctx, accountDb, null, 'owner-token')).resolves.toEqual({
      available: false,
      seatsLeft: 0
    })

    const provider = { type: SocialIdType.GOOGLE, value: 'provider-invite' }
    await expect(
      joinWithProvider(ctx, accountDb, null, address, 'First', '', legacyInvite, provider)
    ).resolves.toBeNull()
    const result = await joinWithProvider(
      ctx,
      accountDb,
      null,
      address,
      'First',
      '',
      legacyInvite,
      provider,
      false,
      true
    )
    const intent = { kind: 'invite', inviteId }
    expect(result).toMatchObject({ token: expect.any(String), onboarding: { intent, stage: 'name' } })
    const account = result?.account as AccountUuid
    expect(await getWorkspaceMembers(ctx, accountDb, null, 'owner-token')).toEqual([
      { person: personUuid, role: AccountRole.Owner }
    ])
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account, extra: {} })
    const token = result?.token as string
    await expect(completeOnboardingInvite(ctx, accountDb, null, token, { inviteId })).rejects.toMatchObject({
      status: { code: platform.status.Forbidden }
    })
    await expect(
      completeOnboardingInvite(ctx, accountDb, null, token, { inviteId, name: { lastName: 'Last' } })
    ).resolves.toMatchObject({ account, workspace, role: AccountRole.User })
    await expect(getLoginInfoByToken(ctx, accountDb, null, token)).resolves.toMatchObject({
      name: 'First Last',
      onboarding: { intent, stage: 'complete' }
    })
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, workspace, extra: {} })
    expect(await getWorkspaceMembers(ctx, accountDb, null, 'owner-token')).toContainEqual({
      person: account,
      role: AccountRole.User,
      seatOrder: 1
    })
  })

  it('refuses new provider onboarding when the email differs from the named invitation', async () => {
    const address = 'not-the-recipient@example.com'
    const workspace = await accountDb.createWorkspace(
      { name: 'Provider recipient', url: 'provider-recipient', allowGuestSignUp: false, allowReadOnlyGuest: false },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const inviteId = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      email,
      remainingUses: 1,
      role: AccountRole.User
    })
    const provider = { type: SocialIdType.GOOGLE, value: 'provider-wrong-recipient' }
    await expect(
      joinWithProvider(ctx, accountDb, null, address, 'First', 'Last', inviteId, provider, false, true)
    ).rejects.toMatchObject({ status: { code: platform.status.Forbidden } })
    await expect(
      loginOrSignUpWithProvider(ctx, accountDb, null, address, 'First', 'Last', provider)
    ).resolves.toBeNull()
  })

  it('does not auto-join an account before its onboarding is complete', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Auto invite', url: 'auto-onboarding', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const inviteId = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      autoJoin: true,
      email,
      role: AccountRole.Guest
    })
    const client = await dbClient.getClient()
    await client.unsafe(`UPDATE ${dbUuid}.account SET onboarding = $2::jsonb WHERE uuid = $1`, [
      personUuid,
      { intent: { kind: 'workspace' }, stage: 'name' }
    ])
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, extra: {} })

    await expect(checkAutoJoin(ctx, accountDb, null, 'token', { inviteId })).rejects.toThrow(/Forbidden/)
    expect(await accountDb.getWorkspaceRole(personUuid, workspace)).toBeNull()
  })

  it('confirms invitations concurrently without exhausting the account connection pool', async () => {
    const workspace = await accountDb.createWorkspace(
      { name: 'Invite', url: 'parallel-invites', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
    const inviteId = await accountDb.invite.insertOne({
      workspaceUuid: workspace,
      expiresOn: Date.now() + 60000,
      role: AccountRole.User
    })
    const addresses = Array.from({ length: 6 }, (_, index) => `parallel-${index}@example.com`)
    await Promise.all(
      addresses.map(async (address) => await requestEmailOtp(ctx, accountDb, null, '', { email: address }))
    )
    const codes = await Promise.all(
      addresses.map(async (address) => await accountDb.withEmailOtp(address, async (state) => state.code as string))
    )
    const results = await Promise.all(
      addresses.map(
        async (address, index) =>
          await confirmEmailOtp(ctx, accountDb, null, '', {
            email: address,
            code: codes[index],
            intent: { kind: 'invite', inviteId }
          })
      )
    )
    expect(results).toHaveLength(addresses.length)
  })

  it('rejects an expired email OTP without creating an account', async () => {
    const address = 'expired-signup-otp@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => {
      const issued = state.code as string
      state.expiresOn = Date.now() - 1
      return issued
    })
    await expect(confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })).rejects.toThrow()
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
  })

  it('keeps a five-miss lock after the code expires', async () => {
    const address = 'locked-email-otp@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    for (let i = 0; i < 5; i++) {
      await expect(confirmEmailOtp(ctx, accountDb, null, '', { email: address, code: 'wrong' })).rejects.toThrow()
    }
    await accountDb.withEmailOtp(address, async (state) => {
      state.expiresOn = Date.now() - 1
    })
    await expect(requestEmailOtp(ctx, accountDb, null, '', { email: address })).rejects.toMatchObject({
      status: { code: platform.status.TooManyOtpAttempts }
    })
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
  })

  it('rejects a new account when registration is disabled', async () => {
    const address = 'signup-disabled@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    await expect(confirmEmailOtp(ctx, accountDb, null, '', { email: address, code }, false)).rejects.toThrow()
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
  })

  it('does not sign into an account that claimed an unverified email', async () => {
    const address = 'unverified-claim@example.com'
    await accountDb.socialId.insertOne({ type: SocialIdType.EMAIL, value: address, personUuid })
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    const result = await confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })
    expect(result.account).not.toBe(personUuid)
    const claimed = await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })
    expect(claimed?.personUuid).toBe(result.account)
    expect(claimed?.verifiedOn).not.toBeNull()
  })

  it('shares one code between signing in and verifying an extra email', async () => {
    const address = 'verify-extra@example.com'
    await accountDb.socialId.insertOne({ type: SocialIdType.EMAIL, value: address, personUuid })
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid })
    const attempts = await Promise.allSettled([
      confirmEmailOtp(ctx, accountDb, null, '', { email: address, code }),
      validateOtp(ctx, accountDb, null, 'token', { email: address, code, action: 'verify' })
    ])
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
  })

  it('shares the wrong-code limit between sign in and extra email verification', async () => {
    const address = 'verify-limit@example.com'
    await accountDb.socialId.insertOne({ type: SocialIdType.EMAIL, value: address, personUuid })
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid })
    for (let i = 0; i < 2; i++) {
      await expect(
        validateOtp(ctx, accountDb, null, 'token', { email: address, code: 'wrong', action: 'verify' })
      ).rejects.toThrow()
    }
    for (let i = 0; i < 3; i++) {
      await expect(confirmEmailOtp(ctx, accountDb, null, '', { email: address, code: 'wrong' })).rejects.toThrow()
    }
    expect(await accountDb.withEmailOtp(address, async (state) => state.misses)).toBe(5)
    await expect(requestEmailOtp(ctx, accountDb, null, '', { email: address })).rejects.toMatchObject({
      status: { code: platform.status.TooManyOtpAttempts }
    })
  })

  it('shares codes and limits between legacy and email-first methods', async () => {
    const address = 'legacy-email-otp@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    await loginOtp(ctx, accountDb, null, '', { email: address })
    await validateOtp(ctx, accountDb, null, '', { email: address, code: 'wrong' }).catch(() => {})
    expect(await accountDb.withEmailOtp(address, async (state) => state.misses)).toBe(1)
    const result = await confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })
    expect(await accountDb.person.findOne({ uuid: result.account })).toMatchObject({
      firstName: '',
      lastName: ''
    })
  })

  it('does not register an unknown email through the legacy login confirmation', async () => {
    const address = 'legacy-login-only@example.com'
    await loginOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    await expect(validateOtp(ctx, accountDb, null, '', { email: address, code })).rejects.toThrow()
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    await expect(confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })).resolves.toBeDefined()
  })

  it('requires the registration confirmation method even after a legacy signup request', async () => {
    const address = 'legacy-signup-confirmation@example.com'
    await requestEmailOtp(ctx, accountDb, null, '', { email: address })
    const code = await accountDb.withEmailOtp(address, async (state) => state.code as string)
    await expect(validateOtp(ctx, accountDb, null, '', { email: address, code })).rejects.toThrow()
    expect(await accountDb.socialId.findOne({ type: SocialIdType.EMAIL, value: address })).toBeNull()
    await expect(confirmEmailOtp(ctx, accountDb, null, '', { email: address, code })).resolves.toBeDefined()
  })

  it('cleans old email verification data without clearing active locks', async () => {
    const now = Date.now()
    await accountDb.withEmailOtp('expired@example.com', async (state) => {
      state.createdOn = now - 2 * day
      state.expiresOn = now - day
    })
    await accountDb.withEmailOtp('locked@example.com', async (state) => {
      state.createdOn = now - 2 * day
      state.expiresOn = now - day
      state.misses = 5
      state.missedOn = now
    })
    await accountDb.cleanExpiredEmailOtp(now)
    expect(await accountDb.withEmailOtp('expired@example.com', async (state) => state.code)).toBeNull()
    expect(await accountDb.withEmailOtp('locked@example.com', async (state) => state.misses)).toBe(5)
  })

  it('sends a one-time sign-in link after five wrong email codes', async () => {
    setMetadata(accountPlugin.metadata.FrontURL, 'https://example.com')
    await loginOtp(ctx, accountDb, null, '', { email })
    for (let i = 0; i < 5; i++) {
      await expect(validateOtp(ctx, accountDb, null, '', { email, code: 'wrong' })).rejects.toThrow()
    }
    const letter = mailSend.mock.calls.find((call) => (call[2][0].data.text as string).includes('loginLink#token='))
    const token = /loginLink#token=([0-9a-f]{64})/.exec(letter?.[2][0].data.text)?.[1] as string
    expect(token).toBeDefined()
    await expect(loginByLink(ctx, accountDb, null, '', { token })).resolves.toMatchObject({ account: personUuid })
    await expect(loginByLink(ctx, accountDb, null, '', { token })).rejects.toThrow()
  })

  afterAll(async () => {
    if (previousRegionConfig === undefined) delete process.env.REGION_CONFIG_JSON
    else process.env.REGION_CONFIG_JSON = previousRegionConfig
    resetRegionConfig()
    dbClient.close()
    await shutdownPostgres()
  })

  it('the migrations add the columns, a new social id starts with no misses, and a code defaults to a login code', async () => {
    const client = await dbClient.getClient()
    const columns = (await client.unsafe(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = '${dbUuid}' AND column_name IN ('purpose', 'login_otp_misses', 'login_otp_missed_on')`
    )) as Array<{ table_name: string, column_name: string }>
    expect(columns.map((c) => `${c.table_name}.${c.column_name}`).sort()).toEqual([
      'otp.purpose',
      'social_id.login_otp_missed_on',
      'social_id.login_otp_misses'
    ])
    expect(social.loginOtpMisses).toBe(0)
    expect(social.loginOtpMissedOn).toBe(0)

    await client.unsafe(`INSERT INTO ${dbUuid}.otp (social_id, code, expires_on) VALUES ($1, '123456', $2)`, [
      social._id,
      Date.now() + 60000
    ])
    expect((await accountDb.otp.findOne({ code: '123456' }))?.purpose).toBe('login')
  })

  describe('wrong guesses at login codes', () => {
    it('every one counts while the code takes guesses, and stamps the time', async () => {
      await insertCode('login', '111111')
      const before = Date.now()

      await bump('login', '999999')
      const first = await reread()
      expect(first.loginOtpMisses).toBe(1)
      expect(first.loginOtpMissedOn).toBeGreaterThanOrEqual(before)

      // Up to and including the last attempt of the code.
      for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) await bump('login', '999999')
      expect((await reread()).loginOtpMisses).toBe(OTP_MAX_ATTEMPTS)
    })

    it('a guess past the cap of the code counts nothing and leaves the stamp', async () => {
      await insertCode('login', '111111')
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await bump('login', '999999')
      const stamp = (await reread()).loginOtpMissedOn

      for (let i = 0; i < 25; i++) await bump('login', '999999')

      const after = await reread()
      expect(after.loginOtpMisses).toBe(OTP_MAX_ATTEMPTS)
      expect(after.loginOtpMissedOn).toBe(stamp)
      expect(await accountDb.withEmailOtp(email, async (state) => state.attempts)).toBe(OTP_MAX_ATTEMPTS)
    })

    it('the right guess does not count', async () => {
      await insertCode('login', '111111')
      for (let i = 0; i < 4; i++) await bump('login', '999999')

      await bump('login', '111111')

      expect((await reread()).loginOtpMisses).toBe(0)
    })

    it('a guess with no live code counts nothing, and an expired code is not live', async () => {
      await bump('login', '999999')
      await insertCode('login', '222222', Date.now() - 1000)
      await bump('login', '999999')

      expect((await reread()).loginOtpMisses).toBe(0)
    })

    it('a streak whose last miss is older than the decay window starts over', async () => {
      await insertCode('login', '111111')
      await bump('login', '999999')
      await bump('login', '999999')
      expect((await reread()).loginOtpMisses).toBe(2)

      await accountDb.withEmailOtp(email, async (state) => {
        state.missedOn = Date.now() - day - 1000
      })
      await bump('login', '999999')

      expect((await reread()).loginOtpMisses).toBe(1)
    })

    it('after the lock is over one wrong guess starts the streak at 1, not past the cap', async () => {
      await insertCode('login', '111111')
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await bump('login', '999999')
      expect((await reread()).loginOtpMisses).toBe(OTP_MAX_ATTEMPTS)
      await insertCode('login', '222222')
      await letWaitPass()

      await bump('login', '999999')

      expect((await reread()).loginOtpMisses).toBe(1)
    })

    it('parallel wrong guesses are counted up to the cap of the code', async () => {
      await insertCode('login', '111111')

      await Promise.all(
        Array.from({ length: 8 }, async () => {
          await bump('login', '999999')
        })
      )

      expect((await reread()).loginOtpMisses).toBe(OTP_MAX_ATTEMPTS)
      expect(await accountDb.withEmailOtp(email, async (state) => state.attempts)).toBe(OTP_MAX_ATTEMPTS)
    })

    it('wrong guesses at operation codes are not counted, and the codes are consumed apart', async () => {
      await insertCode('login', '111111')
      await insertCode('operation', '222222')

      for (let i = 0; i < 6; i++) await bump('operation', '999999')

      expect(await accountDb.withEmailOtp(email, async (state) => state.attempts)).toBe(0)
      expect((await accountDb.otp.findOne({ code: '222222' }))?.attempts).toBe(6)
      expect((await reread()).loginOtpMisses).toBe(0)

      expect(await accountDb.consumeOtp(social._id, 'operation', '222222')).toBe(true)
      expect(await accountDb.consumeOtp(social._id, 'operation', '222222')).toBe(false)
      await expect(validateOtp(ctx, accountDb, null, '', { email, code: '111111' })).resolves.toBeDefined()
    })
  })

  it('the lock letter stores only the hash of a one-time link, and the link signs in once', async () => {
    setMetadata(accountPlugin.metadata.FrontURL, 'https://front.example.com')
    await insertCode('login', '111111')
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) await bump('login', '999999')
    const before = await reread()
    await bump('login', '999999')

    await notifyLoginLock(ctx, accountDb, null, before)
    await notifyLoginLock(ctx, accountDb, null, before)

    expect(mailSend).toHaveBeenCalledTimes(1)
    const token = /loginLink#token=([0-9a-f]{64})/.exec(mailSend.mock.calls[0][2][0].data.text)?.[1] as string
    const [row] = await accountDb.otp.find({ socialId: social._id, purpose: 'login-link' })
    expect(row.code).not.toBe(token)
    expect(row.expiresOn - row.createdOn).toBe(60 * 60 * 1000)
    expect(await isOtpValid(accountDb, social._id, row.code)).toBe(false)

    expect((await consumeLoginLink(accountDb, token))?._id).toBe(social._id)
    expect(await consumeLoginLink(accountDb, token)).toBeUndefined()
    expect(await consumeLoginLink(accountDb, 'ab'.repeat(32))).toBeUndefined()
  })

  it('loginOtp refuses with the time left while wrong guesses hold the wait, then lets the next code through', async () => {
    jest
      .spyOn(crypto, 'randomInt')
      .mockImplementationOnce(() => 111111)
      .mockImplementation(() => 222222)
    await loginOtp(ctx, accountDb, null, '', { email })
    const code = await accountDb.withEmailOtp(email, async (state) => state.code as string)
    for (let i = 0; i < 5; i++) {
      await expect(
        validateOtp(ctx, accountDb, null, '', {
          email,
          code: code === '000000' ? '000001' : '000000'
        })
      ).rejects.toThrow()
    }
    const missed = await reread()
    expect(missed.loginOtpMisses).toBe(5)
    expect(typeof missed.loginOtpMissedOn).toBe('number')

    const refused = await loginOtp(ctx, accountDb, null, '', { email }).then(
      () => undefined,
      (err) => err
    )
    expect(refused).toBeInstanceOf(PlatformError)
    expect(refused.status.code).toBe(platform.status.TooManyOtpAttempts)
    expect(refused.status.params).toEqual({
      retryOn: (missed.loginOtpMissedOn as number) + 60 * 60 * 1000,
      minutes: 60
    })
    expect(await accountDb.withEmailOtp(email, async (state) => state.code)).toBe(code)

    await letWaitPass()
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await loginOtp(ctx, accountDb, null, '', { email })
    const state = await accountDb.withEmailOtp(email, async (state) => ({ ...state }))
    expect(state.code).not.toBe(code)
    expect(state.attempts).toBe(0)
  })

  describe('parallel loginOtp', () => {
    const issueTogether = async (count: number): Promise<Array<{ sent: boolean }>> =>
      await Promise.all(Array.from({ length: count }, async () => await loginOtp(ctx, accountDb, null, '', { email })))

    it('requests that pass the check together issue one code between them', async () => {
      // Open the connections first: on a cold pool the first request is done before the others start.
      await Promise.all(Array.from({ length: 10 }, async () => await accountDb.socialId.find({ _id: social._id })))

      const results = await issueTogether(8)

      expect(mailSend).toHaveBeenCalledTimes(1)
      expect(await accountDb.withEmailOtp(email, async (state) => state.code)).not.toBeNull()
      expect(results.every((r) => r.sent)).toBe(true)
    })

    it('at the end of a wait held by wrong guesses too, and the new code keeps its full budget', async () => {
      jest
        .spyOn(crypto, 'randomInt')
        .mockImplementationOnce(() => 111111)
        .mockImplementation(() => 222222)
      await loginOtp(ctx, accountDb, null, '', { email })
      const code = await accountDb.withEmailOtp(email, async (state) => state.code as string)
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        await expect(
          validateOtp(ctx, accountDb, null, '', {
            email,
            code: code === '000000' ? '000001' : '000000'
          })
        ).rejects.toThrow()
      }
      await letWaitPass()
      await new Promise((resolve) => setTimeout(resolve, 1100))
      mailSend.mockClear()

      await issueTogether(8)

      expect(mailSend).toHaveBeenCalledTimes(1)
      const state = await accountDb.withEmailOtp(email, async (state) => ({ ...state }))
      expect(state.code).not.toBe(code)
      expect(state.attempts).toBe(0)
    })

    it('the two purposes of one social id issue side by side', async () => {
      await Promise.all([
        loginOtp(ctx, accountDb, null, '', { email }),
        sendOtp(ctx, accountDb, null, social, 300, 'operation')
      ])

      expect(mailSend).toHaveBeenCalledTimes(2)
      const rows = await accountDb.otp.find({ socialId: social._id })
      expect(rows.map((r) => r.purpose)).toEqual(['operation'])
      expect(await accountDb.withEmailOtp(email, async (state) => state.code)).not.toBeNull()
    })

    // With no retry delay every request replaces the code; guesses and issues must still complete.
    it('guesses and issues for one social id run side by side without deadlocking', async () => {
      setMetadata(accountPlugin.metadata.OtpRetryDelaySec, 0)
      await sendOtp(ctx, accountDb, null, social)

      for (let round = 0; round < 15; round++) {
        await Promise.all([
          ...Array.from({ length: 6 }, async () => {
            await accountDb.bumpOtpAttempts(social._id)
          }),
          ...Array.from({ length: 6 }, async () => {
            await sendOtp(ctx, accountDb, null, social).catch((err) => {
              if (!(err instanceof PlatformError)) throw err
            })
          })
        ])
      }

      expect((await accountDb.otp.find({ socialId: social._id, purpose: 'operation' })).length).toBeLessThanOrEqual(1)
    })
  })

  describe('a confirmed sign in clears the misses of every email of the account', () => {
    beforeEach(plantMisses)

    const reset = [
      [0, 0],
      [0, 0]
    ]

    it.each([
      [
        'a right code',
        async () => {
          await accountDb.withEmailOtp(email, async (state) => {
            state.code = '111111'
            state.createdOn = Date.now()
            state.expiresOn = Date.now() + 60000
          })
          await validateOtp(ctx, accountDb, null, 'token', { email, code: '111111' })
          expect(await accountDb.withEmailOtp(email, async (state) => state.code)).toBeNull()
        }
      ],
      [
        'a right password',
        async () => {
          await setPassword(ctx, accountDb, null, personUuid, 'a-good-password')
          await login(ctx, accountDb, null, 'token', { email, password: 'a-good-password' })
        }
      ],
      [
        'a provider',
        async () => {
          await loginOrSignUpWithProvider(ctx, accountDb, null, email, 'Otp', 'Real', {
            type: SocialIdType.GOOGLE,
            value: 'google-otp-real'
          })
        }
      ]
    ])('by %s', async (_name, signIn) => {
      await signIn()

      expect(await counters()).toEqual(reset)
    })

    it.each([
      [
        'a wrong code',
        async () => {
          await accountDb.withEmailOtp(email, async (state) => {
            state.code = '111111'
            state.createdOn = Date.now()
            state.expiresOn = Date.now() + 60000
          })
          await validateOtp(ctx, accountDb, null, 'token', { email, code: '999999' })
        },
        [8, 7]
      ],
      [
        'a wrong password',
        async () => {
          await setPassword(ctx, accountDb, null, personUuid, 'a-good-password')
          await login(ctx, accountDb, null, 'token', { email, password: 'a-bad-password' })
        },
        [7, 7]
      ]
    ])('not by %s', async (_name, signIn, misses) => {
      await expect(signIn()).rejects.toThrow()

      expect(await counters()).toEqual(misses.map((count) => [count, 'stamped']))
    })

    it('by a password restored from the emailed link, even when the password login was locked', async () => {
      await setPassword(ctx, accountDb, null, personUuid, 'an-old-password')
      for (let i = 0; i < 5; i++) {
        await expect(login(ctx, accountDb, null, 'token', { email, password: 'a-bad-password' })).rejects.toThrow()
      }
      await expect(login(ctx, accountDb, null, 'token', { email, password: 'an-old-password' })).rejects.toMatchObject({
        status: { code: platform.status.PasswordLoginLocked }
      })
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, extra: { restoreEmail: email } })

      await restorePassword(ctx, accountDb, null, 'link', { password: 'a-new-password' })

      expect(await counters()).toEqual(reset)
      expect((await accountDb.account.findOne({ uuid: personUuid }))?.failedLoginAttempts).toBe(0)
      await expect(login(ctx, accountDb, null, 'token', { email, password: 'a-new-password' })).resolves.toMatchObject({
        account: personUuid
      })
    })
  })
})
