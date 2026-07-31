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

import { SubscriptionStatus } from '@hcengineering/account-client'
import { handleCancelSubscription, handleRetryPayment } from '../server'
import { SubscriptionStorage } from '../storage'

const activeSub: any = {
  id: 'tbank_1',
  provider: 'tbank',
  providerSubscriptionId: 'pay_1',
  workspaceUuid: 'ws-1',
  accountUuid: 'acc-1',
  type: 'tier',
  plan: 'business',
  status: SubscriptionStatus.Active,
  amount: 49900,
  periodEnd: Date.now() + 1000000,
  // cardId + customerKey are required or removeSubscriptionCard returns before calling tbank.
  providerData: {
    rebillId: 'reb_1',
    period: 'monthly',
    pending: false,
    paymentId: 'pay_1',
    cardId: 'card_1',
    customerKey: 'cust_1'
  }
}

function makeStorage (sub: any): any {
  return {
    getById: jest.fn().mockResolvedValue(sub),
    getByProviderId: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
    logOperation: jest.fn().mockResolvedValue(undefined)
  }
}

function makeRes (): any {
  const res: any = { statusCode: 200, body: undefined }
  res.status = (c: number) => {
    res.statusCode = c
    return res
  }
  res.json = (b: any) => {
    res.body = b
    return res
  }
  return res
}

const tbank: any = { removeCard: jest.fn().mockResolvedValue({ Success: true }) }
const newCtx = (): any => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })

async function run (sub: any): Promise<{ res: any, storage: any }> {
  const storage = makeStorage(sub)
  const res = makeRes()
  await handleCancelSubscription(newCtx(), tbank, storage, { params: { id: 'tbank_1' } } as any, res)
  return { res, storage }
}

describe('handleCancelSubscription', () => {
  // tbank is shared across cases, so per-test removeCard assertions need a clean slate.
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Active sub -> scheduled cancel, willCancelAt = periodEnd', async () => {
    const { res, storage } = await run(activeSub)
    expect(res.statusCode).toBe(200)
    expect(storage.upsert).toHaveBeenCalled()
    expect(res.body.willCancelAt).toBe(activeSub.periodEnd)
    expect(res.body.canceledAt).toBeDefined()
  })

  it('Active sub -> card kept for a possible uncancel', async () => {
    await run(activeSub)
    expect(tbank.removeCard).not.toHaveBeenCalled()
  })

  // An unpaid sub has no paid period left: scheduling the cancel at a past periodEnd would leave it
  // Active (= paid plan for free) until the scheduler catches up.
  it('PastDue sub (after refund/failed charge) -> immediate Canceled, no willCancelAt', async () => {
    const pastDue = {
      ...activeSub,
      status: SubscriptionStatus.PastDue,
      periodEnd: Date.now() - 1000,
      providerData: { ...activeSub.providerData, status: 'REFUNDED', pending: false, retryAttempt: 2 }
    }
    const { res, storage } = await run(pastDue)
    expect(res.statusCode).toBe(200)
    expect(storage.upsert).toHaveBeenCalled()
    expect(res.body.status).toBe(SubscriptionStatus.Canceled)
    expect(res.body.willCancelAt).toBeUndefined()
    expect(res.body.canceledAt).toBeDefined()
  })

  it('ReadOnly sub (grace expired) -> immediate Canceled, no willCancelAt', async () => {
    const readOnly = {
      ...activeSub,
      status: SubscriptionStatus.ReadOnly,
      periodEnd: Date.now() - 1000,
      providerData: { ...activeSub.providerData, status: 'GRACE_EXPIRED', pending: false, retryAttempt: 3 }
    }
    const { res } = await run(readOnly)
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe(SubscriptionStatus.Canceled)
    expect(res.body.willCancelAt).toBeUndefined()
  })

  // pod-payment keys the free-plan fallback off (status=Canceled, providerData.status='CANCELED')
  // in isFinalizedUserCancel — both fields are required or no downgrade to free happens.
  it.each([
    ['PastDue', SubscriptionStatus.PastDue],
    ['ReadOnly', SubscriptionStatus.ReadOnly]
  ])('%s cancel -> providerData.status CANCELED (free fallback trigger)', async (_name, status) => {
    const { res } = await run({ ...activeSub, status, providerData: { ...activeSub.providerData, pending: false } })
    expect(res.body.providerData.status).toBe('CANCELED')
  })

  // Keeping dunning counters would let a later retry resume charging a canceled sub.
  it('unpaid cancel -> dunning state cleared', async () => {
    const pastDue = {
      ...activeSub,
      status: SubscriptionStatus.PastDue,
      providerData: { ...activeSub.providerData, pending: false, retryAttempt: 2, retryAfter: Date.now() + 1000 }
    }
    const { res } = await run(pastDue)
    expect(res.body.providerData.retryAttempt).toBeUndefined()
    expect(res.body.providerData.retryAfter).toBeUndefined()
    expect(res.body.providerData.pending).toBeUndefined()
  })

  it.each([
    ['PastDue', SubscriptionStatus.PastDue],
    ['ReadOnly', SubscriptionStatus.ReadOnly]
  ])('%s cancel -> card removed (scheduler will never finalize this row)', async (_name, status) => {
    await run({ ...activeSub, status, providerData: { ...activeSub.providerData, pending: false } })
    expect(tbank.removeCard).toHaveBeenCalled()
  })

  it('already Canceled -> idempotent 200 with current sub, no upsert', async () => {
    const canceled = { ...activeSub, status: SubscriptionStatus.Canceled }
    const { res, storage } = await run(canceled)
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe(SubscriptionStatus.Canceled)
    expect(storage.upsert).not.toHaveBeenCalled()
    expect(storage.logOperation).not.toHaveBeenCalled()
  })

  it('pending first-payment draft -> 400 not cancelable', async () => {
    const draft = {
      ...activeSub,
      status: SubscriptionStatus.PastDue,
      providerData: { ...activeSub.providerData, pending: true }
    }
    const { res, storage } = await run(draft)
    expect(res.statusCode).toBe(400)
    expect(storage.upsert).not.toHaveBeenCalled()
  })

  it('unknown id -> 404', async () => {
    const { res } = await run(null)
    expect(res.statusCode).toBe(404)
  })

  // The scheduler must not pick a canceled row back up for a renewal charge.
  it('canceled unpaid sub -> needsRenewal false', async () => {
    const pastDue = {
      ...activeSub,
      status: SubscriptionStatus.PastDue,
      periodEnd: Date.now() - 1000,
      providerData: { ...activeSub.providerData, pending: false, retryAttempt: 1, retryAfter: Date.now() - 1 }
    }
    // Sanity: it is renewable before the cancel, so the assertion below is meaningful.
    expect(SubscriptionStorage.needsRenewal(pastDue, Date.now())).toBe(true)

    const { res } = await run(pastDue)
    expect(SubscriptionStorage.needsRenewal(res.body, Date.now())).toBe(false)
  })

  // Manual retry stays limited to unpaid statuses — a canceled sub must not be chargeable.
  it('canceled sub -> retry payment rejected', async () => {
    const storage = makeStorage({ ...activeSub, status: SubscriptionStatus.Canceled })
    const res = makeRes()
    await handleRetryPayment(newCtx(), {} as any, tbank, storage, { params: { id: 'tbank_1' } } as any, res)
    expect(res.statusCode).toBe(400)
    expect(storage.upsert).not.toHaveBeenCalled()
  })
})
