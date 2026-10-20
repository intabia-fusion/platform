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

import {
  AccountRole,
  type AccountUuid,
  type MeasureContext,
  type PersonId,
  type PersonUuid,
  SocialIdType,
  systemAccountUuid
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status, getMetadata } from '@hcengineering/platform'
import { decodeToken, decodeTokenVerbose, generateToken } from '@hcengineering/server-token'

import {
  checkAutoJoin,
  createApiKey,
  ensurePerson,
  getMethods,
  login,
  loginOtp,
  loginWithApiKey,
  requestPasswordReset,
  restorePassword,
  signUp,
  signUpJoin,
  signUpOtp,
  validateOtp
} from '../operations'
import { accountPlugin } from '../plugin'
import { type AccountDB, type SocialId, type WorkspaceJoinInfo } from '../types'
import * as utils from '../utils'

jest.mock('@hcengineering/platform', () => {
  const actual = jest.requireActual('@hcengineering/platform')
  return {
    ...actual,
    ...actual.default,
    getMetadata: jest.fn(),
    translate: jest.fn((id, params) => `${id} << ${JSON.stringify(params)}`)
  }
})

jest.mock('@hcengineering/server-token', () => ({
  ...jest.requireActual('@hcengineering/server-token'),
  decodeToken: jest.fn(),
  decodeTokenVerbose: jest.fn(),
  generateToken: jest.fn(() => 'new-token')
}))

const botEmail = 'huly.ai.bot@hc.engineering'
const userEmail = 'user@example.com'
const personUuid = 'person-uuid' as PersonUuid
const accountUuid = personUuid as unknown as AccountUuid
const forbidden = new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))

function emailSocialId (value: string): SocialId {
  return {
    _id: 'social-id' as PersonId,
    personUuid,
    type: SocialIdType.EMAIL,
    value,
    key: `email:${value}`,
    verifiedOn: Date.now()
  }
}

