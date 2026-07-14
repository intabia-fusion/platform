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

import type { PlanItem, PackageItem } from '@hcengineering/billing'
import type { SubscriptionData } from '@hcengineering/account-client'
import type { UsageStatus } from '@hcengineering/core'

import { isPlanConfig, calculateLimits, checkUsageAgainstLimits } from '../utils'

jest.mock('svelte/store', () => ({
  get: jest.fn(),
  writable: jest.fn(() => ({ subscribe: jest.fn(), set: jest.fn(), update: jest.fn() })),
  derived: jest.fn(() => ({ subscribe: jest.fn() }))
}))
jest.mock('@hcengineering/login', () => ({ default: {} }))
jest.mock('@hcengineering/platform', () => ({ getMetadata: jest.fn() }))
jest.mock('@hcengineering/presentation', () => ({ default: {}, getClient: jest.fn() }))
jest.mock('@hcengineering/billing', () => ({ default: {} }))
jest.mock('@hcengineering/contact', () => ({ default: {} }))
jest.mock('@hcengineering/ai-bot', () => ({ aiBotEmailSocialKey: 'ai-bot:social:email' }))
jest.mock('@hcengineering/account-client', () => ({
  getClient: jest.fn(),
  SubscriptionStatus: {},
  SubscriptionType: {}
}))
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
    expect(r.storageLimit).toBe(100 * GB)
  })

  it('one package: storage = base + package', () => {
    const r = calculateLimits(plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 200 }))
    expect(r.storageLimit).toBe((100 + 200) * GB)
  })

  it('package with zero storage adds nothing', () => {
    const r = calculateLimits(plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 0 }))
    expect(r.storageLimit).toBe(100 * GB)
  })

  it('subscription limit snapshot overrides config plan', () => {
    const tierSub = { limits: { storageLimitGB: 300 } } as unknown as SubscriptionData
    const r = calculateLimits(plan({ storageLimitGB: 100 }), undefined, tierSub)
    expect(r.storageLimit).toBe(300 * GB)
  })

  it('package subscription snapshot overrides config package', () => {
    const pkgSub = { limits: { storageLimitGB: 500 } } as unknown as SubscriptionData
    const r = calculateLimits(plan({ storageLimitGB: 100 }), pkg({ storageLimitGB: 200 }), undefined, pkgSub)
    expect(r.storageLimit).toBe((100 + 500) * GB)
  })

  it('falls back to defaults when nothing provided', () => {
    const r = calculateLimits()
    expect(r.storageLimit).toBe(10 * GB) // DEFAULT_STORAGE_GB, no package
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
