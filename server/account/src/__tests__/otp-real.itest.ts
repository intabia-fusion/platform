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

import { generateUuid, SocialIdType, type AccountUuid, type MeasureContext, type PersonUuid } from '@hcengineering/core'
import platform, { PlatformError, setMetadata } from '@hcengineering/platform'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { decodeTokenVerbose } from '@hcengineering/server-token'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { login, restorePassword, validateOtp } from '../operations'
import { accountPlugin } from '../plugin'
import { type SocialId } from '../types'
import {
  consumeLoginLink,
  createAccount,
  isOtpValid,
  loginOrSignUpWithProvider,
  notifyLoginLock,
  OTP_MAX_ATTEMPTS,
  sendOtp,
  setPassword
} from '../utils'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

jest.setTimeout(90000)

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

  const insertCode = async (purpose: 'login' | 'operation', code: string, expiresOn?: number): Promise<void> => {
    await accountDb.otp.insertOne({
      socialId: social._id,
      purpose,
      code,
      expiresOn: expiresOn ?? Date.now() + 600 * 1000,
      createdOn: Date.now()
    })
  }
  const bump = async (purpose: 'login' | 'operation', guess: string, decayMs = day): Promise<void> => {
    await accountDb.bumpOtpAttempts(social._id, purpose, guess, OTP_MAX_ATTEMPTS, decayMs)
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
    await accountDb.socialId.update({ personUuid }, { loginOtpMissedOn: Date.now() - 60 * 60 * 1000 - 1000 })
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
  })

  beforeEach(async () => {
    mailSend.mockClear()
    setMetadata(accountPlugin.metadata.OtpRetryDelaySec, 1)
    await clearTables(dbClient, dbUuid, [
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

  afterAll(async () => {
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
      expect((await accountDb.otp.findOne({ code: '111111' }))?.attempts).toBe(OTP_MAX_ATTEMPTS + 25)
    })

    it('the right guess does not count', async () => {
      await insertCode('login', '111111')
      for (let i = 0; i < 4; i++) await bump('login', '999999')

      await bump('login', '111111')

      expect((await reread()).loginOtpMisses).toBe(4)
    })

    it('a guess with no live code counts nothing, and an expired code is not live', async () => {
      await bump('login', '999999')
      await insertCode('login', '222222', Date.now() - 1000)
      await bump('login', '999999')

      expect((await reread()).loginOtpMisses).toBe(0)
    })

    it('a streak whose last miss is older than the decay window starts over', async () => {
      await insertCode('login', '111111')
      await bump('login', '999999', 500)
      await bump('login', '999999', 500)
      expect((await reread()).loginOtpMisses).toBe(2)

      await new Promise((resolve) => setTimeout(resolve, 700))
      await bump('login', '999999', 500)

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
      expect((await accountDb.otp.findOne({ code: '111111' }))?.attempts).toBe(8)
    })

    it('wrong guesses at operation codes are not counted, and the codes are consumed apart', async () => {
      await insertCode('login', '111111')
      await insertCode('operation', '222222')

      for (let i = 0; i < 6; i++) await bump('operation', '999999')

      expect((await accountDb.otp.findOne({ code: '111111' }))?.attempts).toBe(0)
      expect((await accountDb.otp.findOne({ code: '222222' }))?.attempts).toBe(6)
      expect((await reread()).loginOtpMisses).toBe(0)

      expect(await accountDb.consumeOtp(social._id, 'login', '222222')).toBe(false)
      expect(await accountDb.consumeOtp(social._id, 'operation', '222222')).toBe(true)
      expect(await accountDb.consumeOtp(social._id, 'operation', '222222')).toBe(false)
      expect(await accountDb.consumeOtp(social._id, 'login', '111111')).toBe(true)
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
    expect(await isOtpValid(accountDb, social._id, row.code, 'login')).toBe(false)

    expect((await consumeLoginLink(accountDb, token))?._id).toBe(social._id)
    expect(await consumeLoginLink(accountDb, token)).toBeUndefined()
    expect(await consumeLoginLink(accountDb, 'ab'.repeat(32))).toBeUndefined()
  })

  it('sendOtp refuses with the time left while wrong guesses hold the wait, then lets the next code through', async () => {
    await sendOtp(ctx, accountDb, null, social)
    const code = (await accountDb.otp.findOne({ socialId: social._id, purpose: 'login' }))?.code as string
    for (let i = 0; i < 5; i++) {
      expect(await isOtpValid(accountDb, social._id, code === '000000' ? '000001' : '000000', 'login')).toBe(false)
    }
    const missed = await reread()
    expect(missed.loginOtpMisses).toBe(5)
    expect(typeof missed.loginOtpMissedOn).toBe('number')

    const refused = await sendOtp(ctx, accountDb, null, missed).then(
      () => undefined,
      (err) => err
    )
    expect(refused).toBeInstanceOf(PlatformError)
    expect(refused.status.code).toBe(platform.status.TooManyOtpAttempts)
    expect(refused.status.params).toEqual({
      retryOn: (missed.loginOtpMissedOn as number) + 60 * 60 * 1000,
      minutes: 60
    })
    expect((await accountDb.otp.find({ socialId: social._id, purpose: 'login' })).map((o) => o.code)).toEqual([code])

    await letWaitPass()
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await sendOtp(ctx, accountDb, null, await reread())
    const rows = await accountDb.otp.find({ socialId: social._id, purpose: 'login' })
    expect(rows).toHaveLength(1)
    expect(rows[0].code).not.toBe(code)
    expect(rows[0].attempts).toBe(0)
  })

  describe('parallel sendOtp', () => {
    const issueTogether = async (count: number): Promise<Array<{ sent: boolean }>> =>
      await Promise.all(Array.from({ length: count }, async () => await sendOtp(ctx, accountDb, null, social)))

    it('requests that pass the check together issue one code between them', async () => {
      // Open the connections first: on a cold pool the first request is done before the others start.
      await Promise.all(Array.from({ length: 10 }, async () => await accountDb.socialId.find({ _id: social._id })))

      const results = await issueTogether(8)

      expect(mailSend).toHaveBeenCalledTimes(1)
      expect(await accountDb.otp.find({ socialId: social._id, purpose: 'login' })).toHaveLength(1)
      expect(results.every((r) => r.sent)).toBe(true)
    })

    it('at the end of a wait held by wrong guesses too, and the new code keeps its full budget', async () => {
      await sendOtp(ctx, accountDb, null, social)
      const code = (await accountDb.otp.findOne({ socialId: social._id, purpose: 'login' }))?.code as string
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        await isOtpValid(accountDb, social._id, code === '000000' ? '000001' : '000000', 'login')
      }
      await letWaitPass()
      await new Promise((resolve) => setTimeout(resolve, 1100))
      mailSend.mockClear()

      await issueTogether(8)

      expect(mailSend).toHaveBeenCalledTimes(1)
      const rows = await accountDb.otp.find({ socialId: social._id, purpose: 'login' })
      expect(rows).toHaveLength(1)
      expect(rows[0].code).not.toBe(code)
      expect(rows[0].attempts).toBe(0)
    })

    it('the two purposes of one social id issue side by side', async () => {
      await Promise.all([
        sendOtp(ctx, accountDb, null, social),
        sendOtp(ctx, accountDb, null, social, 300, 'operation')
      ])

      expect(mailSend).toHaveBeenCalledTimes(2)
      const rows = await accountDb.otp.find({ socialId: social._id })
      expect(rows.map((r) => r.purpose).sort()).toEqual(['login', 'operation'])
    })

    // Guesses and issues both lock the social id before its codes, so neither waits on the other
    // while holding what it needs. With no retry delay every request replaces the code.
    it('guesses and issues for one social id run side by side without deadlocking', async () => {
      setMetadata(accountPlugin.metadata.OtpRetryDelaySec, 0)
      await sendOtp(ctx, accountDb, null, social)

      for (let round = 0; round < 15; round++) {
        await Promise.all([
          ...Array.from({ length: 6 }, async () => {
            await accountDb.bumpOtpAttempts(social._id, 'login', '999999', OTP_MAX_ATTEMPTS, day)
          }),
          ...Array.from({ length: 6 }, async () => {
            await sendOtp(ctx, accountDb, null, social).catch((err) => {
              if (!(err instanceof PlatformError)) throw err
            })
          })
        ])
      }

      expect((await accountDb.otp.find({ socialId: social._id, purpose: 'login' })).length).toBeLessThanOrEqual(1)
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
          await insertCode('login', '111111')
          await validateOtp(ctx, accountDb, null, 'token', { email, code: '111111' })
          expect(await accountDb.otp.findOne({ code: '111111' })).toBeNull()
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
          await insertCode('login', '111111')
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
