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

import type { PaymentOperation, SubscriptionInfo } from '@hcengineering/account-client'
import { classifySubscription } from './subscriptionMetrics'

const tbankStatusStage: Record<string, number> = {
  NEW: 1,
  FORM_SHOWED: 2,
  '3DS_CHECKING': 3,
  '3DS_CHECKED': 4,
  AUTHORIZING: 5,
  AUTHORIZED: 6,
  CONFIRMING: 7,
  PAY_CHECKING: 7,
  CONFIRMED: 8,
  success: 8,
  REJECTED: 9,
  AUTH_FAIL: 9,
  CANCELED: 9,
  DEADLINE_EXPIRED: 9,
  failed: 9,
  REFUNDING: 10,
  REVERSING: 10,
  PARTIAL_REFUNDED: 11,
  PARTIAL_REVERSED: 11,
  REFUNDED: 12,
  REVERSED: 12
}

export type PaymentTransactionState =
  | 'paid'
  | 'refunded'
  | 'partially_refunded'
  | 'failed'
  | 'pending'
  | 'authorized'
  | 'reversed'
  | 'unknown'

export interface PaymentTransaction {
  key: string
  provider: string
  paymentId?: string
  orderId?: string
  workspaceUuid?: string
  subscriptionId?: string
  plan?: string
  customerId?: string | number
  customerKey?: string | number
  diagnostics: ReturnType<typeof paymentOperationDetails>
  state: PaymentTransactionState
  confirmedInPeriod: boolean
  paidAmount: number | null
  refundedAmount: number | null
  amountUnknown: boolean
  createdOn: number
  updatedOn: number
  operations: PaymentOperation[]
}

export interface PaymentProviderTotals {
  provider: string
  received: number | null
  refunded: number | null
  net: number | null
  count: number
}

function minorAmount (value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && value.trim() === '')) {
    return null
  }
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

