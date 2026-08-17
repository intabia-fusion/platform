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
import { expireTrials, startTrialExpiry } from '../trialExpiry'

const DAY = 24 * 60 * 60 * 1000

describe('expireTrials', () => {
  let ctx: any
  let createFree: jest.Mock

  const trial = (workspaceUuid: string, trialEnd: number | undefined): any => ({
    id: `trial-${workspaceUuid}`,
    workspaceUuid,
    provider: 'trial',
    type: SubscriptionType.Tier,
    status: SubscriptionStatus.Trialing,
    plan: 'business',
    trialEnd
  })

  const tier = (status: SubscriptionStatus, trialEnd?: number): any => ({
    type: SubscriptionType.Tier,
    status,
    trialEnd
  })

  const client = (trials: any[], byWorkspace: Record<string, any[]> = {}): any => ({
    getSubscriptionsByProvider: jest.fn().mockResolvedValue(trials),
    getSubscriptions: jest.fn(async (ws: string) => byWorkspace[ws] ?? []),
    upsertSubscription: jest.fn().mockResolvedValue(undefined)
  })

  beforeEach(() => {
    ctx = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    createFree = jest.fn().mockResolvedValue(undefined)
  })

  it('queries only trialing subscriptions of the trial provider', async () => {
    const accountClient = client([])
    await expireTrials(ctx, accountClient, createFree)

    expect(accountClient.getSubscriptionsByProvider).toHaveBeenCalledWith('trial', [SubscriptionStatus.Trialing])
  })

  it('cancels an expired trial and moves the workspace to the free plan', async () => {
    const accountClient = client([trial('ws-1', Date.now() - DAY)], {
      'ws-1': [tier(SubscriptionStatus.Trialing, Date.now() - DAY)]
    })

    await expireTrials(ctx, accountClient, createFree)

    expect(accountClient.upsertSubscription).toHaveBeenCalledTimes(1)
    expect(accountClient.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'trial-ws-1',
        status: SubscriptionStatus.Canceled,
        canceledAt: expect.any(Number),
        providerData: expect.objectContaining({ status: 'TRIAL_EXPIRED' })
      })
    )
    expect(createFree).toHaveBeenCalledTimes(1)
    expect(createFree).toHaveBeenCalledWith('ws-1')
  })

  it('never marks the trial as a finalized user cancel (would double-provision free via the queue)', async () => {
    const accountClient = client([trial('ws-1', Date.now() - DAY)], {
      'ws-1': [tier(SubscriptionStatus.Trialing, Date.now() - DAY)]
    })

    await expireTrials(ctx, accountClient, createFree)

    const written = accountClient.upsertSubscription.mock.calls[0][0]
    expect(written.providerData.status).not.toBe('CANCELED')
  })

  it('cancels the expired trial even without a free plan configured', async () => {
    const accountClient = client([trial('ws-1', Date.now() - DAY)], {
      'ws-1': [tier(SubscriptionStatus.Trialing, Date.now() - DAY)]
    })

    await expireTrials(ctx, accountClient, undefined)

    expect(accountClient.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: SubscriptionStatus.Canceled })
    )
  })

  it('leaves a live trial alone', async () => {
    const accountClient = client([trial('ws-1', Date.now() + DAY)])

    await expireTrials(ctx, accountClient, createFree)

    expect(accountClient.upsertSubscription).not.toHaveBeenCalled()
    expect(createFree).not.toHaveBeenCalled()
    // A live trial is skipped before the re-read — no extra account round-trip.
    expect(accountClient.getSubscriptions).not.toHaveBeenCalled()
  })

  it('skips a trial without trialEnd instead of expiring it', async () => {
    const accountClient = client([trial('ws-1', undefined)])

    await expireTrials(ctx, accountClient, createFree)

    expect(accountClient.upsertSubscription).not.toHaveBeenCalled()
    expect(createFree).not.toHaveBeenCalled()
  })

  it('skips when the workspace already has a granting tier (paid in the meantime)', async () => {
    const accountClient = client([trial('ws-1', Date.now() - DAY)], {
      'ws-1': [tier(SubscriptionStatus.Active)]
    })

    await expireTrials(ctx, accountClient, createFree)

    expect(accountClient.upsertSubscription).not.toHaveBeenCalled()
    expect(createFree).not.toHaveBeenCalled()
  })

  it('skips when free was already provisioned (idempotent across pods)', async () => {
    const accountClient = client([trial('ws-1', Date.now() - DAY)], {
      // Another pod won the race: the trial is Canceled and free is Active.
      'ws-1': [tier(SubscriptionStatus.Canceled), tier(SubscriptionStatus.Active)]
    })

    await expireTrials(ctx, accountClient, createFree)

    expect(accountClient.upsertSubscription).not.toHaveBeenCalled()
    expect(createFree).not.toHaveBeenCalled()
  })

  it('keeps sweeping after one workspace fails', async () => {
    const expiredAt = Date.now() - DAY
    const accountClient = client([trial('ws-1', expiredAt), trial('ws-2', expiredAt)], {
      'ws-1': [tier(SubscriptionStatus.Trialing, expiredAt)],
      'ws-2': [tier(SubscriptionStatus.Trialing, expiredAt)]
    })
    createFree.mockRejectedValueOnce(new Error('no owner'))

    await expireTrials(ctx, accountClient, createFree)

    expect(createFree).toHaveBeenCalledTimes(2)
    expect(ctx.error).toHaveBeenCalledWith('failed to expire trial', expect.objectContaining({ workspace: 'ws-1' }))
  })

  it('leaves the trial canceled when the free tier cannot be created (no owner)', async () => {
    const expiredAt = Date.now() - DAY
    const accountClient = client([trial('ws-1', expiredAt)], {
      'ws-1': [tier(SubscriptionStatus.Trialing, expiredAt)]
    })
    createFree.mockRejectedValueOnce(new Error('no owner'))

    await expireTrials(ctx, accountClient, createFree)

    // Cancel lands first, so a failing free step cannot resurrect the expired trial.
    expect(accountClient.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: SubscriptionStatus.Canceled })
    )
  })
})

describe('startTrialExpiry', () => {
  let ctx: any

  beforeEach(() => {
    ctx = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('sweeps immediately and then on the interval, and stops on close', () => {
    const accountClient = {
      getSubscriptionsByProvider: jest.fn().mockResolvedValue([]),
      getSubscriptions: jest.fn().mockResolvedValue([]),
      upsertSubscription: jest.fn().mockResolvedValue(undefined)
    } as any
    const createFree = jest.fn().mockResolvedValue(undefined)

    const stop = startTrialExpiry(ctx, accountClient, createFree, 30)
    expect(accountClient.getSubscriptionsByProvider).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(30 * 60 * 1000)
    expect(accountClient.getSubscriptionsByProvider).toHaveBeenCalledTimes(2)

    stop()
    jest.advanceTimersByTime(30 * 60 * 1000)
    expect(accountClient.getSubscriptionsByProvider).toHaveBeenCalledTimes(2)
  })
})
