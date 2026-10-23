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

import { type MeasureContext, type PersonId, type PersonUuid, SocialIdType } from '@hcengineering/core'
import platform, { getMetadata, PlatformError, Severity, Status } from '@hcengineering/platform'
import { decodeTokenVerbose, generateToken } from '@hcengineering/server-token'

import { login, loginByLink, loginOtp, requestPasswordReset, restorePassword, validateOtp } from '../operations'
import { accountPlugin } from '../plugin'
import { type AccountDB, type OTP, type OtpIssue, type OtpPurpose, type SocialId } from '../types'
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
  TokenError: jest.requireActual('@hcengineering/server-token').TokenError,
  isHumanAdmin: jest.requireActual('@hcengineering/server-token').isHumanAdmin,
  hasAdminSession: jest.requireActual('@hcengineering/server-token').hasAdminSession,
  ADMIN_SESSION_TTL_SEC: jest.requireActual('@hcengineering/server-token').ADMIN_SESSION_TTL_SEC,
  decodeTokenVerbose: jest.fn(),
  decodeToken: jest.fn(),
  generateToken: jest.fn()
}))

const invalidOtp = new PlatformError(new Status(Severity.ERROR, platform.status.InvalidOtp, {}))

const personUuid = 'person-uuid' as PersonUuid
const email = 'victim@example.com'
const sidTemplate: SocialId = {
  _id: 'social-id' as PersonId,
  personUuid,
  type: SocialIdType.EMAIL,
  value: email,
  key: `email:${email}`,
  verifiedOn: 1
}

// The otp table in memory. Every method body runs without awaiting inside, so like the one
// UPDATE ... RETURNING in postgres a call is atomic: parallel guesses get distinct counters.
function createFakeDb (): { db: AccountDB, rows: OTP[], social: SocialId, other: SocialId, account: any } {
  const rows: OTP[] = []
  const account: any = { uuid: personUuid, failedLoginAttempts: 0 }
  // Issues queue like the row lock of the social id in postgres.
  let issuing: Promise<unknown> = Promise.resolve()
  // The social id rows carry the count of wrong guesses at login codes; one person has both emails.
  const social: SocialId = { ...sidTemplate }
  const other: SocialId = {
    ...sidTemplate,
    _id: 'other-social-id' as PersonId,
    value: 'other@example.com',
    key: 'email:other@example.com'
  }
  const matches = (row: any, query: Record<string, any>): boolean =>
    Object.entries(query).every(([key, value]) =>
      value !== null && typeof value === 'object' && '$gt' in value ? row[key] > value.$gt : row[key] === value
    )

  const db = {
    otp: {
      find: async (query: Partial<OTP>, _sort?: unknown, limit?: number) =>
        rows
          .filter((r) => matches(r, query))
          .sort((a, b) => b.createdOn - a.createdOn)
          .slice(0, limit),
      findOne: async (query: Partial<OTP>) => rows.find((r) => matches(r, query)) ?? null,
      insertOne: async (row: Omit<OTP, 'attempts'>) => {
        rows.push({ ...row, attempts: 0 })
      },
      deleteMany: async (query: Partial<OTP>) => {
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i], query)) rows.splice(i, 1)
        }
      }
    },
    bumpOtpAttempts: async (
      socialId: PersonId,
      purpose: OtpPurpose,
      guess: string,
      maxAttempts: number,
      miss: { decayMs: number, lockMs: number }
    ) => {
      const live = rows.filter((r) => r.socialId === socialId && r.purpose === purpose && r.expiresOn > Date.now())
      live.forEach((r) => {
        r.attempts += 1
      })
      // Same rule as postgres: a wrong guess at a login code that still takes guesses is a miss, and a
      // streak whose last miss is older than decayMs, or whose lock is over, starts over.
      const open = live.filter((r) => r.attempts <= maxAttempts)
      if (purpose === 'login' && open.length > 0 && open.every((r) => r.code !== guess)) {
        const misses = social.loginOtpMisses ?? 0
        const missedOn = social.loginOtpMissedOn ?? 0
        const streak =
          missedOn >= Date.now() - miss.decayMs && !(misses >= maxAttempts && missedOn < Date.now() - miss.lockMs)
        social.loginOtpMisses = streak ? (social.loginOtpMisses ?? 0) + 1 : 1
        social.loginOtpMissedOn = Date.now()
      }
      return live.map((r) => ({ ...r }))
    },
    withOtpIssue: async (socialId: PersonId, purpose: OtpPurpose, fn: (issue: OtpIssue) => Promise<unknown>) => {
      const run = issuing.then(async () => {
        const newest = rows
          .filter((r) => r.socialId === socialId && r.purpose === purpose)
          .sort((a, b) => b.createdOn - a.createdOn)[0]
        const row = [social, other].find((r) => r._id === socialId) as SocialId
        return await fn({
          socialId: { ...row },
          newest: newest === undefined ? undefined : { ...newest },
          replace: async (otp) => {
            for (let i = rows.length - 1; i >= 0; i--) {
              if (rows[i].socialId === socialId && rows[i].purpose === purpose) rows.splice(i, 1)
            }
            rows.push({ ...otp, attempts: 0 })
          }
        })
      })
      issuing = run.catch(() => undefined)
      return await run
    },
    consumeOtp: async (socialId: PersonId, purpose: OtpPurpose, code: string) => {
      const idx = rows.findIndex(
        (r) => r.socialId === socialId && r.purpose === purpose && r.code === code && r.expiresOn > Date.now()
      )
      if (idx < 0) return false
      rows.splice(idx, 1)
      return true
    },
    socialId: {
      find: async (query: Record<string, any>) => [social, other].filter((r) => matches(r, query)),
      findOne: async (query: Record<string, any>) => [social, other].find((r) => matches(r, query)) ?? null,
      insertOne: async () => 'new-social-id',
      update: async (query: Record<string, any>, ops: Partial<SocialId>) => {
        for (const row of [social, other]) {
          if (matches(row, query)) Object.assign(row, ops)
        }
      }
    },
    account: {
      findOne: async () => account,
      update: jest.fn(async (_query: unknown, ops: Record<string, unknown>) => {
        Object.assign(account, ops)
      })
    },
    accountEvent: { insertOne: jest.fn() },
    setPassword: jest.fn(),
    person: { findOne: async () => ({ uuid: personUuid, firstName: 'Vic', lastName: 'Tim' }) }
  } as unknown as AccountDB

  return { db, rows, social, other, account }
}