export function paymentRaw (operation: PaymentOperation): Record<string, any> {
  if (typeof operation.raw !== 'string') return operation.raw ?? {}
  try {
    const raw = JSON.parse(operation.raw)
    return raw != null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

export function paymentOperationDetails (operation: PaymentOperation): {
  code?: string | number
  message?: string
  details?: string
  customerId?: string | number
  customerKey?: string | number
} {
  const raw = paymentRaw(operation)
  const code = raw.ErrorCode ?? raw.errorCode
  const message = raw.Message ?? raw.message
  const details = raw.Details ?? raw.details
  const customerId = raw.CustomerId ?? raw.customerId
  const customerKey = raw.CustomerKey ?? raw.customerKey
  return {
    code:
      (typeof code === 'string' || typeof code === 'number') && code !== '' && code !== '0' && code !== 0
        ? code
        : undefined,
    message: typeof message === 'string' && message.trim() !== '' ? message : undefined,
    details: typeof details === 'string' && details.trim() !== '' ? details : undefined,
    customerId:
      (typeof customerId === 'string' && customerId !== '') || typeof customerId === 'number' ? customerId : undefined,
    customerKey:
      (typeof customerKey === 'string' && customerKey !== '') || typeof customerKey === 'number'
        ? customerKey
        : undefined
  }
}

export function buildPaymentTransactions (
  operations: PaymentOperation[],
  subscriptions: SubscriptionInfo[],
  period?: { from: number, to: number }
): PaymentTransaction[] {
  const history =
    period == null ? operations : operations.filter((operation) => Number(operation.createdOn ?? 0) < period.to)
  const orderPayments = new Map<string, Set<string>>()
  for (const operation of history) {
    if (
      operation.paymentId == null ||
      operation.paymentId === '' ||
      operation.orderId == null ||
      operation.orderId === ''
    ) {
      continue
    }
    const key = JSON.stringify([operation.provider, operation.orderId])
    const ids = orderPayments.get(key) ?? new Set<string>()
    ids.add(operation.paymentId)
    orderPayments.set(key, ids)
  }
  const groups = new Map<string, PaymentOperation[]>()
  for (const [index, operation] of history.entries()) {
    if (['trial', 'free', 'manual'].includes(operation.provider)) continue
    const linked = orderPayments.get(JSON.stringify([operation.provider, operation.orderId]))
    const directPaymentId = operation.paymentId === '' ? undefined : operation.paymentId
    const paymentId = directPaymentId ?? (linked?.size === 1 ? Array.from(linked)[0] : undefined)
    const orderId = operation.orderId === '' ? undefined : operation.orderId
    const operationId = operation.id === '' ? undefined : operation.id
    const key = JSON.stringify([
      operation.provider,
      paymentId == null ? 'order' : 'payment',
      paymentId ?? orderId ?? operationId ?? index
    ])
    const group = groups.get(key) ?? []
    group.push(operation)
    groups.set(key, group)
  }
  const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]))
  const transactions: PaymentTransaction[] = []
  for (const [key, group] of groups) {
    if (period != null && !group.some((operation) => Number(operation.createdOn ?? 0) >= period.from)) continue
    group.sort((a, b) => Number(a.createdOn ?? 0) - Number(b.createdOn ?? 0))
    const financialHistory = group.filter(
      (operation) =>
        ['init_charge', 'charge_recurrent', 'refund'].includes(operation.operation) ||
        (operation.operation === 'webhook' &&
          [
            'NEW',
            'FORM_SHOWED',
            '3DS_CHECKING',
            '3DS_CHECKED',
            'AUTHORIZING',
            'AUTHORIZED',
            'CONFIRMING',
            'CONFIRMED',
            'PAY_CHECKING',
            'REFUNDING',
            'REFUNDED',
            'PARTIAL_REFUNDED',
            'REVERSING',
            'REVERSED',
            'PARTIAL_REVERSED',
            'REJECTED',
            'AUTH_FAIL',
            'CANCELED',
            'DEADLINE_EXPIRED'
          ].includes(operation.status ?? ''))
    )
    if (financialHistory.length === 0) continue
    const first = group[0]
    let last = financialHistory[financialHistory.length - 1]
    // Millisecond timestamps can tie; random ledger UUIDs cannot establish the bank event order.
    if (last.provider === 'tbank') {
      for (const operation of financialHistory) {
        if (Number(operation.createdOn ?? 0) !== Number(last.createdOn ?? 0)) continue
        if ((tbankStatusStage[operation.status ?? ''] ?? 0) > (tbankStatusStage[last.status ?? ''] ?? 0)) {
          last = operation
        }
      }
    }
    const subscriptionId = group.find((operation) => operation.subscriptionId != null)?.subscriptionId
    const confirmed = group.filter(
      (operation) =>
        ((operation.operation === 'webhook' || operation.operation === 'init_charge') &&
          operation.status === 'CONFIRMED') ||
        (operation.operation === 'charge_recurrent' && operation.status === 'success')
    )
    const amounts = confirmed.map((operation) => minorAmount(operation.amount))
    const capturedAmount =
      amounts.length === 0 ? 0 : amounts.every((amount) => amount != null && amount === amounts[0]) ? amounts[0] : null
    const confirmedInPeriod =
      confirmed.length > 0 && (period == null || Number(confirmed[0].createdOn ?? 0) >= period.from)
    const paidAmount = confirmedInPeriod ? capturedAmount : 0
    const refunds = group.filter(
      (operation) =>
        (operation.operation === 'webhook' || operation.operation === 'refund') &&
        (operation.status === 'REFUNDED' || operation.status === 'PARTIAL_REFUNDED')
    )
    let cumulativeRefunded: number | null = 0
    let priorRefunded: number | null = 0
    let fullRefunded = false
    const seenRefunds = new Set<string>()
    for (const refund of refunds) {
      const raw = paymentRaw(refund)
      const original = minorAmount(raw.OriginalAmount ?? (refund.operation === 'refund' ? refund.amount : undefined))
      const remaining = minorAmount(raw.newAmount ?? raw.NewAmount)
      // Cancel replies store balances before and after this refund; repeated replies are the same transition.
      const transition = JSON.stringify([original, remaining])
      if (!fullRefunded && !seenRefunds.has(transition)) {
        if (original == null || remaining == null || original < remaining) {
          cumulativeRefunded = null
        } else if (cumulativeRefunded != null) {
          cumulativeRefunded += original - remaining
        }
        seenRefunds.add(transition)
      }
      if (refund.status === 'REFUNDED' && capturedAmount != null && capturedAmount > 0) {
        cumulativeRefunded = capturedAmount
        fullRefunded = true
      }
      if (
        !Number.isSafeInteger(cumulativeRefunded) ||
        (capturedAmount != null &&
          capturedAmount > 0 &&
          cumulativeRefunded != null &&
          cumulativeRefunded > capturedAmount)
      ) {
        cumulativeRefunded = null
      }
      if (period != null && Number(refund.createdOn ?? 0) < period.from) priorRefunded = cumulativeRefunded
    }
    const refundedAmount =
      cumulativeRefunded != null && priorRefunded != null ? cumulativeRefunded - priorRefunded : null
    let state: PaymentTransactionState = 'unknown'
    if (last.status === 'REFUNDING' || last.status === 'REVERSING') state = 'pending'
    else if (refunds.some((operation) => operation.status === 'REFUNDED')) state = 'refunded'
    else if (refunds.length > 0) state = 'partially_refunded'
    else if (last.status === 'REVERSED' || last.status === 'PARTIAL_REVERSED') state = 'reversed'
    else if (confirmed.length > 0) state = 'paid'
    else if (last.status === 'AUTHORIZED') state = 'authorized'
    else if (['REJECTED', 'AUTH_FAIL', 'failed', 'CANCELED', 'DEADLINE_EXPIRED'].includes(last.status ?? '')) {
      state = 'failed'
    } else if (
      [
        'NEW',
        'FORM_SHOWED',
        '3DS_CHECKING',
        '3DS_CHECKED',
        'AUTHORIZING',
        'CONFIRMING',
        'PAY_CHECKING',
        'REFUNDING',
        'REVERSING'
      ].includes(last.status ?? '')
    ) {
      state = 'pending'
    }
    const recordedDetails = group.map(paymentOperationDetails).reverse()
    transactions.push({
      key,
      provider: first.provider,
      paymentId: group.find((operation) => operation.paymentId != null && operation.paymentId !== '')?.paymentId,
      orderId: group.find((operation) => operation.orderId != null && operation.orderId !== '')?.orderId,
      workspaceUuid:
        group.find((operation) => operation.workspaceUuid != null)?.workspaceUuid ??
        subscriptionById.get(subscriptionId ?? '')?.workspaceUuid,
      subscriptionId,
      plan: group.map(paymentRaw).find((raw) => raw.plan != null)?.plan,
      customerId: recordedDetails.find((details) => details.customerId != null)?.customerId,
      customerKey: recordedDetails.find((details) => details.customerKey != null)?.customerKey,
      diagnostics: paymentOperationDetails(last),
      state,
      confirmedInPeriod,
      paidAmount,
      refundedAmount,
      amountUnknown: paidAmount == null || refundedAmount == null,
      createdOn: Number(first.createdOn ?? 0),
      updatedOn: Number(last.createdOn ?? 0),
      operations: group
    })
  }
  return transactions.sort((a, b) => b.updatedOn - a.updatedOn)
}

