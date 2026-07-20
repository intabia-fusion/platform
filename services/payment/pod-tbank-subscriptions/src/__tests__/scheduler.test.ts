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
import { startScheduler } from '../scheduler'

const NOW = Date.UTC(2026, 6, 19)

const baseSub: any = {
  id: 'tbank_1',
  provider: 'tbank',
  providerSubscriptionId: '1',
  workspaceUuid: 'ws-1',
  accountUuid: 'acc-1',
  type: 'tier',
  plan: 'business',
  status: SubscriptionStatus.Active,
  amount: 49900,
  periodEnd: NOW - 1000,
  providerData: { rebillId: 'reb_1', period: 'monthly' }
}

function makeCtx (): any {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}

// Only getCandidates is driven by the scheduler cycle; other calls in cleanup/grace/scheduledCancel
// loops read the same list, so an empty result there keeps those cycles inert for these tests.
function makeStorage (sub: any, claim: any, extra: Partial<Record<string, any>> = {}): any {
  return {
    getCandidates: jest.fn().mockResolvedValue([sub]),
    getById: jest.fn().mockResolvedValue(sub),
    claimRenewal: jest.fn().mockResolvedValue(claim),
    reclaimStaleCharge: jest.fn().mockResolvedValue(false),
    markCharge: jest.fn().mockResolvedValue(undefined),
    heartbeatCharge: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
    logOperation: jest.fn().mockResolvedValue(undefined),
    getAccountContact: jest.fn().mockResolvedValue({ email: null, locale: null }),
    ...extra
  }
}

const config: any = { GracePeriodDays: 7 }