describe('otp attempts', () => {
  const ctx = { error: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as MeasureContext
  const mailSend = jest.fn()
  let now: number
  let ttlSec: number
  let db: AccountDB
  let rows: OTP[]
  let sid: SocialId
  let other: SocialId
  let account: any

  const newestCode = (): string => rows[rows.length - 1].code
  // Six digits that no stored code has.
  const wrongCode = (): string => ['000000', '000001'].find((c) => rows.every((r) => r.code !== c)) as string
  const validate = async (code: string): Promise<unknown> => await validateOtp(ctx, db, null, 'token', { email, code })
  const verify = async (code: string): Promise<void> => {
    await utils.verifyOperationOtp(ctx, db, 'token', code)
  }
  // Both issue helpers insist the mail went out, so a refused issue fails the test at once.
  const issue = async (): Promise<string> => {
    mailSend.mockClear()
    await utils.sendOtp(ctx, db, null, sid)
    expect(mailSend).toHaveBeenCalledTimes(1)
    return newestCode()
  }
  const issueOperation = async (): Promise<string> => {
    mailSend.mockClear()
    await utils.sendOperationOtp(ctx, db, null, 'token')
    expect(mailSend).toHaveBeenCalledTimes(1)
    return newestCode()
  }
  // Wrong guesses at the live login code.
  const miss = async (count: number): Promise<void> => {
    for (let i = 0; i < count; i++) {
      await expect(validate(wrongCode())).rejects.toThrow(invalidOtp)
    }
  }
  // The lock letter and its link row are not what most tests look at: drop them with the 5th miss.
  const dropLockLetter = (): void => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].purpose === 'login-link') rows.splice(i, 1)
    }
    mailSend.mockClear()
  }
  const exhaust = async (): Promise<void> => {
    await miss(5)
    dropLockLetter()
  }
  // What sendOtp refuses with while the wrong guesses hold the wait.
  const refusal = async (): Promise<any> =>
    await utils.sendOtp(ctx, db, null, sid).then(
      () => undefined,
      (err) => err
    )

  beforeEach(() => {
    ;({ db, rows, social: sid, other, account } = createFakeDb())
    mailSend.mockClear()
    now = Date.parse('2026-10-18T10:00:00Z')
    // Live codes outlive the retry delay, as on the stands (OTP_TIME_TO_LIVE=600).
    ttlSec = 600
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    ;(getMetadata as jest.Mock).mockImplementation((key) => {
      if (key === accountPlugin.metadata.OtpRetryDelaySec) return 60
      if (key === accountPlugin.metadata.OtpTimeToLiveSec) return ttlSec
      if (key === accountPlugin.metadata.MailQueue) return { send: mailSend }
      if (key === accountPlugin.metadata.FrontURL) return 'https://front.example.com'
      return undefined
    })
    ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid })
    ;(generateToken as jest.Mock).mockReturnValue('mocked-token')
    jest.spyOn(utils, 'getEmailSocialId').mockImplementation(async () => ({ ...sid }))
    jest.spyOn(utils, 'confirmHulyIds').mockResolvedValue()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  const kinds = {
    login: {
      issue,
      use: async (code: string): Promise<void> => {
        await validate(code)
      }
    },
    operation: { issue: issueOperation, use: verify }
  }
  type Kind = keyof typeof kinds
  const kindNames = Object.keys(kinds) as Kind[]
  const pairs: Array<[Kind, Kind]> = [
    ['login', 'operation'],
    ['operation', 'login']
  ]
  // Wrong guesses at the live code of a kind.
  const missAs = async (kind: Kind, count: number): Promise<void> => {
    for (let i = 0; i < count; i++) {
      await expect(kinds[kind].use(wrongCode())).rejects.toThrow(invalidOtp)
    }
    dropLockLetter()
  }

  describe.each(kindNames)('%s code (validateOtp, verifyOperationOtp)', (kind) => {
    test('the right code works on the first attempt and only once', async () => {
      const code = await kinds[kind].issue()

      await expect(kinds[kind].use(code)).resolves.toBeUndefined()

      expect(rows).toHaveLength(0)
      await expect(kinds[kind].use(code)).rejects.toThrow(invalidOtp)
    })

    test('the right code works after four misses', async () => {
      const code = await kinds[kind].issue()
      await missAs(kind, 4)

      await expect(kinds[kind].use(code)).resolves.toBeUndefined()
    })

    test('the sixth attempt is refused even with the right code, and the dead row stays', async () => {
      const code = await kinds[kind].issue()
      await missAs(kind, 5)
      now += 30 * 1000

      await expect(kinds[kind].use(code)).rejects.toThrow(invalidOtp)
      await expect(kinds[kind].use(code)).rejects.toThrow(invalidOtp)
      expect(rows).toHaveLength(1)
    })
  })

  test('operation guesses at another social id are not counted against the code', async () => {
    const code = await issueOperation()
    for (let i = 0; i < 6; i++) {
      await utils.isOtpValid(db, 'stranger-social-id' as PersonId, wrongCode(), 'operation')
    }

    await expect(verify(code)).resolves.toBeUndefined()
  })

  describe('several live codes (parallel sendOtp calls)', () => {
    const row = (code: string, createdOn: number): OTP => ({
      socialId: sid._id,
      purpose: 'login',
      code,
      createdOn,
      expiresOn: now + 600 * 1000,
      attempts: 0
    })

    test('the right code of an older row is refused, the newest row works', async () => {
      rows.push(row('111111', now - 1000), row('222222', now))

      await expect(validate('111111')).rejects.toThrow(invalidOtp)
      await expect(validate('222222')).resolves.toMatchObject({ account: personUuid })
    })

    test.each([
      ['333333 stored first', ['333333', '444444']],
      ['444444 stored first', ['444444', '333333']]
    ])('rows from the same millisecond: the greater code wins, whatever the order (%s)', async (_name, codes) => {
      rows.push(...codes.map((code) => row(code, now)))

      expect(await utils.isOtpValid(db, sid._id, '333333', 'login')).toBe(false)
      expect(await utils.isOtpValid(db, sid._id, '444444', 'login')).toBe(true)
    })
  })

  describe('sendOtp', () => {
    test('a new code replaces the old one', async () => {
      const first = await issue()
      now += 61 * 1000

      const second = await issue()

      expect(second).not.toBe(first)
      expect(rows).toHaveLength(1)
      expect(await utils.isOtpValid(db, sid._id, first, 'login')).toBe(false)
      expect(await utils.isOtpValid(db, sid._id, second, 'login')).toBe(true)
    })

    // A request inside the wait pays neither for the scan of the otp table by code nor for the lock of the social id.
    const spyOnIssue = (): { findOne: jest.SpyInstance, lock: jest.SpyInstance } => ({
      findOne: jest.spyOn(db.otp, 'findOne'),
      lock: jest.spyOn(db, 'withOtpIssue')
    })

    describe('a request inside the wait', () => {
      test('after a sent code answers sent without generating a code', async () => {
        const first = await issue()
        const retryOn = now + 60 * 1000
        now += 10 * 1000
        const spies = spyOnIssue()

        await expect(utils.sendOtp(ctx, db, null, sid)).resolves.toEqual({ sent: true, retryOn })

        expect(spies.findOne).not.toHaveBeenCalled()
        expect(spies.lock).not.toHaveBeenCalled()
        expect(rows.map((r) => r.code)).toEqual([first])
      })

      test('after the wait a code is generated and issued under the lock', async () => {
        await issue()
        now += 61 * 1000
        const spies = spyOnIssue()

        await issue()

        expect(spies.findOne).toHaveBeenCalledWith({ code: expect.any(String) })
        expect(spies.lock).toHaveBeenCalledTimes(1)
      })
    })

    describe('after the attempts are used up', () => {
      let dead: string

      beforeEach(async () => {
        dead = await issue()
        await exhaust()
        mailSend.mockClear()
      })

      test('a request inside the wait sends no mail, generates no code and revives nothing', async () => {
        now += 10 * 1000
        const spies = spyOnIssue()

        const refused = await refusal()

        expect(refused).toBeInstanceOf(PlatformError)
        expect(refused.status.code).toBe(platform.status.TooManyOtpAttempts)
        expect(mailSend).not.toHaveBeenCalled()
        expect(spies.findOne).not.toHaveBeenCalled()
        expect(spies.lock).not.toHaveBeenCalled()
        expect(rows.map((r) => r.code)).toEqual([dead])
        expect(await utils.isOtpValid(db, sid._id, dead, 'login')).toBe(false)
      })

      test('a request after the wait replaces the dead code with a fresh one', async () => {
        now += 60 * 60 * 1000

        const fresh = await issue()

        expect(rows).toHaveLength(1)
        expect(rows[0].attempts).toBe(0)
        expect(await utils.isOtpValid(db, sid._id, dead, 'login')).toBe(false)
        expect(await utils.isOtpValid(db, sid._id, fresh, 'login')).toBe(true)
      })
    })
  })

  // Without the purpose the two kinds share the rows of a social id: whoever knows the email could
  // burn the code of a destructive action with sign in guesses.
  describe('login codes and operation codes', () => {
    test('a login code issued after the retry delay leaves the operation code', async () => {
      const op = await issueOperation()
      now += 61 * 1000

      await loginOtp(ctx, db, null, 'token', { email })

      expect(rows).toHaveLength(2)
      await expect(verify(op)).resolves.toBeUndefined()
    })

    test.each(pairs)('wrong %s guesses do not use up the %s code', async (burned, kept) => {
      await kinds[burned].issue()
      now += 61 * 1000
      const code = await kinds[kept].issue()
      await missAs(burned, 6)

      await expect(kinds[kept].use(code)).resolves.toBeUndefined()
    })

    test.each(pairs)('the retry delay of a %s code does not hold back a %s code', async (first, second) => {
      await kinds[first].issue()
      now += 1000

      const code = await kinds[second].issue()

      await expect(kinds[second].use(code)).resolves.toBeUndefined()
    })

    test('a wait after wrong login guesses does not hold back an operation code', async () => {
      await issue()
      await exhaust()
      now += 1000

      const op = await issueOperation()

      await expect(verify(op)).resolves.toBeUndefined()
    })

    test.each(pairs)('a right %s code leaves the %s code', async (used, kept) => {
      const keptCode = await kinds[kept].issue()
      now += 61 * 1000
      const usedCode = await kinds[used].issue()

      await expect(kinds[used].use(usedCode)).resolves.toBeUndefined()
      await expect(kinds[kept].use(keptCode)).resolves.toBeUndefined()
    })

    test('a code is good only for the purpose it was issued for', async () => {
      const login = await issue()
      await expect(verify(login)).rejects.toThrow(invalidOtp)

      const op = await issueOperation()
      await expect(validate(op)).rejects.toThrow(invalidOtp)
    })
  })

  // 5 wrong guesses at login codes hold the next code for an hour, every further miss starts it anew. Counting
  // them all, not only the codes that ran out, keeps four guesses per code from slipping under.
  describe('wait after wrong login guesses', () => {
    const wait = 60 * 60 * 1000

    // Issues a code, makes `count` wrong guesses at it, and checks that the next code is refused
    // until `waitMs` after the last of them.
    async function missAndWait (count: number, waitMs: number): Promise<void> {
      await issue()
      await miss(count)
      const missedAt = now
      mailSend.mockClear()
      now += waitMs - 1000

      const refused = await refusal()
      expect(refused).toBeInstanceOf(PlatformError)
      expect(refused.status.code).toBe(platform.status.TooManyOtpAttempts)
      expect(refused.status.params.retryOn).toBe(missedAt + waitMs)
      expect(mailSend).not.toHaveBeenCalled()
      now += 1000
    }

    test('5 wrong guesses refuse a new code for an hour, then it is issued', async () => {
      await missAndWait(5, wait)

      await issue()
    })

    test('a miss after the wait starts another hour, without doubling', async () => {
      for (let i = 0; i < 3; i++) {
        await missAndWait(5, wait)
      }
    })

    test('misses at several codes add up to the cap', async () => {
      await issue()
      await miss(4)
      now += 61 * 1000
      await issue()
      await miss(1)
      const missedAt = now
      mailSend.mockClear()

      // The second code can still be typed, so the answer stays sent, but no new code goes out.
      await expect(utils.sendOtp(ctx, db, null, sid)).resolves.toEqual({ sent: true, retryOn: missedAt + wait })
      expect(mailSend).not.toHaveBeenCalled()
    })

    test('guesses past the cap of one code do not grow the count', async () => {
      await issue()
      await miss(5)
      const missedAt = now
      now += 10 * 1000

      await miss(25)

      expect((await refusal()).status.params.retryOn).toBe(missedAt + wait)
    })

    test('the wait outlives the exhausted code and the cleaning of its row', async () => {
      ttlSec = 60
      await issue()
      await exhaust()
      const missedAt = now
      now += 61 * 1000
      // What cleanExpiredOtp does to the dead row.
      rows.length = 0
      mailSend.mockClear()

      expect((await refusal()).status.params.retryOn).toBe(missedAt + wait)

      expect(mailSend).not.toHaveBeenCalled()
      now += wait - 61 * 1000
      await issue()
    })

    // After each prelude the next 5 wrong guesses are the first 5 again.
    const fromScratch: Array<[string, () => Promise<void>]> = [
      [
        'a right code puts the wait back to the start',
        async () => {
          await missAndWait(5, wait)
          await validate(await issue())
        }
      ],
      [
        'a right code on the last attempt is no miss',
        async () => {
          const code = await issue()
          await miss(4)
          await validate(code)
        }
      ],
      [
        'wrong guesses with no live code count nothing',
        async () => {
          for (let i = 0; i < 8; i++) {
            await expect(validate('123456')).rejects.toThrow(invalidOtp)
          }
        }
      ],
      [
        'codes that expire without a guess do not count',
        async () => {
          for (let i = 0; i < 3; i++) {
            await issue()
            now += 601 * 1000
          }
        }
      ],
      [
        'wrong operation guesses do not count',
        async () => {
          await issueOperation()
          await missAs('operation', 6)
          now += 61 * 1000
          await issueOperation()
        }
      ]
    ]

    test.each(fromScratch)('%s', async (_name, prelude) => {
      await prelude()

      await missAndWait(5, wait)
    })

    describe('what the refused request gets', () => {
      test('the time left, in minutes rounded up, and the moment to retry', async () => {
        await issue()
        await exhaust()
        const missedAt = now
        now += 30 * 1000

        const refused = await refusal()

        expect(refused.status.severity).toBe(Severity.ERROR)
        expect(refused.status.params).toEqual({ retryOn: missedAt + wait, minutes: 60 })
        now += 60 * 1000
        expect((await refusal()).status.params).toEqual({ retryOn: missedAt + wait, minutes: 59 })
      })

      test('a code that can still be typed keeps the answer sent', async () => {
        await issue()
        await exhaust()
        now += wait
        const live = await issue()
        await miss(1)
        dropLockLetter()
        const missedAt = now
        now += 10 * 1000

        await expect(utils.sendOtp(ctx, db, null, sid)).resolves.toEqual({ sent: true, retryOn: missedAt + wait })

        expect(rows.map((r) => r.code)).toEqual([live])
      })

      test('signUpOtp and loginOtp pass it on', async () => {
        await issue()
        await exhaust()
        now += 10 * 1000

        await expect(loginOtp(ctx, db, null, 'token', { email })).rejects.toMatchObject({
          status: { code: platform.status.TooManyOtpAttempts }
        })
      })
    })
  })

  // An unknown address is answered like a known one and gets a sign up letter, at most one per delay.
  describe('an address without an account', () => {
    const unknown = (): string => `nobody-${Math.random()}@example.com`
    const lettersTo = (to: string): any[] => mailSend.mock.calls.filter((c) => c[2][0].data.to === to)

    beforeEach(() => {
      jest.spyOn(utils, 'getEmailSocialId').mockResolvedValue(null)
    })

    test('loginOtp answers sent and mails the sign up link once per delay', async () => {
      const to = unknown()

      const first = await loginOtp(ctx, db, null, 'token', { email: to })
      await loginOtp(ctx, db, null, 'token', { email: to })

      expect(first).toEqual({ sent: true, retryOn: now + 60 * 1000 })
      expect(lettersTo(to)).toHaveLength(1)
      expect(lettersTo(to)[0][2][0].data.text).toContain('https://front.example.com/login/signup')

      now += 61 * 1000
      await loginOtp(ctx, db, null, 'token', { email: to })
      expect(lettersTo(to)).toHaveLength(2)
    })

    test('requestPasswordReset mails the same letter once per delay', async () => {
      const to = unknown()

      await requestPasswordReset(ctx, db, null, 'token', { email: to })
      await requestPasswordReset(ctx, db, null, 'token', { email: to })

      expect(lettersTo(to)).toHaveLength(1)
    })

    const guess = async (to: string, code = '000000'): Promise<void> => {
      await expect(validateOtp(ctx, db, null, 'token', { email: to, code })).rejects.toThrow(invalidOtp)
    }
    const tooMany = { status: { code: platform.status.TooManyOtpAttempts } }

    test('5 wrong codes lock loginOtp like a real account, and the lock ends after an hour', async () => {
      const to = unknown()
      await loginOtp(ctx, db, null, 'token', { email: to })
      for (let i = 0; i < 5; i++) await guess(to)

      now += 10 * 1000
      await expect(loginOtp(ctx, db, null, 'token', { email: to })).rejects.toMatchObject(tooMany)

      now += 60 * 60 * 1000
      await expect(loginOtp(ctx, db, null, 'token', { email: to })).resolves.toMatchObject({ sent: true })
    })

    test('a guess without a loginOtp before it counts nothing', async () => {
      const to = unknown()
      for (let i = 0; i < 6; i++) await guess(to)

      await expect(loginOtp(ctx, db, null, 'token', { email: to })).resolves.toMatchObject({ sent: true })
      expect(lettersTo(to)).toHaveLength(1)
    })

    test('after the lock is over one wrong code does not lock again', async () => {
      const to = unknown()
      await loginOtp(ctx, db, null, 'token', { email: to })
      for (let i = 0; i < 5; i++) await guess(to)
      now += 60 * 60 * 1000 + 1000
      await loginOtp(ctx, db, null, 'token', { email: to })

      await guess(to)
      now += 61 * 1000

      await expect(loginOtp(ctx, db, null, 'token', { email: to })).resolves.toMatchObject({ sent: true })
    })

    test.each([
      ['loginOtp', async (to: string) => await loginOtp(ctx, db, null, 'token', { email: to })],
      [
        'requestPasswordReset',
        async (to: string) => {
          await requestPasswordReset(ctx, db, null, 'token', { email: to })
        }
      ]
    ])('%s refuses a list of addresses and mails nothing', async (_name, call) => {
      await expect(call('a@x.com, b@y.com')).rejects.toMatchObject({ status: { code: platform.status.BadRequest } })

      expect(mailSend).not.toHaveBeenCalled()
    })
  })

  // The 5th miss closes the code sign in for an hour and mails the owner a one-time link.
  describe('the lock letter and the sign in link', () => {
    const hour = 60 * 60 * 1000
    const letters = (): any[] =>
      mailSend.mock.calls.filter((c) => (c[2][0].data.text as string).includes('/login/loginLink#token='))
    const tokenOf = (letter: any): string => /loginLink#token=([0-9a-f]+)/.exec(letter[2][0].data.text)?.[1] as string
    const byLink = async (token: string): Promise<any> => await loginByLink(ctx, db, null, 'token', { token })
    const lock = async (): Promise<string> => {
      await issue()
      await miss(5)
      return tokenOf(letters()[letters().length - 1])
    }

    test('only the miss that starts the lock mails a letter, the link lives as long as the lock', async () => {
      await issue()
      await miss(4)
      now += 61 * 1000
      await issue()
      expect(letters()).toHaveLength(0)

      await miss(1)
      expect(letters()).toHaveLength(1)
      const link = rows.find((r) => r.purpose === 'login-link') as OTP
      expect(link.expiresOn - link.createdOn).toBe(hour)
      expect(link.code).not.toBe(tokenOf(letters()[0]))

      // The second code still takes guesses inside the lock: its misses mail nothing.
      await miss(2)
      expect(letters()).toHaveLength(1)
    })

    test('the link signs in once and ends the lock', async () => {
      const token = await lock()

      await expect(byLink(token)).resolves.toMatchObject({ account: personUuid, socialId: sid._id })
      expect(sid.loginOtpMisses).toBe(0)
      expect(rows.some((r) => r.purpose === 'login-link')).toBe(false)
      await expect(byLink(token)).rejects.toThrow(invalidOtp)
    })

    test('after the lock is over one wrong code does not lock again or mail a second letter', async () => {
      await lock()
      now += hour + 1000
      await expect(loginOtp(ctx, db, null, 'token', { email })).resolves.toMatchObject({ sent: true })
      mailSend.mockClear()

      await miss(1)
      now += 61 * 1000

      await expect(loginOtp(ctx, db, null, 'token', { email })).resolves.toMatchObject({ sent: true })
      expect(sid.loginOtpMisses).toBe(1)
      expect(letters()).toHaveLength(0)
    })

    test('a password sign in kills the live link', async () => {
      const token = await lock()
      jest.spyOn(utils, 'verifyPassword').mockReturnValue(true)

      await login(ctx, db, null, 'token', { email, password: 'password' })

      await expect(byLink(token)).rejects.toThrow(invalidOtp)
    })

    test('a restored password kills the live link', async () => {
      const token = await lock()
      jest.spyOn(utils, 'verifyPassword').mockReturnValue(true)
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, extra: { restoreEmail: email } })

      await restorePassword(ctx, db, null, 'link', { password: 'a-new-password' })

      await expect(byLink(token)).rejects.toThrow(invalidOtp)
    })

    test('an expired, a replaced and an unknown link fail alike', async () => {
      const first = await lock()
      now += hour + 1000

      await expect(byLink(first)).rejects.toThrow(invalidOtp)
      const second = await lock()
      expect(second).not.toBe(first)
      await expect(byLink(first)).rejects.toThrow(invalidOtp)
      await expect(byLink('ab'.repeat(32))).rejects.toThrow(invalidOtp)
      await expect(byLink(second)).resolves.toMatchObject({ account: personUuid })
    })
  })

  // A confirmed sign in ends the streak on every email of the account: the person is proven,
  // whichever way they came in.
  describe('a confirmed sign in', () => {
    beforeEach(() => {
      sid.loginOtpMisses = 7
      sid.loginOtpMissedOn = now - 1000
      other.loginOtpMisses = 12
      other.loginOtpMissedOn = now - 2000
    })

    // The wait of the misses above holds back a new code, so put a live one in place.
    const plant = (): string => {
      rows.push({
        socialId: sid._id,
        purpose: 'login',
        code: '123456',
        createdOn: now,
        expiresOn: now + 600000,
        attempts: 0
      })
      return '123456'
    }

    const reset = [
      [0, 0],
      [0, 0]
    ]
    const counters = (): unknown => [
      [sid.loginOtpMisses, sid.loginOtpMissedOn],
      [other.loginOtpMisses, other.loginOtpMissedOn]
    ]

    test.each([
      [
        'a code',
        async () => {
          await expect(validate(plant())).resolves.toMatchObject({ account: personUuid, token: 'mocked-token' })
        }
      ],
      [
        'a password',
        async () => {
          jest.spyOn(utils, 'verifyPassword').mockReturnValue(true)
          await login(ctx, db, null, 'token', { email, password: 'password' })
        }
      ],
      [
        'a provider',
        async () => {
          await utils.loginOrSignUpWithProvider(ctx, db, null, email, 'Vic', 'Tim', {
            type: SocialIdType.GOOGLE,
            value: 'google-id'
          })
        }
      ]
    ])('by %s clears the counters of every email of the account', async (_name, signIn) => {
      await signIn()

      expect(counters()).toEqual(reset)
    })

    test('a wrong password does not', async () => {
      jest.spyOn(utils, 'verifyPassword').mockReturnValue(false)

      await expect(login(ctx, db, null, 'token', { email, password: 'wrong' })).rejects.toThrow()

      expect([sid.loginOtpMisses, other.loginOtpMisses]).toEqual([7, 12])
    })

    test('a wrong code only adds a miss', async () => {
      plant()

      await expect(validate(wrongCode())).rejects.toThrow(invalidOtp)

      expect([sid.loginOtpMisses, other.loginOtpMisses]).toEqual([8, 12])
    })
  })

  // Checking the wait and writing the code are one step: requests passing the check together would
  // each write a fresh code with its own 5 attempts.
  describe('parallel sendOtp', () => {
    test('at the end of a wait held by wrong guesses too, and the new code keeps its full budget', async () => {
      await issue()
      await exhaust()
      now += 60 * 60 * 1000
      mailSend.mockClear()

      await Promise.all(Array.from({ length: 6 }, async () => await utils.sendOtp(ctx, db, null, sid)))
      await exhaust()
      mailSend.mockClear()

      expect(rows).toHaveLength(1)
      // 5 guesses used it up, not 5 per request.
      expect(rows[0].attempts).toBe(5)
      await expect(validate(rows[0].code)).rejects.toThrow(invalidOtp)
    })

    test('a code that could not be mailed is taken back, so the user can ask again at once', async () => {
      mailSend.mockRejectedValueOnce(new Error('mail queue is down'))

      await expect(utils.sendOtp(ctx, db, null, sid)).rejects.toThrow('mail queue is down')
      expect(rows).toHaveLength(0)

      await expect(utils.sendOtp(ctx, db, null, sid)).resolves.toMatchObject({ sent: true })
      expect(rows).toHaveLength(1)
    })
  })

  // Wrong passwords lock the password login, wrong codes hold the code login: the emailed link is
  // the way out, and it has to open the door the locks closed.
  describe('a password restored from the emailed link', () => {
    const restore = async (): Promise<unknown> =>
      await restorePassword(ctx, db, null, 'link', { password: 'a-new-password' })

    beforeEach(() => {
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, extra: { restoreEmail: email } })
    })

    async function lockBoth (): Promise<void> {
      jest.spyOn(utils, 'verifyPassword').mockReturnValue(false)
      for (let i = 0; i < 5; i++) {
        await expect(login(ctx, db, null, 'token', { email, password: 'wrong' })).rejects.toThrow()
      }
      await issue()
      await exhaust()
      // The other email of the account was probed too.
      other.loginOtpMisses = 7
      other.loginOtpMissedOn = now
      jest.spyOn(utils, 'verifyPassword').mockReturnValue(true)
    }

    test('lets the owner in although the password login and the code login are both locked', async () => {
      await lockBoth()
      await expect(login(ctx, db, null, 'token', { email, password: 'a-new-password' })).rejects.toMatchObject({
        status: { code: platform.status.PasswordLoginLocked }
      })

      await expect(restore()).resolves.toMatchObject({ account: personUuid, token: 'mocked-token' })

      expect(account.failedLoginAttempts).toBe(0)
      expect([sid.loginOtpMisses, other.loginOtpMisses]).toEqual([0, 0])
      await expect(login(ctx, db, null, 'token', { email, password: 'a-new-password' })).resolves.toMatchObject({
        account: personUuid
      })
    })

    test('a link without the email restores nothing and unlocks nothing', async () => {
      await lockBoth()
      ;(decodeTokenVerbose as jest.Mock).mockReturnValue({ account: personUuid, extra: {} })

      await expect(restore()).rejects.toMatchObject({ status: { code: platform.status.Forbidden } })

      expect(account.failedLoginAttempts).toBe(5)
      expect([sid.loginOtpMisses, other.loginOtpMisses]).toEqual([5, 7])
    })
  })
})