export function paymentTotals (transactions: PaymentTransaction[]): PaymentProviderTotals[] {
  const totals = new Map<string, PaymentProviderTotals>()
  for (const transaction of transactions) {
    const total = totals.get(transaction.provider) ?? {
      provider: transaction.provider,
      received: 0,
      refunded: 0,
      net: 0,
      count: 0
    }
    if (transaction.confirmedInPeriod) total.count++
    total.received =
      total.received != null && transaction.paidAmount != null ? total.received + transaction.paidAmount : null
    total.refunded =
      total.refunded != null && transaction.refundedAmount != null ? total.refunded + transaction.refundedAmount : null
    if (!Number.isSafeInteger(total.received)) total.received = null
    if (!Number.isSafeInteger(total.refunded)) total.refunded = null
    total.net = total.received != null && total.refunded != null ? total.received - total.refunded : null
    if (transaction.provider !== 'tbank') total.received = total.refunded = total.net = null
    totals.set(transaction.provider, total)
  }
  return Array.from(totals.values())
}

export function overduePaymentSubscriptions (subscriptions: SubscriptionInfo[]): SubscriptionInfo[] {
  const latestGranting = new Map<string, SubscriptionInfo>()
  for (const subscription of subscriptions) {
    if (subscription.status !== 'active' && subscription.status !== 'trialing') continue
    const key = JSON.stringify([subscription.workspaceUuid, subscription.type])
    const previous = latestGranting.get(key)
    if (
      previous == null ||
      Number(subscription.createdOn) > Number(previous.createdOn) ||
      (Number(subscription.createdOn) === Number(previous.createdOn) && subscription.id > previous.id)
    ) {
      latestGranting.set(key, subscription)
    }
  }
  return subscriptions.filter((subscription) => {
    if (subscription.status !== 'past_due' && subscription.status !== 'readonly') return false
    if (subscription.providerData?.pending === true) return false
    const category = classifySubscription(subscription)
    if (category === 'trial' || category === 'free') return false
    if (category !== 'paid' && subscription.provider !== 'manual') return false
    const granting = latestGranting.get(JSON.stringify([subscription.workspaceUuid, subscription.type]))
    return (
      granting == null ||
      Number(granting.createdOn) < Number(subscription.createdOn) ||
      (Number(granting.createdOn) === Number(subscription.createdOn) && granting.id <= subscription.id)
    )
  })
}