// Start the scheduler, flush the immediate renewal-cycle microtasks, then close it.
async function runOneTick (tbank: any, storage: any): Promise<void> {
  const handle = startScheduler(makeCtx(), tbank, storage, config, 60)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await handle.close()
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick'] })
  jest.setSystemTime(NOW)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('scheduler renewal claim outcomes', () => {
  test('claim lost, status charged -> chargeRecurrent not called, no upsert (already renewed elsewhere)', async () => {
    const storage = makeStorage(baseSub, { claimed: false, status: 'charged', intentId: 'i1' })
    const tbank: any = { chargeRecurrent: jest.fn() }
    await runOneTick(tbank, storage)
    expect(tbank.chargeRecurrent).not.toHaveBeenCalled()
    expect(storage.upsert).not.toHaveBeenCalled()
    expect(storage.markCharge).not.toHaveBeenCalled()
  })

  test('claim lost, status pending + fresh heartbeat -> skip, no charge', async () => {
    const storage = makeStorage(baseSub, {
      claimed: false,
      status: 'pending',
      intentId: 'i1',
      heartbeatAt: NOW - 500 // well inside LEASE_TIMEOUT_MS (10s)
    })
    const tbank: any = { chargeRecurrent: jest.fn() }
    await runOneTick(tbank, storage)
    expect(tbank.chargeRecurrent).not.toHaveBeenCalled()
    expect(storage.reclaimStaleCharge).not.toHaveBeenCalled()
    expect(storage.upsert).not.toHaveBeenCalled()
  })

  test('claim lost, stale pending lease, reclaim wins -> markCharge charged, renewed, no chargeRecurrent', async () => {
    const storage = makeStorage(
      baseSub,
      { claimed: false, status: 'pending', intentId: 'i1', heartbeatAt: NOW - 20000 },
      { reclaimStaleCharge: jest.fn().mockResolvedValue(true) }
    )
    const tbank: any = { chargeRecurrent: jest.fn() }
    await runOneTick(tbank, storage)
    expect(tbank.chargeRecurrent).not.toHaveBeenCalled()
    expect(storage.markCharge).toHaveBeenCalledWith('i1', 'charged')
    const renewed = storage.upsert.mock.calls.find((c: any[]) => c[0].providerData?.status === 'ACTIVE')
    expect(renewed).toBeDefined()
  })

  test('claim lost, status pending + stale lease, reclaim loses -> nothing changes', async () => {
    const storage = makeStorage(
      baseSub,
      { claimed: false, status: 'pending', intentId: 'i1', heartbeatAt: NOW - 20000 },
      { reclaimStaleCharge: jest.fn().mockResolvedValue(false) }
    )
    const tbank: any = { chargeRecurrent: jest.fn() }
    await runOneTick(tbank, storage)
    expect(tbank.chargeRecurrent).not.toHaveBeenCalled()
    expect(storage.markCharge).not.toHaveBeenCalled()
    expect(storage.upsert).not.toHaveBeenCalled()
  })

  test('successful chargeRecurrent -> markCharge charged, logOperation success, upsert renewed', async () => {
    const storage = makeStorage(baseSub, { claimed: true, status: 'new', intentId: 'i1' })
    const tbank: any = {
      initPayment: jest.fn().mockResolvedValue({ Success: true, PaymentId: 'init_1' }),
      chargeRecurrent: jest.fn().mockResolvedValue({ Success: true, PaymentId: 'pay_1' })
    }
    await runOneTick(tbank, storage)
    expect(storage.markCharge).toHaveBeenCalledWith('i1', 'charged', 'pay_1')
    const logged = storage.logOperation.mock.calls.find((c: any[]) => c[0].operation === 'charge_recurrent')
    expect(logged[0].status).toBe('success')
    expect(logged[0].raw.attempt).toBe(1)
    const renewed = storage.upsert.mock.calls.find((c: any[]) => c[0].providerData?.status === 'ACTIVE')
    expect(renewed).toBeDefined()
  })

  test('chargeRecurrent Success=false -> markCharge failed, logOperation failed, PastDue upsert, notify', async () => {
    const storage = makeStorage(baseSub, { claimed: true, status: 'new', intentId: 'i1' })
    const tbank: any = {
      initPayment: jest.fn().mockResolvedValue({ Success: true, PaymentId: 'init_1' }),
      chargeRecurrent: jest.fn().mockResolvedValue({ Success: false, ErrorCode: '111', Message: 'declined' })
    }
    global.fetch = jest.fn() as any // notifyPaymentFailed short-circuits: config has no MailUrl, so no HTTP happens
    await runOneTick(tbank, storage)
    expect(storage.markCharge).toHaveBeenCalledWith('i1', 'failed')
    const logged = storage.logOperation.mock.calls.find((c: any[]) => c[0].operation === 'charge_recurrent')
    expect(logged[0].status).toBe('failed')
    expect(logged[0].raw.attempt).toBe(1)
    const failed = storage.upsert.mock.calls.find((c: any[]) => c[0].providerData?.status === 'CHARGE_FAILED')
    expect(failed).toBeDefined()
    expect(failed[0].status).toBe(SubscriptionStatus.PastDue)
  })

  test('chargeRecurrent throws -> markCharge not called, status unknown logged, CHARGE_ERROR upsert', async () => {
    const storage = makeStorage(baseSub, { claimed: true, status: 'new', intentId: 'i1' })
    const tbank: any = {
      initPayment: jest.fn().mockResolvedValue({ Success: true, PaymentId: 'init_1' }),
      chargeRecurrent: jest.fn().mockRejectedValue(new Error('timeout'))
    }
    await runOneTick(tbank, storage)
    expect(storage.markCharge).not.toHaveBeenCalled()
    const logged = storage.logOperation.mock.calls.find((c: any[]) => c[0].operation === 'charge_recurrent')
    expect(logged[0].status).toBe('unknown')
    expect(logged[0].raw).toMatchObject({ message: 'timeout', attempt: 1 })
    const errored = storage.upsert.mock.calls.find((c: any[]) => c[0].providerData?.status === 'CHARGE_ERROR')
    expect(errored).toBeDefined()
  })

  test('heartbeat interval is cleared after the charge settles (no leaked timer)', async () => {
    const storage = makeStorage(baseSub, { claimed: true, status: 'new', intentId: 'i1' })
    const tbank: any = {
      initPayment: jest.fn().mockResolvedValue({ Success: true, PaymentId: 'init_1' }),
      chargeRecurrent: jest.fn().mockResolvedValue({ Success: true, PaymentId: 'pay_1' })
    }
    const setSpy = jest.spyOn(global, 'setInterval')
    const clearSpy = jest.spyOn(global, 'clearInterval')
    await runOneTick(tbank, storage)
    // Every interval id created (heartbeat + the 4 scheduler timers) was passed to clearInterval by close().
    const createdIds = setSpy.mock.results.map((r) => r.value)
    const clearedIds = clearSpy.mock.calls.map((c) => c[0])
    for (const id of createdIds) expect(clearedIds).toContain(id)
    setSpy.mockRestore()
    clearSpy.mockRestore()
  })
})
