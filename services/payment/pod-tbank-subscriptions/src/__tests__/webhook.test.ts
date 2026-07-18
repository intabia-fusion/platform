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

import { createServer as createHttpServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { SubscriptionStatus } from '@hcengineering/account-client'
import { createServer } from '../server'

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

function makeStorage (sub: any = null): any {
  return {
    getByProviderId: jest.fn().mockResolvedValue(sub),
    getById: jest.fn().mockResolvedValue(sub),
    getAll: jest.fn().mockResolvedValue(sub !== null ? [sub] : []),
    upsert: jest.fn().mockResolvedValue(undefined),
    logOperation: jest.fn().mockResolvedValue(undefined),
    releaseCheckout: jest.fn().mockResolvedValue(undefined),
    getAccountContact: jest.fn().mockResolvedValue({ email: null, locale: null }),
    getTransactionCount: jest.fn().mockResolvedValue(0)
  }
}

function makeTbank (verifyResult = true): any {
  return { verifyNotificationSignature: jest.fn().mockReturnValue(verifyResult) }
}

const baseConfig: any = {
  FrontUrl: 'https://front',
  TbankTerminalKey: 'term',
  TbankSkipWebhookVerification: false,
  PaymentUrl: 'https://payment'
}

const realFetch = global.fetch

// Start a real HTTP listener wrapping the express app so raw-body webhook parsing runs exactly as in prod.
async function startServer (config: any, tbank: any, storage: any): Promise<{ server: Server, url: string }> {
  const ctx: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  // createServer loads the shared plan-config on boot via fetch; stub only that one call, then restore
  // the real fetch so the test's own webhook POST goes over the wire.
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any
  const { app } = await createServer(ctx, config, tbank, storage)
  global.fetch = realFetch
  const server = createHttpServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return { server, url: `http://127.0.0.1:${port}/api/v1/webhooks/tbank` }
}

async function postWebhook (url: string, body: Record<string, any>): Promise<Response> {
  return await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('handleWebhook', () => {
  test('invalid token -> 200 OK, no upsert, no logOperation', async () => {
    const storage = makeStorage(activeSub)
    const tbank = makeTbank(false)
    const { server, url } = await startServer(baseConfig, tbank, storage)
    try {
      const res = await postWebhook(url, { PaymentId: 'pay_1', Status: 'CONFIRMED', Token: 'bad', Amount: 49900 })
      expect(res.status).toBe(200)
      expect(storage.upsert).not.toHaveBeenCalled()
      expect(storage.logOperation).not.toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  test('TbankSkipWebhookVerification=true -> processing proceeds without a valid token', async () => {
    const storage = makeStorage(null)
    const tbank = makeTbank(false)
    const { server, url } = await startServer({ ...baseConfig, TbankSkipWebhookVerification: true }, tbank, storage)
    try {
      const res = await postWebhook(url, { PaymentId: 'unknown_pay', Status: 'CONFIRMED', Amount: 100 })
      expect(res.status).toBe(200)
      // No subscription found for this PaymentId, but the webhook was audited (skip-verification let it through).
      expect(storage.logOperation).toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  test('repeat CONFIRMED, same PaymentId, already Active + non-pending -> idempotent, no upsert', async () => {
    const storage = makeStorage(activeSub)
    const tbank = makeTbank(true)
    const { server, url } = await startServer(baseConfig, tbank, storage)
    try {
      const res = await postWebhook(url, { PaymentId: 'pay_1', Status: 'CONFIRMED', Token: 'ok', Amount: 49900 })
      expect(res.status).toBe(200)
      expect(storage.upsert).not.toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  test('REJECTED on wasActive=true -> subscription marked PastDue and notify attempted', async () => {
    const storage = makeStorage(activeSub)
    const tbank = makeTbank(true)
    // Mail must be configured for notifyPaymentFailed to attempt anything (else it short-circuits).
    const mailConfig = { ...baseConfig, MailUrl: 'http://mail', MailFrom: 'noreply@x.com' }
    const { server, url } = await startServer(mailConfig, tbank, storage)
    try {
      const res = await postWebhook(url, { PaymentId: 'pay_1', Status: 'REJECTED', Token: 'ok', Amount: 49900 })
      expect(res.status).toBe(200)
      const pastDue = storage.upsert.mock.calls.find((c: any[]) => c[0].status === SubscriptionStatus.PastDue)
      expect(pastDue).toBeDefined()
      // notifyPaymentFailed reads account contact only when a notify attempt happens (wasActive branch).
      expect(storage.getAccountContact).toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  test('REJECTED on an already-PastDue sub -> upsert happens, but notify is NOT attempted again', async () => {
    const pastDueSub = { ...activeSub, status: SubscriptionStatus.PastDue }
    const storage = makeStorage(pastDueSub)
    const tbank = makeTbank(true)
    const { server, url } = await startServer(baseConfig, tbank, storage)
    try {
      const res = await postWebhook(url, { PaymentId: 'pay_1', Status: 'REJECTED', Token: 'ok', Amount: 49900 })
      expect(res.status).toBe(200)
      expect(storage.upsert).toHaveBeenCalled()
      expect(storage.getAccountContact).not.toHaveBeenCalled()
    } finally {
      server.close()
    }
  })

  test('DEADLINE_EXPIRED on an active (not pending-first) subscription does not cancel it', async () => {
    const storage = makeStorage(activeSub)
    const tbank = makeTbank(true)
    const { server, url } = await startServer(baseConfig, tbank, storage)
    try {
      const res = await postWebhook(url, { PaymentId: 'pay_1', Status: 'DEADLINE_EXPIRED', Token: 'ok', Amount: 49900 })
      expect(res.status).toBe(200)
      expect(storage.upsert).not.toHaveBeenCalled()
      expect(storage.releaseCheckout).toHaveBeenCalledWith('pay_1')
    } finally {
      server.close()
    }
  })

  test('CONFIRMED with pendingReplacement on another sub cancels the old subscription', async () => {
    const newSub = {
      ...activeSub,
      id: 'tbank_2',
      providerSubscriptionId: 'pay_2',
      status: SubscriptionStatus.PastDue,
      providerData: { pending: true, paymentId: 'pay_2' }
    }
    const oldSub = {
      ...activeSub,
      id: 'tbank_1',
      providerSubscriptionId: 'pay_1',
      providerData: { ...activeSub.providerData, pendingReplacement: true }
    }
    const storage = makeStorage(newSub)
    storage.getAll = jest.fn().mockResolvedValue([oldSub, newSub])
    const tbank = makeTbank(true)
    const { server, url } = await startServer(baseConfig, tbank, storage)
    try {
      const res = await postWebhook(url, { PaymentId: 'pay_2', Status: 'CONFIRMED', Token: 'ok', Amount: 49900 })
      expect(res.status).toBe(200)
      const canceled = storage.upsert.mock.calls.find((c: any[]) => c[0].id === 'tbank_1')
      expect(canceled).toBeDefined()
      expect(canceled[0].status).toBe(SubscriptionStatus.Canceled)
    } finally {
      server.close()
    }
  })
})
