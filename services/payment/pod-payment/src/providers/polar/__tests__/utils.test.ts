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

import { transformPolarSubscriptionToData } from '../utils'

function baseSubscription (overrides: any = {}): any {
  return {
    id: 'sub_1',
    status: 'active',
    customer: { externalId: 'account-uuid' },
    metadata: {
      workspaceUuid: 'workspace-uuid',
      subscriptionType: 'tier',
      subscriptionPlan: 'common'
    },
    currentPeriodStart: '2026-01-01T00:00:00Z',
    currentPeriodEnd: '2026-02-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    modifiedAt: null,
    ...overrides
  }
}

describe('transformPolarSubscriptionToData', () => {
  describe('amount-based plan boundaries', () => {
    test('below 59900 maps to start', () => {
      const result = transformPolarSubscriptionToData(baseSubscription({ amount: 59899 }))
      expect(result?.plan).toBe('start')
    })

    test('exactly 59900 maps to standard', () => {
      const result = transformPolarSubscriptionToData(baseSubscription({ amount: 59900 }))
      expect(result?.plan).toBe('standard')
    })

    test('exactly 99900 maps to business', () => {
      const result = transformPolarSubscriptionToData(baseSubscription({ amount: 99900 }))
      expect(result?.plan).toBe('business')
    })

    test('above 99900 maps to business', () => {
      const result = transformPolarSubscriptionToData(baseSubscription({ amount: 150000 }))
      expect(result?.plan).toBe('business')
    })
  })

  describe('mapPolarStatus', () => {
    test.each(['unpaid', 'incomplete', 'incomplete_expired'])('%s does not activate unpaid subscription', (status) => {
      const result = transformPolarSubscriptionToData(baseSubscription({ status }))
      expect(result).toBeNull()
    })

    test('active status is kept', () => {
      const result = transformPolarSubscriptionToData(baseSubscription({ status: 'active' }))
      expect(result).not.toBeNull()
      expect(result?.status).toBe('active')
    })
  })

  describe('missing metadata', () => {
    test('missing workspaceUuid returns null', () => {
      const sub = baseSubscription()
      delete sub.metadata.workspaceUuid
      expect(transformPolarSubscriptionToData(sub)).toBeNull()
    })

    test('missing accountUuid returns null', () => {
      const sub = baseSubscription({ customer: {} })
      expect(transformPolarSubscriptionToData(sub)).toBeNull()
    })

    test('missing subscriptionType returns null', () => {
      const sub = baseSubscription()
      delete sub.metadata.subscriptionType
      expect(transformPolarSubscriptionToData(sub)).toBeNull()
    })
  })
})
