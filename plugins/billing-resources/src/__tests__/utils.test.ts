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

import type { PlanItem, PackageItem, PlanConfig } from '@hcengineering/billing'
import {
  getClient as getAccountClientRaw,
  SubscriptionStatus,
  SubscriptionType,
  type Subscription,
  type SubscriptionData
} from '@hcengineering/account-client'
import type { UsageStatus } from '@hcengineering/core'

import { isPlanConfig, calculateLimits, checkUsageAgainstLimits, checkWorkspaceLimits } from '../utils'
import { setSubscriptionState } from '../stores/subscription'

jest.mock('svelte/store', () => ({
  get: jest.fn(),
  writable: jest.fn(() => ({ subscribe: jest.fn(), set: jest.fn(), update: jest.fn() })),
  derived: jest.fn(() => ({ subscribe: jest.fn() }))
}))
jest.mock('@hcengineering/login', () => ({
  __esModule: true,
  default: { metadata: { AccountsUrl: {} } }
}))
jest.mock('@hcengineering/platform', () => ({ getMetadata: jest.fn(() => 'test') }))
jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: { metadata: { WorkspaceUuid: {}, Token: {}, PaymentUrl: {} } },
  getClient: jest.fn()
}))
jest.mock('@hcengineering/billing', () => ({ default: {} }))
jest.mock('@hcengineering/contact', () => ({ default: {} }))
jest.mock('@hcengineering/ai-bot', () => ({ aiBotEmailSocialKey: 'ai-bot:social:email' }))
jest.mock('@hcengineering/account-client', () => {
  const SubscriptionType = { Tier: 'tier', Support: 'support', Package: 'package', Purchase: 'purchase' }
  const SubscriptionStatus = {
    Active: 'active',
    Trialing: 'trialing',
    PastDue: 'past_due',
    ReadOnly: 'readonly',
    Canceled: 'canceled',
    Paused: 'paused',
    Expired: 'expired'
  }
  const granting = ['active', 'trialing', 'past_due', 'readonly']
  return {
    getClient: jest.fn(),
    SubscriptionStatus,
    SubscriptionType,
    // Mirrors the real helper: the module is mocked wholesale, and the provider stamps both flags.
    isCheckoutDraft: (sub: any): boolean => sub?.providerData?.pending === true || sub?.providerData?.draft === true,
    grantsPlan: (sub: any): boolean => {
      if (sub == null) return false
      if (sub.status === 'past_due' && sub.providerData?.pending === true) return false
      if (sub.status === 'trialing' && sub.trialEnd != null && sub.trialEnd < Date.now()) return false
      return granting.includes(sub.status)
    }
  }
})
jest.mock('@hcengineering/billing-client', () => ({ getClient: jest.fn() }))
jest.mock('@hcengineering/payment-client', () => ({ getClient: jest.fn() }))
jest.mock('@hcengineering/core', () => ({
  AccountRole: {},
  getCurrentAccount: jest.fn(),
  hasAccountRole: jest.fn()
}))
jest.mock('@hcengineering/ui', () => ({ showPopup: jest.fn() }))
jest.mock('../stores/subscription', () => ({
  setSubscriptionState: jest.fn(),
  updateLimitExceeded: jest.fn(),
  subscriptionStore: { subscribe: jest.fn(), set: jest.fn(), update: jest.fn() },
  setIsLimited: jest.fn()
}))
jest.mock('../components/SubscriptionsModal.svelte', () => ({}))

