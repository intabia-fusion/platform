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

import { SubscriptionStatus, SubscriptionType } from '@hcengineering/account-client'
import { backfillWindowLimits } from '../windowBackfill'

describe('backfillWindowLimits', () => {
  let ctx: any

  const sub = (id: string, limits?: any, plan = 'business'): any => ({
    id,
    workspaceUuid: `ws-${id}`,
    provider: 'tbank',
    type: SubscriptionType.Tier,
    status: SubscriptionStatus.Active,
    plan,
    limits,
    providerData: { quantity: 3 }
  })

  const client = (subs: any[]): any => ({
    getSubscriptionsByProvider: jest.fn(async () => subs),
    upsertSubscriptionsBulk: jest.fn(async (batch: any[]) => batch.map((s) => ({ id: s.id, ok: true })))
  })

  // Mirrors the pod's resolveLimits: per-seat plans scale the window by paid seats.
  const resolve = (s: any): any =>
    s.plan === 'unknown' ? undefined : { usersLimit: 3, windowMonthLimit: 300000 * (s.providerData?.quantity ?? 1) }

  beforeEach(() => {
    ctx = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
  })

  it('fills the window for subscriptions that have none', async () => {
    const accountClient = client([sub('a', { usersLimit: 3 })])

    const updated = await backfillWindowLimits(ctx, accountClient, resolve)

    expect(updated).toBe(1)
    const written = accountClient.upsertSubscriptionsBulk.mock.calls[0][0]
    expect(written[0].limits.windowMonthLimit).toBe(900000)
  })

  it('leaves an existing window alone, including a deliberate zero', async () => {
    const accountClient = client([
      sub('a', { usersLimit: 3, windowMonthLimit: 1000000 }),
      sub('b', { usersLimit: 3, windowMonthLimit: 0 })
    ])

    const updated = await backfillWindowLimits(ctx, accountClient, resolve)

    expect(updated).toBe(0)
    expect(accountClient.upsertSubscriptionsBulk).not.toHaveBeenCalled()
  })

  it('skips a plan the config no longer knows', async () => {
    const accountClient = client([sub('a', undefined, 'unknown')])

    const updated = await backfillWindowLimits(ctx, accountClient, resolve)

    expect(updated).toBe(0)
    expect(accountClient.upsertSubscriptionsBulk).not.toHaveBeenCalled()
  })

  it('asks for every provider, not just one', async () => {
    const accountClient = client([])

    await backfillWindowLimits(ctx, accountClient, resolve)

    expect(accountClient.getSubscriptionsByProvider).toHaveBeenCalledWith(undefined, [
      SubscriptionStatus.Active,
      SubscriptionStatus.PastDue,
      SubscriptionStatus.Trialing
    ])
  })

  it('reports a failed write instead of counting it', async () => {
    const accountClient = client([sub('a'), sub('b')])
    accountClient.upsertSubscriptionsBulk = jest.fn(async (batch: any[]) =>
      batch.map((s) => ({ id: s.id, ok: s.id !== 'a', error: s.id === 'a' ? 'boom' : undefined }))
    )

    const updated = await backfillWindowLimits(ctx, accountClient, resolve)

    expect(updated).toBe(1)
    expect(ctx.error).toHaveBeenCalled()
  })
})
