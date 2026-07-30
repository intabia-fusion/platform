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
import { handleCancelSubscription } from '../server'

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
  providerData: { rebillId: 'reb_1', period: 'monthly', pending: false, paymentId: 'pay_1' }
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
  it('Active sub -> scheduled cancel, willCancelAt = periodEnd', async () => {
    const { res, storage } = await run(activeSub)
    expect(res.statusCode).toBe(200)
    expect(storage.upsert).toHaveBeenCalled()
    expect(res.body.willCancelAt).toBe(activeSub.periodEnd)
    expect(res.body.canceledAt).toBeDefined()
  })

  it('PastDue sub (after refund/failed charge) -> cancelable, not 400', async () => {
    const pastDue = {
      ...activeSub,
      status: SubscriptionStatus.PastDue,
      providerData: { ...activeSub.providerData, status: 'REFUNDED', pending: false }
    }
    const { res, storage } = await run(pastDue)
    expect(res.statusCode).toBe(200)
    expect(storage.upsert).toHaveBeenCalled()
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
})