const ctx = { error: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as MeasureContext
const db = {
  account: { findOne: jest.fn(), update: jest.fn() },
  person: { findOne: jest.fn(), insertOne: jest.fn(), update: jest.fn() },
  socialId: { findOne: jest.fn(), insertOne: jest.fn(), update: jest.fn() },
  otp: { deleteMany: jest.fn() },
  mailbox: { findOne: jest.fn(), find: jest.fn(), insertOne: jest.fn() },
  mailboxSecret: { insertOne: jest.fn() },
  shortLink: { deleteMany: jest.fn() },
  workspace: { findOne: jest.fn() },
  integrationSecret: { findOne: jest.fn(), update: jest.fn() },
  ensurePerson: jest.fn(),
  getWorkspaceRole: jest.fn()
} as unknown as AccountDB

// The row getEmailSocialId finds, whichever email is asked for.
function storedEmail (value: string): void {
  ;(db.socialId.findOne as jest.Mock).mockResolvedValue(emailSocialId(value))
}

// Metadata the account reads: the dev-stand switch of password sign up and the front url.
function setMetadata (allowPasswordSignUp?: boolean): void {
  ;(getMetadata as jest.Mock).mockImplementation((key) => {
    if (key === accountPlugin.metadata.AllowSkipOtpPasswordSignUp) return allowPasswordSignUp
    if (key === accountPlugin.metadata.FrontURL) return 'http://front'
    return undefined
  })
}

describe('ai-bot sign in', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.account.findOne as jest.Mock).mockResolvedValue({ uuid: accountUuid, hash: 'hash', salt: 'salt' })
    ;(db.person.findOne as jest.Mock).mockResolvedValue({ uuid: personUuid, firstName: 'Julia', lastName: 'AI' })
    jest.spyOn(utils, 'verifyPassword').mockReturnValue(true)
    jest.spyOn(utils, 'isOtpValid').mockResolvedValue(true)
    jest.spyOn(utils, 'sendOtp').mockResolvedValue({ sent: true, retryOn: Date.now() + 60000 })
    jest.spyOn(utils, 'confirmHulyIds').mockResolvedValue()
  })

  describe('sign in', () => {
    test.each([
      [
        'password',
        async () => {
          storedEmail(botEmail)
          await login(ctx, db, null, 'token', { email: botEmail, password: 'password' })
        }
      ],
      [
        'password with the email in another case',
        async () => {
          storedEmail(botEmail)
          await login(ctx, db, null, 'token', { email: ' Huly.AI.Bot@HC.engineering ', password: 'p' })
        }
      ],
      [
        'code request',
        async () => {
          storedEmail(botEmail)
          await loginOtp(ctx, db, null, 'token', { email: botEmail })
        }
      ],
      [
        'code request through sign up',
        async () => {
          ;(db.socialId.findOne as jest.Mock).mockResolvedValue(null)
          await signUpOtp(ctx, db, null, 'token', { email: botEmail, firstName: 'Attacker' })
        }
      ],
      [
        'code check',
        async () => {
          storedEmail(botEmail)
          await validateOtp(ctx, db, null, 'token', { email: botEmail, code: '123456' })
        }
      ],
      [
        'identity provider',
        async () => {
          await utils.loginOrSignUpWithProvider(ctx, db, null, botEmail, 'Julia', 'AI', {
            type: SocialIdType.GOOGLE,
            value: 'google-id'
          })
        }
      ]
    ])('%s is refused for the bot: no token, no code, no person', async (_name, enter) => {
      await expect(enter()).rejects.toThrow(forbidden)

      expect(generateToken).not.toHaveBeenCalled()
      expect(utils.sendOtp).not.toHaveBeenCalled()
      expect(db.otp.deleteMany).not.toHaveBeenCalled()
      expect(db.person.insertOne).not.toHaveBeenCalled()
    })

    test('still works for a regular user', async () => {
      storedEmail(userEmail)

      const result = await login(ctx, db, null, 'token', { email: userEmail, password: 'password' })
      await loginOtp(ctx, db, null, 'token', { email: userEmail })

      expect(result.token).toBe('new-token')
      expect(utils.sendOtp).toHaveBeenCalled()
    })
  })

  describe('registration', () => {
    const joinParams = { email: botEmail, password: 'known', first: 'Attacker', inviteId: 'invite', workspaceUrl: '' }

    beforeEach(() => {
      setMetadata(true)
      ;(decodeToken as jest.Mock).mockReturnValue({ account: 'someone' as AccountUuid, extra: {} })
      jest.spyOn(utils, 'signUpByEmail').mockResolvedValue({ account: accountUuid, socialId: 'social-id' as PersonId })
      jest.spyOn(utils, 'confirmEmail').mockResolvedValue('social-id' as PersonId)
      jest.spyOn(utils, 'getWorkspaceJoinInfo').mockResolvedValue({ email: botEmail } as unknown as WorkspaceJoinInfo)
    })

    test('sign up with the bot email is refused without the system token', async () => {
      await expect(
        signUp(ctx, db, null, 'user-token', { email: botEmail, password: 'known', firstName: 'Attacker' })
      ).rejects.toThrow(forbidden)
      expect(utils.signUpByEmail).not.toHaveBeenCalled()
    })

    test('sign up and join with the bot email is refused without the system token', async () => {
      await expect(signUpJoin(ctx, db, null, 'user-token', joinParams)).rejects.toThrow(forbidden)
      expect(utils.signUpByEmail).not.toHaveBeenCalled()
    })

    test('sign up and join with the system token passes the gate', async () => {
      ;(decodeToken as jest.Mock).mockReturnValue({ account: systemAccountUuid, extra: { service: 'aibot' } })
      jest.spyOn(utils, 'setTimezone').mockResolvedValue()
      jest.spyOn(utils, 'doJoinByInvite').mockResolvedValue({} as any)

      await signUpJoin(ctx, db, null, 'system-token', joinParams)

      expect(utils.signUpByEmail).toHaveBeenCalled()
    })
  })

  describe('password reset', () => {
    beforeEach(() => {
      setMetadata()
      storedEmail(botEmail)
    })

    test('link is not sent for the bot email', async () => {
      await expect(requestPasswordReset(ctx, db, null, 'token', { email: botEmail })).rejects.toThrow(forbidden)
      expect(generateToken).not.toHaveBeenCalled()
    })

    test('link of the bot email does not change its password', async () => {
      jest.spyOn(utils, 'setPassword').mockResolvedValue()
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: accountUuid, extra: { restoreEmail: botEmail } })

      await expect(restorePassword(ctx, db, null, 'link', { password: 'known' })).rejects.toThrow(forbidden)
      expect(utils.setPassword).not.toHaveBeenCalled()
    })
  })

  // Whoever holds the bot email at its first start becomes the bot: nobody may place it.
  describe('claiming the bot email', () => {
    const ensureBotPerson = { socialType: SocialIdType.EMAIL, socialValue: botEmail, firstName: 'X', lastName: '' }

    beforeEach(() => {
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: accountUuid, workspace: 'ws-uuid', extra: {} })
      ;(db.getWorkspaceRole as jest.Mock).mockResolvedValue(AccountRole.Owner)
      ;(db.ensurePerson as jest.Mock).mockResolvedValue({ uuid: personUuid, socialId: 'social-id' })
    })

    test('a user cannot attach it to their account', async () => {
      ;(db.socialId.findOne as jest.Mock).mockResolvedValue(null)

      const response = await getMethods().addEmailSocialId?.(ctx, db, null, { id: 1, params: { email: botEmail } }, 't')

      expect(response?.error?.code).toBe(platform.status.Forbidden)
      expect(db.socialId.insertOne).not.toHaveBeenCalled()
      expect(utils.sendOtp).not.toHaveBeenCalled()
    })

    describe('as a mailbox', () => {
      const createMailbox = async (name: string): Promise<any> =>
        await getMethods().createMailbox?.(ctx, db, null, { id: 1, params: { name, domain: 'hc.engineering' } }, 't')

      beforeEach(() => {
        process.env.MAILBOX_DOMAINS = 'hc.engineering'
        ;(db.mailbox.findOne as jest.Mock).mockResolvedValue(null)
        ;(db.mailbox.find as jest.Mock).mockResolvedValue([])
        jest.spyOn(utils, 'addSocialIdBase').mockResolvedValue('mailbox-social-id' as PersonId)
      })

      afterEach(() => {
        delete process.env.MAILBOX_DOMAINS
      })

      test.each(['huly.ai.bot', 'Huly.AI.Bot'])(
        'a user cannot create %s: no rows, no confirmed email social id',
        async (name) => {
          const response = await createMailbox(name)

          expect(response?.error?.code).toBe(platform.status.Forbidden)
          expect(db.mailbox.insertOne).not.toHaveBeenCalled()
          expect(db.mailboxSecret.insertOne).not.toHaveBeenCalled()
          expect(utils.addSocialIdBase).not.toHaveBeenCalled()
        }
      )

      test('another name in the same domain is created', async () => {
        const response = await createMailbox('someone.else')

        expect(response?.result).toEqual({ mailbox: 'someone.else@hc.engineering', socialId: 'mailbox-social-id' })
        expect(db.mailbox.insertOne).toHaveBeenCalledTimes(1)
        expect(db.mailboxSecret.insertOne).toHaveBeenCalledTimes(1)
      })
    })

    test('a user cannot create a person holding it', async () => {
      await expect(ensurePerson(ctx, db, null, 'user-token', ensureBotPerson)).rejects.toThrow(forbidden)
      expect(db.ensurePerson).not.toHaveBeenCalled()
    })

    test('a service token and other social id types are not held back', async () => {
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: systemAccountUuid, extra: { service: 'mail' } })
      await ensurePerson(ctx, db, null, 'service-token', ensureBotPerson)
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: accountUuid, workspace: 'ws-uuid', extra: {} })
      await ensurePerson(ctx, db, null, 'user-token', { ...ensureBotPerson, socialType: SocialIdType.GITHUB })

      expect(db.ensurePerson).toHaveBeenCalledTimes(2)
    })

    test('an auto-join invite does not create an account for it', async () => {
      const invite = { autoJoin: true, role: AccountRole.Guest, email: botEmail, workspaceUuid: 'ws-uuid' }
      jest.spyOn(utils, 'getWorkspaceInvite').mockResolvedValue(invite as any)
      jest.spyOn(utils, 'getWorkspaceById').mockResolvedValue({ uuid: 'ws-uuid', url: 'ws' } as any)
      jest.spyOn(utils, 'signUpByEmail')
      ;(db.socialId.findOne as jest.Mock).mockResolvedValue(null)

      await expect(checkAutoJoin(ctx, db, null, 't', { inviteId: 'invite', firstName: 'Guest' })).rejects.toThrow(
        forbidden
      )
      expect(utils.signUpByEmail).not.toHaveBeenCalled()
    })
  })

  // A key or token made under the bot account before sign in was closed must not outlive the fix.
  describe('api keys of the bot account', () => {
    const secret = { keyId: 'k1', name: 'k', masked: '***', ops: [], spaces: [], createdOn: 1, createdBy: accountUuid }

    // The key's own social id sits on keyOwner; the bot email row sits on the bot person.
    function keyOf (keyOwner: PersonUuid): void {
      const row = {
        socialId: 'key-social',
        kind: 'webhook',
        workspaceUuid: 'ws-uuid',
        key: 'h',
        secret: JSON.stringify(secret)
      }
      ;(db.integrationSecret.findOne as jest.Mock).mockResolvedValue(row)
      ;(db.socialId.findOne as jest.Mock).mockImplementation(async (query: any) =>
        query._id === 'key-social' ? { _id: 'key-social', personUuid: keyOwner } : emailSocialId(botEmail)
      )
      jest.spyOn(utils, 'selectWorkspace').mockResolvedValue({ token: 'final' } as any)
    }

    test('a key made under the bot gives no token', async () => {
      keyOf(personUuid)

      await expect(loginWithApiKey(ctx, db, null, 't', { key: 'any' })).rejects.toThrow(forbidden)
      expect(utils.selectWorkspace).not.toHaveBeenCalled()
    })

    test('a key of another person still gives its token', async () => {
      keyOf('other-person' as PersonUuid)

      await loginWithApiKey(ctx, db, null, 't', { key: 'any' })

      expect(utils.selectWorkspace).toHaveBeenCalled()
    })

    test('the bot account cannot create a key', async () => {
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: accountUuid, workspace: 'ws-uuid', extra: {} })
      ;(db.getWorkspaceRole as jest.Mock).mockResolvedValue(AccountRole.User)
      storedEmail(botEmail)

      await expect(
        createApiKey(ctx, db, null, 't', { name: 'k', ops: [], personal: true, unrestricted: true })
      ).rejects.toThrow(forbidden)
      expect(db.workspace.findOne).not.toHaveBeenCalled()
    })
  })

  // The bot itself registers with service tokens; this must stay open.
  describe('bot bootstrap', () => {
    test.each([undefined, true])('sign up with the system token still works (password sign up %s)', async (allowed) => {
      jest.spyOn(utils, 'signUpByEmail').mockResolvedValue({ account: accountUuid, socialId: 'social-id' as PersonId })
      jest.spyOn(utils, 'confirmEmail').mockResolvedValue('social-id' as PersonId)
      setMetadata(allowed)
      ;(decodeToken as jest.Mock).mockReturnValue({ account: systemAccountUuid, extra: { service: 'aibot' } })

      const result = await signUp(ctx, db, null, 'system-token', {
        email: botEmail,
        password: 'random',
        firstName: 'Julia',
        lastName: 'AI'
      })

      expect(result.account).toBe(accountUuid)
      expect(utils.confirmEmail).toHaveBeenCalledWith(ctx, db, accountUuid, botEmail)
    })
  })
})