describe('isPlanConfig', () => {
  it('returns true for valid empty config', () => {
    expect(isPlanConfig({ plans: {}, packages: {} })).toBe(true)
  })

  it('returns true for config with data', () => {
    expect(isPlanConfig({ plans: { tier1: { id: 'tier1' } }, packages: {} })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isPlanConfig(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isPlanConfig(undefined)).toBe(false)
  })

  it('returns false for string', () => {
    expect(isPlanConfig('string')).toBe(false)
  })

  it('returns false for number', () => {
    expect(isPlanConfig(42)).toBe(false)
  })

  it('returns false when packages is missing', () => {
    expect(isPlanConfig({ plans: {} })).toBe(false)
  })

  it('returns false when plans is missing', () => {
    expect(isPlanConfig({ packages: {} })).toBe(false)
  })

  it('returns false when plans is null', () => {
    expect(isPlanConfig({ plans: null, packages: {} })).toBe(false)
  })

  it('returns false for array', () => {
    expect(isPlanConfig([])).toBe(false)
  })
})

const GB = 1e9

const plan = (over: Partial<PlanItem> = {}): PlanItem =>
  ({
    storageLimitGB: 100,
    trafficLimitGB: 50,
    meetingMinutesLimit: 1000,
    tokenLimit: 30,
    usersLimit: 10,
    ...over
  }) as unknown as PlanItem

const pkg = (over: Partial<PackageItem> = {}): PackageItem =>
  ({ storageLimitGB: 200, ...over }) as unknown as PackageItem

const usage = (u: Record<string, number>): UsageStatus =>
  ({ usage: u, startTime: 0, updateTime: 0 }) satisfies UsageStatus

describe('calculateLimits — storage packages (mutually exclusive)', () => {
  it('no package: storage = base plan only', () => {
    const r = calculateLimits(plan({ storageLimitGB: 100 }))
    expect(r?.storageLimit).toBe(100 * GB)
  })

  it('one package: storage = base + package', () => {
    const r = calculateLimits(plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 200 }))
    expect(r?.storageLimit).toBe((100 + 200) * GB)
  })

  it('package with zero storage adds nothing', () => {
    const r = calculateLimits(plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 0 }))
    expect(r?.storageLimit).toBe(100 * GB)
  })

  it('subscription limit snapshot overrides config plan', () => {
    const tierSub = { limits: { storageLimitGB: 300 } } as unknown as SubscriptionData
    const r = calculateLimits(plan({ storageLimitGB: 100 }), undefined, tierSub)
    expect(r?.storageLimit).toBe(300 * GB)
  })

  it('package subscription snapshot overrides config package', () => {
    const pkgSub = { limits: { storageLimitGB: 500 } } as unknown as SubscriptionData
    const r = calculateLimits(plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 200 }), undefined, pkgSub)
    expect(r?.storageLimit).toBe((100 + 500) * GB)
  })

  it('returns undefined when no plan and no subscription (no fabricated fallback)', () => {
    expect(calculateLimits()).toBeUndefined()
  })
})

describe('checkUsageAgainstLimits — storage packages', () => {
  it('returns false when usageInfo is undefined', () => {
    expect(checkUsageAgainstLimits(undefined, plan())).toBe(false)
  })

  it('no package: exceeded when usage over base plan', () => {
    const u = usage({ storageBytes: 150 * GB })
    expect(checkUsageAgainstLimits(u, plan({ storageLimitGB: 100 }))).toBe(true)
  })

  it('one package: same usage now within base + package', () => {
    const u = usage({ storageBytes: 150 * GB })
    expect(checkUsageAgainstLimits(u, plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 200 }))).toBe(false)
  })

  it('one package: exceeded when usage over base + package', () => {
    const u = usage({ storageBytes: 350 * GB })
    expect(checkUsageAgainstLimits(u, plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 200 }))).toBe(true)
  })

  it('usage exactly at limit is not exceeded (strict >)', () => {
    const u = usage({ storageBytes: 300 * GB })
    expect(checkUsageAgainstLimits(u, plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 200 }))).toBe(false)
  })

  it('missing storageBytes counts as zero usage', () => {
    expect(checkUsageAgainstLimits(usage({}), plan({ storageLimitGB: 100 }))).toBe(false)
  })
})

const DAY = 24 * 60 * 60 * 1000

const PLAN_CONFIG = {
  plans: { trial: { free: false }, max: { free: false } },
  packages: {}
} as unknown as PlanConfig

const fakeAccountClient = (subscriptions: Subscription[]): any => ({
  getWorkspaceInfo: jest.fn().mockResolvedValue({ usageInfo: null }),
  getSubscriptions: jest.fn().mockResolvedValue(subscriptions)
})

const tier = (over: Partial<Subscription>): Subscription =>
  ({ type: SubscriptionType.Tier, providerData: {}, ...over }) as unknown as Subscription

