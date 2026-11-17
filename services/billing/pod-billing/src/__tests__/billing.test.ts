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
import { AccountRole, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import attachment from '@hcengineering/attachment'
import drive from '@hcengineering/drive'
import { getClient } from '../client'

const getSubscriptionsMock = jest.fn()

jest.mock('@hcengineering/account-client', () => ({
  getClient: jest.fn(() => ({ getSubscriptions: getSubscriptionsMock })),
  // Mirrors the real grantsPlan/isFreePlan (see limits.test.ts for the same mock).
  grantsPlan: (sub: any): boolean => {
    if (sub == null) return false
    if (sub.status === 'past_due' && sub.providerData?.pending === true) return false
    if (sub.status === 'trialing' && sub.trialEnd != null && sub.trialEnd < Date.now()) return false
    return ['active', 'trialing', 'past_due', 'readonly'].includes(sub.status)
  },
  isFreePlan: (tier: any): boolean => tier === undefined || tier.provider === 'free' || tier.plan === 'free',
  SubscriptionType: { Tier: 'tier', Support: 'support', Package: 'package' },
  SubscriptionStatus: {
    Active: 'active',
    Trialing: 'trialing',
    PastDue: 'past_due',
    ReadOnly: 'readonly',
    Canceled: 'canceled',
    Paused: 'paused',
    Expired: 'expired'
  }
}))
jest.mock('@hcengineering/server-token', () => ({
  generateToken: jest.fn(() => 'tok'),
  isHumanAdmin: (token: any) => token.extra?.admin === 'true',
  hasAdminSession: (token: any) => token.extra?.fresh === 'true'
}))
const getLoginInfoByTokenMock = jest.fn()
jest.mock('@hcengineering/server-client', () => ({
  extractToken: jest.fn(),
  getAccountClient: () => ({ getLoginInfoByToken: getLoginInfoByTokenMock })
}))
const datalakeClientMock = jest.fn()
jest.mock('@hcengineering/datalake', () => ({
  createDatalakeClient: (...args: any[]) => datalakeClientMock(...args)
}))
jest.mock('../config', () => ({
  __esModule: true,
  default: { AccountsUrl: 'http://account', WindowMonthLimit: 1000, ProviderPrices: {} }
}))
// The workspace document client is separate from account-client.
jest.mock('../client', () => ({ getClient: jest.fn() }))

/* eslint-disable @typescript-eslint/no-var-requires */
const {
  handleGetLargestSpaces,
  handleGetWorkspaceTokenWindows,
  handleGetWorkspaceLimitStates,
  handleAddAiTokens,
  handlePushAiTokensData,
  handlePushTranscriptUsage,
  handlePushAiTranscriptData,
  handlePushParticipantSessions,
  resolveWorkspacePlan,
  clearWorkspacePlanCache,
  collectDatalakeStats
} = require('../billing')
const { withOwner, withWorkspaceMember } = require('../middleware')
/* eslint-enable @typescript-eslint/no-var-requires */

const WS = '123e4567-e89b-12d3-a456-426614174000' as WorkspaceUuid
const ctx: any = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }

function makeDb (over: Record<string, jest.Mock> = {}): any {
  return {
    getAiTokensStats: jest.fn(async () => []),
    getWorkspaceLevelUsage: jest.fn(async () => []),
    listAiModelRegistry: jest.fn(async () => []),
    getTokenBalance: jest.fn(async () => undefined),
    grantAiTokens: jest.fn(async () => true),
    pushAiTokensData: jest.fn(async () => {}),
    pushTranscriptUsage: jest.fn(async () => {}),
    pushAiTranscriptData: jest.fn(async () => {}),
    pushParticipantSessions: jest.fn(async () => {}),
    ...over
  }
}

function makeReq (over: Record<string, any> = {}): any {
  return { params: { workspace: WS }, query: {}, body: {}, ...over }
}

function makeRes (): any {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() }
}

beforeEach(() => {
  jest.clearAllMocks()
  // Subscriptions are cached per workspace for a minute; each test sets up its own mock.
  clearWorkspacePlanCache()
})

