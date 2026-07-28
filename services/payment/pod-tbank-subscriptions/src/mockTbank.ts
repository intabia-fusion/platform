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

import type { Express } from 'express'
import type TbankPayments from 'tbank-payments'

interface MockPending {
  paymentId: number
  orderId: string
  amount: number
  rebillId?: string // only for Recurrent charges — a one-off payment gets no card token
  status: 'NEW' | 'CONFIRMED' | 'CANCELED' | 'REJECTED'
  successUrl?: string
  failUrl?: string
}

/**
 * Interactive in-process stand-in for the TBank SDK (local dev, TBANK_MOCK=true).
 * initPayment returns a link to a local mock checkout page; the CONFIRMED/REJECTED webhook fires only
 * when the user clicks Pay / Cancel on that page — so "opened but never paid", repeat, and cancel
 * flows can be exercised without a real bank. Signature verification is a no-op.
 */
export class MockTbank {
  // Seconds-based start so payment ids stay unique across service restarts (real tbank ids are unique).
  private counter = Math.floor(Date.now() / 1000) % 1_000_000_000
  readonly pending = new Map<string, MockPending>() // by paymentId

  constructor (
    private readonly opts: {
      terminalKey: string
      webhookUrl: string // internal POST target for the simulated notification (self, container-local)
      checkoutBase: string // browser-reachable base for the mock checkout page (via nginx)
      info: (msg: string, data?: any) => void
    }
  ) {}

  async initPayment (params: any): Promise<any> {
    const paymentId = this.counter++
    const rebillId = params.Recurrent === 'Y' ? `mock-rebill-${paymentId}` : undefined
    this.pending.set(String(paymentId), {
      paymentId,
      orderId: params.OrderId,
      amount: params.Amount,
      rebillId,
      status: 'NEW',
      successUrl: params.SuccessURL,
      failUrl: params.FailURL
    })
    this.opts.info('mock tbank: initPayment (interactive)', {
      orderId: params.OrderId,
      amount: params.Amount,
      paymentId,
      recurrent: params.Recurrent === 'Y'
    })
    return {
      Success: true,
      PaymentId: paymentId,
      Status: 'NEW',
      PaymentURL: `${this.opts.checkoutBase}/mock-checkout/${paymentId}`,
      RebillId: rebillId
    }
  }

  // Recurrent renewal charges always succeed under mock.
  async chargeRecurrent (params: any): Promise<any> {
    const paymentId = this.counter++
    this.opts.info('mock tbank: chargeRecurrent success', { rebillId: params.RebillId })
    return { Success: true, PaymentId: String(paymentId), Status: 'CONFIRMED', ErrorCode: '0' }
  }

  async cancelPayment (params: any): Promise<any> {
    const p = this.pending.get(String(params.PaymentId))
    if (p !== undefined) p.status = 'CANCELED'
    this.opts.info('mock tbank: cancelPayment', { paymentId: params.PaymentId })
    return { Success: true, Status: 'CANCELED', PaymentId: params.PaymentId, ErrorCode: '0' }
  }

  async removeCard (): Promise<any> {
    return { Success: true }
  }

  verifyNotificationSignature (): boolean {
    return true
  }

  // POST the simulated notification to our own webhook endpoint (as the real bank would).
  private async deliver (p: MockPending, status: 'CONFIRMED' | 'REJECTED'): Promise<void> {
    const body = {
      TerminalKey: this.opts.terminalKey,
      OrderId: p.orderId,
      Success: status === 'CONFIRMED',
      Status: status,
      PaymentId: String(p.paymentId),
      ErrorCode: '0',
      Amount: p.amount,
      RebillId: p.rebillId,
      Token: 'mock'
    }
    await fetch(this.opts.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    this.opts.info('mock tbank: webhook delivered', { paymentId: p.paymentId, status })
  }

  // Mount the mock checkout page + pay/cancel actions on the service's own express app.
  registerRoutes (app: Express): void {
    app.get('/mock-checkout/:paymentId', (req, res) => {
      const p = this.pending.get(req.params.paymentId)
      if (p === undefined) {
        res.status(404).send('unknown payment')
        return
      }
      const rub = Math.round(p.amount / 100)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Mock TBank</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">
  <h2>Mock TBank checkout</h2>
  <p>Order: <b>${p.orderId}</b></p>
  <p>Amount: <b>${rub} ₽</b></p>
  <p>Status: <b id="st">${p.status}</b></p>
  <button style="padding:10px 24px;font-size:16px;margin:6px" onclick="act('pay')">Оплатить</button>
  <button style="padding:10px 24px;font-size:16px;margin:6px" onclick="act('cancel')">Отменить</button>
  <script>
    const backUrls = { pay: ${JSON.stringify(p.successUrl ?? null)}, cancel: ${JSON.stringify(p.failUrl ?? null)} }
    async function act(kind){
      const r = await fetch('${this.opts.checkoutBase}/mock-checkout/${p.paymentId}/'+kind,{method:'POST'})
      document.getElementById('st').textContent = (await r.json()).status
      if (backUrls[kind] != null) setTimeout(() => { window.location.href = backUrls[kind] }, 800)
    }
  </script>
</body></html>`)
    })

    app.post('/mock-checkout/:paymentId/pay', (req, res) => {
      const p = this.pending.get(req.params.paymentId)
      if (p === undefined) {
        res.status(404).json({ error: 'unknown payment' })
        return
      }
      p.status = 'CONFIRMED'
      void this.deliver(p, 'CONFIRMED')
      res.json({ status: 'CONFIRMED' })
    })

    app.post('/mock-checkout/:paymentId/cancel', (req, res) => {
      const p = this.pending.get(req.params.paymentId)
      if (p === undefined) {
        res.status(404).json({ error: 'unknown payment' })
        return
      }
      p.status = 'REJECTED'
      void this.deliver(p, 'REJECTED')
      res.json({ status: 'REJECTED' })
    })
  }
}

export function createMockTbank (opts: {
  terminalKey: string
  webhookUrl: string
  checkoutBase: string
  info: (msg: string, data?: any) => void
}): { tbank: TbankPayments, mock: MockTbank } {
  const mock = new MockTbank(opts)
  return { tbank: mock as unknown as TbankPayments, mock }
}
