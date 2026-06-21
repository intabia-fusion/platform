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

import { isPlanConfig } from '../utils'

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