describe('resolveWorkspacePlan', () => {
  it('takes windowMonthLimit from the active tier', async () => {
    getSubscriptionsMock.mockResolvedValue([
      { type: 'tier', status: 'active', plan: 'pro', createdOn: 1, limits: { windowMonthLimit: 5000, tokenLimit: 1e6 } }
    ])
    const result = await resolveWorkspacePlan(ctx, makeDb(), WS)
    expect(result.limitMonth).toBe(5000)
    expect(result.plan).toBe('pro')
    expect(result.isFree).toBe(false)
  })

  it('fails open to env defaults when the account lookup throws', async () => {
    getSubscriptionsMock.mockRejectedValue(new Error('account down'))
    await expect(resolveWorkspacePlan(ctx, makeDb(), WS)).resolves.toEqual(
      expect.objectContaining({ plan: 'unknown', limitMonth: 1000, balance: 0, hasPackages: false, isFree: false })
    )
  })

  it('anchors periodStart on the earliest active AI-token package, not the tier start', async () => {
    const tierStart = Date.now() - 10 * 24 * 60 * 60 * 1000
    const pkgEarly = Date.now() - 8 * 24 * 60 * 60 * 1000
    const pkgLate = Date.now() - 5 * 24 * 60 * 60 * 1000
    getSubscriptionsMock.mockResolvedValue([
      {
        type: 'tier',
        status: 'active',
        plan: 'pro',
        createdOn: 1,
        limits: { windowMonthLimit: 1000 },
        periodStart: tierStart
      },
      { type: 'package', status: 'active', limits: { tokenLimit: 500 }, periodStart: pkgLate },
      { type: 'package', status: 'active', limits: { tokenLimit: 500 }, periodStart: pkgEarly }
    ])
    const result = await resolveWorkspacePlan(ctx, makeDb(), WS)
    // Floored to the hour, since usage is bucketed hourly (see getPeriodStartDate).
    const expected = new Date(pkgEarly)
    expected.setUTCMinutes(0, 0, 0)
    expect(result.periodStart.getTime()).toBe(expected.getTime())
    expect(result.hasPackages).toBe(true)
  })
})

describe('handleGetWorkspaceTokenWindows', () => {
  it('reports the whole period spend and leaves the pack untouched mid-period', async () => {
    const periodStartMs = new Date('2026-01-01T00:00:00.000Z').getTime()
    getSubscriptionsMock.mockResolvedValue([
      {
        type: 'tier',
        status: 'active',
        plan: 'pro',
        createdOn: 1,
        limits: { windowMonthLimit: 1000 },
        periodStart: periodStartMs
      }
    ])
    const db = makeDb({
      getAiTokensStats: jest.fn(async () => [{ reason: 'chat', totalTokens: 200 }]),
      getTokenBalance: jest.fn(async () => ({
        workspace: WS,
        remainingTokens: 50,
        absorbedUntil: null,
        absorbedPeriod: 30,
        periodStart: new Date(periodStartMs).toISOString()
      })),
      listAiModelRegistry: jest.fn(async () => [{ providerId: 'p', model: 'm', level: 'low', label: 'Basic' }])
    })
    const res = makeRes()
    await handleGetWorkspaceTokenWindows(ctx, db, [], makeReq(), res)

    const body = res.json.mock.calls[0][0]
    // `used` is the whole period spend - the pack is charged only at period end, so it stands
    // still.
    expect(body.month.used).toBe(200)
    expect(body.balance).toBe(50)
    expect(body.available).toBe(850) // 1000 grant + 50 pack - 200 spent
    expect(body.basicLevelLabel).toBe('Basic')
  })

  it('reports the whole period spend even when the pack row is from an older period', async () => {
    const periodStartMs = new Date('2026-01-01T00:00:00.000Z').getTime()
    getSubscriptionsMock.mockResolvedValue([
      {
        type: 'tier',
        status: 'active',
        plan: 'pro',
        createdOn: 1,
        limits: { windowMonthLimit: 1000 },
        periodStart: periodStartMs
      }
    ])
    const db = makeDb({
      getAiTokensStats: jest.fn(async () => [{ reason: 'chat', totalTokens: 200 }]),
      getTokenBalance: jest.fn(async () => ({
        workspace: WS,
        remainingTokens: 50,
        absorbedUntil: null,
        absorbedPeriod: 30,
        periodStart: new Date(periodStartMs - 24 * 60 * 60 * 1000).toISOString() // stale period
      }))
    })
    const res = makeRes()
    await handleGetWorkspaceTokenWindows(ctx, db, [], makeReq(), res)

    const body = res.json.mock.calls[0][0]
    expect(body.month.used).toBe(200)
  })

  it('available is null when the tier window is unlimited (limitMonth 0)', async () => {
    getSubscriptionsMock.mockResolvedValue([
      { type: 'tier', status: 'active', plan: 'pro', createdOn: 1, limits: { windowMonthLimit: 0 } }
    ])
    const db = makeDb({ getAiTokensStats: jest.fn(async () => [{ reason: 'chat', totalTokens: 999999 }]) })
    const res = makeRes()
    await handleGetWorkspaceTokenWindows(ctx, db, [], makeReq(), res)

    const body = res.json.mock.calls[0][0]
    expect(body.available).toBeNull()
  })
})