describe('checkWorkspaceLimits — banner tier selection', () => {
  beforeAll(() => {
    ;(globalThis as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => PLAN_CONFIG })
  })

  beforeEach(() => {
    jest.mocked(setSubscriptionState).mockClear()
    ;(getAccountClientRaw as unknown as jest.Mock).mockReset()
  })

  it('a newer pending checkout draft does not override the live trial status', async () => {
    const trial = tier({
      id: 'trial',
      status: SubscriptionStatus.Trialing,
      plan: 'trial',
      trialEnd: Date.now() + 5 * DAY,
      createdOn: 100
    })
    const draft = tier({
      id: 'draft',
      status: SubscriptionStatus.PastDue,
      plan: 'trial',
      createdOn: 200,
      providerData: { pending: true }
    })
    ;(getAccountClientRaw as unknown as jest.Mock).mockReturnValue(fakeAccountClient([trial, draft]))

    await checkWorkspaceLimits()

    const call = jest.mocked(setSubscriptionState).mock.calls[0]
    expect(call[0]).toBe(trial)
    expect(call[1]).toBe(PLAN_CONFIG.plans.trial)
    expect(call[5]).toBe(trial)
  })

  it('a newer non-granting tier does not hide an older live trial', async () => {
    const trial = tier({
      id: 'trial',
      status: SubscriptionStatus.Trialing,
      plan: 'trial',
      trialEnd: Date.now() + 5 * DAY,
      createdOn: 100
    })
    const canceled = tier({ id: 'canceled', status: SubscriptionStatus.Canceled, plan: 'max', createdOn: 200 })
    ;(getAccountClientRaw as unknown as jest.Mock).mockReturnValue(fakeAccountClient([trial, canceled]))

    await checkWorkspaceLimits()

    expect(jest.mocked(setSubscriptionState).mock.calls[0][5]).toBe(trial)
  })

  it('without a granting tier, the latest tier regardless of status still drives the banner', async () => {
    const older = tier({ id: 'older', status: SubscriptionStatus.Canceled, plan: 'trial', createdOn: 100 })
    const newer = tier({ id: 'newer', status: SubscriptionStatus.Canceled, plan: 'max', createdOn: 200 })
    ;(getAccountClientRaw as unknown as jest.Mock).mockReturnValue(fakeAccountClient([older, newer]))

    await checkWorkspaceLimits()

    const call = jest.mocked(setSubscriptionState).mock.calls[0]
    expect(call[0]).toBeUndefined()
    expect(call[5]).toBe(newer)
  })

  // FUSIO-1279, the second half: with nothing granting a plan, the banner reads the workspace's own
  // plan state (an expired trial -> the free fallback). A newer checkout draft is not a plan state.
  it('a newer pending draft does not hide the expired trial that drives the free/overdue badge', async () => {
    const expiredTrial = tier({
      id: 'trial',
      status: SubscriptionStatus.Trialing,
      plan: 'trial',
      trialEnd: Date.now() - DAY,
      createdOn: 100
    })
    const draft = tier({
      id: 'draft',
      status: SubscriptionStatus.PastDue,
      plan: 'max',
      createdOn: 200,
      providerData: { pending: true }
    })
    ;(getAccountClientRaw as unknown as jest.Mock).mockReturnValue(fakeAccountClient([expiredTrial, draft]))

    await checkWorkspaceLimits()

    const call = jest.mocked(setSubscriptionState).mock.calls[0]
    // The expired trial grants nothing (the workspace runs on free)...
    expect(call[0]).toBeUndefined()
    // ...but it is still the tier that says so, not the draft created on top of it.
    expect(call[5]).toBe(expiredTrial)
  })

  it('a newer closed draft does not hide the expired trial either', async () => {
    const expiredTrial = tier({
      id: 'trial',
      status: SubscriptionStatus.Trialing,
      plan: 'trial',
      trialEnd: Date.now() - DAY,
      createdOn: 100
    })
    const closedDraft = tier({
      id: 'draft',
      status: SubscriptionStatus.Canceled,
      plan: 'max',
      createdOn: 200,
      providerData: { pending: false, draft: true }
    })
    ;(getAccountClientRaw as unknown as jest.Mock).mockReturnValue(fakeAccountClient([expiredTrial, closedDraft]))

    await checkWorkspaceLimits()

    expect(jest.mocked(setSubscriptionState).mock.calls[0][5]).toBe(expiredTrial)
  })

  it('a draft on its own is never the banner tier', async () => {
    const draft = tier({
      id: 'draft',
      status: SubscriptionStatus.PastDue,
      plan: 'max',
      createdOn: 100,
      providerData: { pending: true }
    })
    ;(getAccountClientRaw as unknown as jest.Mock).mockReturnValue(fakeAccountClient([draft]))

    await checkWorkspaceLimits()

    expect(jest.mocked(setSubscriptionState).mock.calls[0][5]).toBeUndefined()
  })
})
