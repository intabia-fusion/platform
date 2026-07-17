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

import { handleUpdatePlan } from '../server'

// A tier subscription of `business`, 3 seats, monthly (the seat-change starting point).
const baseSub: any = {
  id: 'tbank_100',
  provider: 'tbank',
  providerSubscriptionId: '100',
  workspaceUuid: 'ws-1',
  accountUuid: 'acc-1',
  type: 'tier',
  plan: 'business',
  status: 'active',
  amount: 270000,
  providerData: { quantity: 3, period: 'monthly' }
}

const plans = { 'business@tier': { amount: 90000, yearlyDiscount: 15 } } as any

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

function makeCtx (): any {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}

function makeStorage (claim: any, sub = baseSub): any {
  return {
    getById: jest.fn().mockResolvedValue(sub),
    getByProviderId: jest.fn().mockResolvedValue(null),
    getTransactionCount: jest.fn().mockResolvedValue(1),
    claimCheckout: jest.fn().mockResolvedValue(claim),
    setCheckoutPayment: jest.fn().mockResolvedValue(undefined),
    heartbeatCharge: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    reclaimStaleCharge: jest.fn().mockResolvedValue(false)
  }
}

const tbank: any = {
  initPayment: jest.fn().mockResolvedValue({ PaymentId: 999, PaymentURL: 'https://tbank/pay/999' })
}
const config: any = { TbankTerminalKey: 'term' }

// Drive handleUpdatePlan with a storage stub + request body; returns the response recorder.
async function run (storage: any, body: any, subPlans = plans): Promise<any> {
  const res = makeRes()
  const req: any = { params: { id: 'tbank_100' }, body }
  await handleUpdatePlan(makeCtx(), config, tbank, storage, subPlans, req, res)
  return res
}

beforeEach(() => {
  tbank.initPayment.mockClear()
})

describe('handleUpdatePlan claim guard', () => {
  it('rejects a true no-op (same plan+seats+period) with 400', async () => {
    const storage = makeStorage({ claimed: true, intentId: 'i1' })
    const res = await run(storage, { plan: 'business', quantity: 3, period: 'monthly' })
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Already on this plan')
    expect(storage.claimCheckout).not.toHaveBeenCalled()
  })

  it('lets a same-plan seat change through: winner opens a checkout', async () => {
    const storage = makeStorage({ claimed: true, intentId: 'i1' })
    const res = await run(storage, { plan: 'business', quantity: 6, period: 'monthly' })
    expect(tbank.initPayment).toHaveBeenCalledTimes(1)
    expect(res.body.checkoutUrl).toBe('https://tbank/pay/999')
    // Old sub marked pending-replacement, new pending sub created.
    const marked = storage.upsert.mock.calls.find((c: any[]) => c[0].providerData?.pendingReplacement === true)
    expect(marked).toBeDefined()
  })

  it('loser with the SAME order reuses the winner URL (no second charge)', async () => {
    const storage = makeStorage({
      claimed: false,
      intentId: 'i1',
      heartbeatAt: Date.now(),
      orderFingerprint: 'business:6:monthly',
      paymentUrl: 'https://tbank/pay/winner',
      paymentId: '500',
      createdOn: Date.now()
    })
    const res = await run(storage, { plan: 'business', quantity: 6, period: 'monthly' })
    expect(tbank.initPayment).not.toHaveBeenCalled() // NO second checkout
    expect(res.body.checkoutUrl).toBe('https://tbank/pay/winner')
  })

  it('loser with a DIFFERENT order and no force gets 409 other_checkout_active', async () => {
    const storage = makeStorage({
      claimed: false,
      intentId: 'i1',
      heartbeatAt: Date.now(),
      orderFingerprint: 'business:9:monthly', // a different seat count is already being paid
      paymentUrl: 'https://tbank/pay/other',
      paymentId: '501',
      createdOn: Date.now()
    })
    const res = await run(storage, { plan: 'business', quantity: 6, period: 'monthly' })
    expect(res.statusCode).toBe(409)
    expect(res.body.reason).toBe('other_checkout_active')
    expect(tbank.initPayment).not.toHaveBeenCalled()
  })

  it('loser while the winner has not written the URL yet gets 409 in_flight', async () => {
    const storage = makeStorage({ claimed: false, intentId: 'i1', heartbeatAt: Date.now() })
    const res = await run(storage, { plan: 'business', quantity: 6, period: 'monthly' })
    expect(res.statusCode).toBe(409)
    expect(res.body.reason).toBe('in_flight')
    expect(tbank.initPayment).not.toHaveBeenCalled()
  })

  it('a package change is guarded by the same claim (type=package)', async () => {
    const pkgSub = { ...baseSub, type: 'package', plan: '100gb', providerData: { period: 'monthly' } }
    const storage = makeStorage({ claimed: true, intentId: 'i1' }, pkgSub)
    const res = await run(storage, { plan: '500gb' }, { '500gb@package': { amount: 500000, yearlyDiscount: 0 } })
    // Claim uses the subscription's type — package, independent of the tier checkout key.
    expect(storage.claimCheckout).toHaveBeenCalledWith('ws-1', 'package', expect.any(String))
    expect(res.body.checkoutUrl).toBe('https://tbank/pay/999')
  })
})