describe('handleAddAiTokens', () => {
  it('rejects amount <= 0', async () => {
    const db = makeDb()
    const res = makeRes()
    await handleAddAiTokens(ctx, db, [], makeReq({ body: { amount: 0, purchaseId: 'p1' } }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(db.grantAiTokens).not.toHaveBeenCalled()
  })

  it('rejects an empty purchaseId', async () => {
    const db = makeDb()
    const res = makeRes()
    await handleAddAiTokens(ctx, db, [], makeReq({ body: { amount: 100, purchaseId: '' } }), res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(db.grantAiTokens).not.toHaveBeenCalled()
  })

  it('grants tokens and returns applied+amount on a valid request', async () => {
    const db = makeDb({ grantAiTokens: jest.fn(async () => true) })
    const res = makeRes()
    await handleAddAiTokens(ctx, db, [], makeReq({ body: { amount: 100, purchaseId: 'p1' } }), res)
    expect(db.grantAiTokens).toHaveBeenCalledWith(ctx, WS, 'p1', 100)
    expect(res.json).toHaveBeenCalledWith({ applied: true, amount: 100 })
  })
})

describe('push handlers', () => {
  const cases: Array<[string, (...args: any[]) => Promise<void>, string, any[]]> = [
    [
      'handlePushAiTokensData',
      handlePushAiTokensData,
      'pushAiTokensData',
      [{ workspace: WS, reason: 'chat', tokens: 1, date: '2026-01-01' }]
    ],
    [
      'handlePushTranscriptUsage',
      handlePushTranscriptUsage,
      'pushTranscriptUsage',
      [{ workspace: WS, durationSeconds: 1, date: '2026-01-01' }]
    ],
    [
      'handlePushAiTranscriptData',
      handlePushAiTranscriptData,
      'pushAiTranscriptData',
      [
        {
          workspace: WS,
          day: '2026-01-01',
          lastRequestId: 'r',
          lastStartTime: '2026-01-01',
          durationSeconds: 1,
          usd: 0
        }
      ]
    ],
    [
      'handlePushParticipantSessions',
      handlePushParticipantSessions,
      'pushParticipantSessions',
      [
        {
          workspace: WS,
          participantId: 'p',
          sessionId: 's',
          room: 'r',
          joinedAt: '2026-01-01',
          leftAt: '2026-01-01',
          durationSeconds: 1
        }
      ]
    ]
  ]

  describe.each(cases)('%s', (_name, handler, dbMethod, sample) => {
    it('rejects a non-array body', async () => {
      const db = makeDb()
      const res = makeRes()
      await handler(ctx, db, [], makeReq({ body: {} }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(db[dbMethod]).not.toHaveBeenCalled()
    })

    it('rejects an empty array body', async () => {
      const db = makeDb()
      const res = makeRes()
      await handler(ctx, db, [], makeReq({ body: [] }), res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(db[dbMethod]).not.toHaveBeenCalled()
    })

    it('pushes data and returns 204 on a valid array', async () => {
      const db = makeDb()
      const res = makeRes()
      await handler(ctx, db, [], makeReq({ body: sample }), res)
      expect(db[dbMethod]).toHaveBeenCalledWith(ctx, sample)
      expect(res.status).toHaveBeenCalledWith(204)
    })
  })
})

describe('collectDatalakeStats', () => {
  function makeClient (stats: any, byType: any[]): any {
    return {
      getWorkspaceStats: jest.fn(async () => stats),
      getWorkspaceStatsByType: jest.fn(async () => byType)
    }
  }

  it('sums totals and the derived subset across storage configs', async () => {
    datalakeClientMock
      .mockReturnValueOnce(
        makeClient({ count: 10, size: 1000, derivedCount: 6, derivedSize: 600 }, [
          { type: 'video', count: 8, size: 900, derivedCount: 6, derivedSize: 600 },
          { type: 'image', count: 2, size: 100, derivedCount: 0, derivedSize: 0 }
        ])
      )
      .mockReturnValueOnce(
        makeClient({ count: 3, size: 300, derivedCount: 1, derivedSize: 50 }, [
          { type: 'video', count: 3, size: 300, derivedCount: 1, derivedSize: 50 }
        ])
      )

    const result = await collectDatalakeStats(ctx, WS, [
      { kind: 'datalake', name: 'a' },
      { kind: 's3', name: 'ignored' },
      { kind: 'datalake', name: 'b' }
    ])

    expect(datalakeClientMock).toHaveBeenCalledTimes(2)
    expect(result.count).toBe(13)
    expect(result.size).toBe(1300)
    expect(result.derivedCount).toBe(7)
    expect(result.derivedSize).toBe(650)

    const video = result.byType.find((t: any) => t.type === 'video')
    expect(video).toEqual({ type: 'video', count: 11, size: 1200, derivedCount: 7, derivedSize: 650 })

    const image = result.byType.find((t: any) => t.type === 'image')
    expect(image).toEqual({ type: 'image', count: 2, size: 100, derivedCount: 0, derivedSize: 0 })
  })
})

describe('handleGetWorkspaceLimitStates', () => {
  it('returns persisted exhausted states and allows categories with no state', async () => {
    const db = makeDb({
      getLimitState: jest.fn(async (_ctx, _ws, category) => (category === 'disk' ? { exhausted: true } : undefined))
    })
    const res = makeRes()
    await handleGetWorkspaceLimitStates(ctx, db, [], makeReq(), res)
    expect(res.json).toHaveBeenCalledWith([
      { category: 'disk', exhausted: true },
      { category: 'tokens', exhausted: false },
      { category: 'transcript', exhausted: false }
    ])
    expect(db.getLimitState).toHaveBeenCalledWith(ctx, WS, 'disk')
  })
})

describe('workspace limit state access', () => {
  async function authorize (
    middleware: typeof withOwner,
    loginInfo: any,
    workspace = WS,
    token: any = {}
  ): Promise<any> {
    getLoginInfoByTokenMock.mockResolvedValue(loginInfo)
    const req: any = {
      params: { workspace },
      headers: { authorization: 'Bearer tok' },
      token: { account: 'person', workspace: WS, ...token }
    }
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), end: jest.fn() }
    const next = jest.fn()
    middleware(req, res, next)
    await Promise.resolve()
    await Promise.resolve()
    return { next, res }
  }

  it.each([AccountRole.Owner, AccountRole.User])('allows %s to read its workspace limits', async (role) => {
    const { next } = await authorize(withWorkspaceMember, { workspace: WS, role })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('rejects another workspace', async () => {
    const { next, res } = await authorize(
      withWorkspaceMember,
      { workspace: WS, role: AccountRole.User },
      'other' as WorkspaceUuid
    )
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it.each([null, {}, { workspace: WS, role: 'unknown' }, { workspace: 'other', role: AccountRole.User }])(
    'rejects missing or invalid membership %p',
    async (loginInfo) => {
      const { next, res } = await authorize(withWorkspaceMember, loginInfo)
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalled()
    }
  )

  it('keeps owner-only APIs closed to members', async () => {
    const { next, res } = await authorize(withOwner, { workspace: WS, role: AccountRole.User })
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect((await authorize(withOwner, { workspace: WS, role: AccountRole.Owner })).next).toHaveBeenCalledTimes(1)
  })

  it.each([{ account: systemAccountUuid }, { extra: { admin: 'true', fresh: 'true' } }])(
    'preserves privileged access %p',
    async (token) => {
      const { next } = await authorize(withWorkspaceMember, null, 'other' as WorkspaceUuid, token)
      expect(next).toHaveBeenCalledTimes(1)
    }
  )
})

describe('handleGetLargestSpaces', () => {
  it('combines attachments and every Drive version, including drives without attachments', async () => {
    const findAll = jest.fn(async (clazz: string) =>
      clazz === attachment.class.Attachment
        ? [
            { space: 'project', size: 100 },
            { space: 'mixed', size: 20 }
          ]
        : [
            { space: 'drive-only', size: 200 },
            { space: 'mixed', size: 30 },
            { space: 'mixed', size: 40 }
          ]
    )
    ;(getClient as jest.Mock).mockResolvedValue({ findAll })
    const res = makeRes()
    await handleGetLargestSpaces(ctx, makeDb(), [], makeReq(), res)
    expect(findAll).toHaveBeenCalledWith(drive.class.FileVersion, {}, { projection: { space: 1, size: 1 } })
    expect(res.json).toHaveBeenCalledWith([
      { spaceId: 'drive-only', size: 200 },
      { spaceId: 'project', size: 100 },
      { spaceId: 'mixed', size: 90 }
    ])
  })

  it('applies the top ten after combining and sorting both sources', async () => {
    const findAll = jest.fn(async (clazz: string) =>
      clazz === attachment.class.Attachment
        ? Array.from({ length: 11 }, (_, i) => ({ space: `project-${i}`, size: i + 1 }))
        : [
            { space: 'drive-only', size: 100 },
            { space: 'project-0', size: 200 }
          ]
    )
    ;(getClient as jest.Mock).mockResolvedValue({ findAll })
    const res = makeRes()
    await handleGetLargestSpaces(ctx, makeDb(), [], makeReq(), res)
    const result = res.json.mock.calls[0][0]
    expect(result).toHaveLength(10)
    expect(result.slice(0, 2)).toEqual([
      { spaceId: 'project-0', size: 201 },
      { spaceId: 'drive-only', size: 100 }
    ])
    expect(result[result.length - 1]).toEqual({ spaceId: 'project-3', size: 4 })
  })
})
