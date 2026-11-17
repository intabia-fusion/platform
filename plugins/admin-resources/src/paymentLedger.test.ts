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
import {
  buildPaymentTransactions,
  overduePaymentSubscriptions,
  paymentOperationDetails,
  paymentTotals
} from './paymentLedger'

function operation (values: Partial<PaymentOperation> = {}): PaymentOperation {
  return {
    provider: 'tbank',
    operation: 'webhook',
    paymentId: 'one',
    status: 'CONFIRMED',
    amount: 10000,
    createdOn: 1,
    ...values
  }
}

test('one bank payment is counted once across callbacks and recurrent success', () => {
  const rows = buildPaymentTransactions(
    [
      operation({ createdOn: 3 }),
      operation({ operation: 'charge_recurrent', status: 'success', createdOn: 2 }),
      operation({ createdOn: 4 }),
      operation({ provider: 'stripe', createdOn: 5 })
    ],
    []
  )
  expect(rows).toHaveLength(2)
  expect(rows[0].provider).toBe('stripe')
  expect(rows[1].operations.map((event) => event.createdOn)).toEqual([2, 3, 4])
  expect(paymentTotals(rows)).toEqual([
    { provider: 'stripe', received: null, refunded: null, net: null, count: 1 },
    { provider: 'tbank', received: 10000, refunded: 0, net: 10000, count: 1 }
  ])
})

test('successive partial Cancel responses use balance transitions, retries do not add them again', () => {
  const partial = operation({
    operation: 'refund',
    status: 'PARTIAL_REFUNDED',
    amount: 10000,
    raw: { newAmount: 7000 },
    createdOn: 2
  })
  const rows = buildPaymentTransactions(
    [
      operation(),
      partial,
      partial,
      operation({
        operation: 'refund',
        status: 'PARTIAL_REFUNDED',
        amount: 7000,
        raw: { newAmount: 5000 },
        createdOn: 3
      })
    ],
    []
  )
  expect(rows[0].state).toBe('partially_refunded')
  expect(rows[0].refundedAmount).toBe(5000)
  expect(paymentTotals(rows)[0].net).toBe(5000)
})

test('partial webhook without remaining balance keeps refunds and net unknown', () => {
  const partial = operation({ status: 'PARTIAL_REFUNDED', amount: 3000, createdOn: 2 })
  const rows = buildPaymentTransactions([operation(), partial, partial], [])
  expect(rows[0].paidAmount).toBe(10000)
  expect(rows[0].refundedAmount).toBeNull()
  expect(rows[0].state).toBe('partially_refunded')
  expect(paymentTotals(rows)[0]).toEqual({ provider: 'tbank', received: 10000, refunded: null, net: null, count: 1 })
})

test('full refund follows partial without double counting; cancel alone is not a refund', () => {
  const rows = buildPaymentTransactions(
    [
      operation(),
      operation({ status: 'PARTIAL_REFUNDED', amount: 3000, createdOn: 2 }),
      operation({ status: 'REFUNDED', createdOn: 3 }),
      operation({ status: 'REFUNDED', createdOn: 4 }),
      operation({ operation: 'cancel', status: 'canceled', createdOn: 5 })
    ],
    []
  )
  expect(rows[0].state).toBe('refunded')
  expect(rows[0].refundedAmount).toBe(10000)
  expect(paymentTotals(rows)[0].net).toBe(0)
  expect(buildPaymentTransactions([operation({ operation: 'cancel' })], [])).toEqual([])
})

test('pending authorization and reversed holds never become received money', () => {
  for (const [status, state] of [
    ['NEW', 'pending'],
    ['AUTHORIZED', 'authorized'],
    ['REVERSED', 'reversed'],
    ['REJECTED', 'failed'],
    ['unknown', 'unknown']
  ]) {
    const rows = buildPaymentTransactions([operation({ operation: 'init_charge', status })], [])
    expect(rows[0].state).toBe(state)
    expect(paymentTotals(rows)[0]).toEqual({ provider: 'tbank', received: 0, refunded: 0, net: 0, count: 0 })
  }
  expect(
    buildPaymentTransactions(
      ['trial', 'free', 'manual'].map((provider) => operation({ provider })),
      []
    )
  ).toEqual([])
})

test('missing payment id links only through an unambiguous order, never through a subscription', () => {
  const missing = operation({
    paymentId: undefined,
    orderId: 'renew:one',
    operation: 'charge_recurrent',
    status: 'failed',
    createdOn: 1
  })
  const paid = operation({ paymentId: 'paid', orderId: 'renew:one', createdOn: 2 })
  expect(buildPaymentTransactions([missing, paid], [])[0].operations).toHaveLength(2)
  const rows = buildPaymentTransactions(
    [missing, paid, operation({ paymentId: 'retry', orderId: 'renew:one', status: 'REJECTED', createdOn: 3 })],
    []
  )
  expect(rows).toHaveLength(3)
  expect(rows.every((row) => row.operations.length === 1)).toBe(true)
})

test('PG numeric strings work, unsafe and missing confirmed amounts stay unavailable', () => {
  const rows = buildPaymentTransactions([operation({ amount: '12345' as unknown as number })], [])
  expect(rows[0].paidAmount).toBe(12345)
  for (const amount of [
    undefined,
    Number.MAX_SAFE_INTEGER + 1,
    -1,
    NaN,
    true as unknown as number,
    ' ' as unknown as number
  ]) {
    expect(paymentTotals(buildPaymentTransactions([operation({ amount })], []))[0].received).toBeNull()
  }
  expect(paymentTotals(buildPaymentTransactions([operation({ amount: 0 })], []))[0].count).toBe(1)
})

test('provisioning webhooks remain in the journal, empty ids do not merge unrelated failures', () => {
  expect(buildPaymentTransactions([operation({ status: 'active', amount: 10000 })], [])).toEqual([])
  const rows = buildPaymentTransactions(
    [
      operation({ id: 'a', paymentId: '', orderId: '', status: 'failed', operation: 'init_charge' }),
      operation({ id: 'b', paymentId: '', orderId: '', status: 'failed', operation: 'init_charge' })
    ],
    []
  )
  expect(rows).toHaveLength(2)
  expect(rows.every((row) => row.paymentId === undefined && row.orderId === undefined)).toBe(true)
})

test('late partial callback does not erase a confirmed full refund', () => {
  const rows = buildPaymentTransactions(
    [
      operation(),
      operation({ status: 'REFUNDED', createdOn: 2 }),
      operation({ status: 'PARTIAL_REFUNDED', amount: 3000, createdOn: 3 })
    ],
    []
  )
  expect(rows[0].state).toBe('refunded')
  expect(rows[0].refundedAmount).toBe(10000)
})

test('refund without an in-period confirmation keeps a proven refund delta, not a fabricated receipt', () => {
  const rows = buildPaymentTransactions(
    [operation({ operation: 'refund', status: 'PARTIAL_REFUNDED', amount: 7000, raw: { newAmount: 5000 } })],
    []
  )
  expect(paymentTotals(rows)[0]).toEqual({ provider: 'tbank', received: 0, refunded: 2000, net: -2000, count: 0 })
  expect(buildPaymentTransactions([operation({ status: 'REFUNDED' })], [])[0].refundedAmount).toBeNull()
})

test('duplicate confirmation in a new period does not invent a new receipt', () => {
  const rows = buildPaymentTransactions([operation({ createdOn: 10 }), operation({ createdOn: 21 })], [], {
    from: 20,
    to: 30
  })
  expect(rows[0].confirmedInPeriod).toBe(false)
  expect(paymentTotals(rows)[0]).toEqual({ provider: 'tbank', received: 0, refunded: 0, net: 0, count: 0 })
  expect(buildPaymentTransactions([operation({ createdOn: 10 })], [], { from: 20, to: 30 })).toEqual([])
})

test('a refund in the period uses earlier capture only as context, not period revenue', () => {
  const rows = buildPaymentTransactions(
    [operation({ createdOn: 10 }), operation({ status: 'REFUNDED', createdOn: 21 })],
    [],
    { from: 20, to: 30 }
  )
  expect(paymentTotals(rows)[0]).toEqual({ provider: 'tbank', received: 0, refunded: 10000, net: -10000, count: 0 })
})

test('full refund after a previous-period partial counts only the remaining balance', () => {
  const rows = buildPaymentTransactions(
    [
      operation({ createdOn: 1 }),
      operation({
        operation: 'refund',
        status: 'PARTIAL_REFUNDED',
        amount: 10000,
        raw: { newAmount: 7000 },
        createdOn: 10
      }),
      operation({ status: 'REFUNDED', createdOn: 21 }),
      operation({ status: 'REFUNDED', createdOn: 22 })
    ],
    [],
    { from: 20, to: 30 }
  )
  expect(paymentTotals(rows)[0]).toEqual({ provider: 'tbank', received: 0, refunded: 7000, net: -7000, count: 0 })
})

test('unknown prior partial makes the current refund delta unknown even after a full refund', () => {
  const rows = buildPaymentTransactions(
    [
      operation({ createdOn: 1 }),
      operation({ status: 'PARTIAL_REFUNDED', createdOn: 10 }),
      operation({ status: 'REFUNDED', createdOn: 21 })
    ],
    [],
    { from: 20, to: 30 }
  )
  expect(rows[0].refundedAmount).toBeNull()
  expect(paymentTotals(rows)[0].net).toBeNull()
})

test('refund or reversal in progress needs attention while the receipt remains a financial fact', () => {
  for (const status of ['REFUNDING', 'REVERSING']) {
    const rows = buildPaymentTransactions([operation(), operation({ status, createdOn: 2 })], [])
    expect(rows[0].state).toBe('pending')
    expect(rows[0].paidAmount).toBe(10000)
    expect(rows[0].confirmedInPeriod).toBe(true)
  }
})

test.each([
  ['NEW', 'AUTHORIZED', 'authorized'],
  ['AUTHORIZED', 'CONFIRMING', 'pending'],
  ['CONFIRMED', 'REFUNDING', 'pending'],
  ['REFUNDING', 'REFUNDED', 'refunded'],
  ['REVERSING', 'REVERSED', 'reversed'],
  ['NEW', 'REJECTED', 'failed']
])('equal-time TBank %s / %s resolves to %s independently of input order and UUID', (earlier, later, state) => {
  for (const ids of [
    ['00000000-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff'],
    ['ffffffff-ffff-ffff-ffff-ffffffffffff', '00000000-0000-0000-0000-000000000001']
  ]) {
    const events = [
      operation({ id: ids[0], status: earlier, raw: { Message: 'Earlier' } }),
      operation({ id: ids[1], status: later, raw: { ErrorCode: '51', Message: 'Later' } })
    ]
    for (const input of [events, [...events].reverse()]) {
      const transaction = buildPaymentTransactions(input, [])[0]
      expect(transaction.state).toBe(state)
      expect(transaction.diagnostics).toMatchObject({ code: '51', message: 'Later' })
    }
  }
})

test('timestamp takes precedence over TBank lifecycle stage', () => {
  const transaction = buildPaymentTransactions(
    [
      operation({ status: 'AUTHORIZED', createdOn: 2, raw: { Message: 'Latest' } }),
      operation({ status: 'CONFIRMING', createdOn: 1, raw: { Message: 'Older' } })
    ],
    []
  )[0]
  expect(transaction.state).toBe('authorized')
  expect(transaction.diagnostics.message).toBe('Latest')
})

test('equal-time events from other providers keep their existing order', () => {
  const events = [
    operation({ provider: 'stripe', status: 'NEW', raw: { Message: 'First' } }),
    operation({ provider: 'stripe', status: 'AUTHORIZED', raw: { Message: 'Second' } })
  ]
  expect(buildPaymentTransactions(events, [])[0].diagnostics.message).toBe('Second')
  expect(buildPaymentTransactions([...events].reverse(), [])[0].diagnostics.message).toBe('First')
})

test('unknown and administrative equal-time events do not override a TBank financial status', () => {
  const transaction = buildPaymentTransactions(
    [
      operation({ status: 'AUTHORIZED', raw: { Message: 'Authorized' } }),
      operation({ operation: 'init_charge', status: 'unknown', raw: { Message: 'Unknown' } }),
      operation({ operation: 'update', status: 'ADMIN_EDITED', raw: { Message: 'Edited' } })
    ],
    []
  )[0]
  expect(transaction.state).toBe('authorized')
  expect(transaction.diagnostics.message).toBe('Authorized')
})

test('overdue subscriptions exclude unfinished checkout, free and trial but include manual without amount', () => {
  const base = { type: 'tier', status: 'past_due', plan: 'business', createdOn: 10, workspaceUuid: 'one' }
  const subscriptions = [
    { ...base, id: 'pending', provider: 'tbank', amount: 10000, providerData: { pending: true } },
    { ...base, id: 'free', provider: 'free' },
    { ...base, id: 'trial', provider: 'trial' },
    { ...base, id: 'manual', provider: 'manual', amount: 0 },
    { ...base, id: 'paid', provider: 'tbank', status: 'readonly', amount: 10000 }
  ] as SubscriptionInfo[]
  expect(overduePaymentSubscriptions(subscriptions).map((subscription) => subscription.id)).toEqual(['manual', 'paid'])
})

test('a newer granting subscription supersedes old overdue rows only within the same workspace and type', () => {
  const base = {
    type: 'tier',
    status: 'past_due',
    plan: 'business',
    createdOn: 10,
    workspaceUuid: 'one',
    provider: 'manual',
    amount: 0
  }
  const subscriptions = [
    { ...base, id: 'old' },
    { ...base, id: 'new', createdOn: 20, status: 'active' },
    { ...base, id: 'old-package', type: 'package' },
    { ...base, id: 'other-workspace', workspaceUuid: 'two' },
    { ...base, id: 'later-overdue', createdOn: 30 },
    { ...base, id: 'trial-superseded', workspaceUuid: 'three' },
    { ...base, id: 'new-trial', workspaceUuid: 'three', status: 'trialing', createdOn: 20 }
  ] as SubscriptionInfo[]
  expect(overduePaymentSubscriptions(subscriptions).map((subscription) => subscription.id)).toEqual([
    'old-package',
    'other-workspace',
    'later-overdue'
  ])
})

test('administrative updates and subscription callbacks do not hide a pending bank refund', () => {
  const rows = buildPaymentTransactions(
    [
      operation({ createdOn: 1 }),
      operation({ status: 'REFUNDING', createdOn: 2 }),
      operation({ operation: 'update', status: 'ADMIN_EDITED', createdOn: 3 }),
      operation({ operation: 'cancel', status: 'canceled', createdOn: 4 }),
      operation({ status: 'active', createdOn: 5 }),
      operation({ status: 'trialing', createdOn: 6 })
    ],
    []
  )
  expect(rows[0].state).toBe('pending')
  expect(rows[0].updatedOn).toBe(2)
  expect(rows[0].paidAmount).toBe(10000)
  expect(rows[0].operations.map((event) => event.createdOn)).toEqual([1, 2, 3, 4, 5, 6])
})

test('payment diagnostics decode webhook and recurrent error fields without treating zero as an error', () => {
  expect(
    paymentOperationDetails(
      operation({
        raw: {
          ErrorCode: '1051',
          Message: 'Declined',
          Details: 'Insufficient funds',
          CustomerKey: 'bank-customer'
        }
      })
    )
  ).toEqual({
    code: '1051',
    message: 'Declined',
    details: 'Insufficient funds',
    customerKey: 'bank-customer'
  })
  expect(
    paymentOperationDetails(operation({ raw: { errorCode: 51, message: 'Declined', customerId: 'customer' } }))
  ).toEqual({ code: 51, message: 'Declined', customerId: 'customer' })
  for (const code of [0, '0', '', undefined]) {
    expect(paymentOperationDetails(operation({ raw: { ErrorCode: code } })).code).toBeUndefined()
  }
})

test('legacy JSON diagnostics reject malformed values and preserve numeric customer identifiers', () => {
  const raw = JSON.stringify({ ErrorCode: '51', Details: 'Declined', CustomerId: 123 })
  expect(paymentOperationDetails(operation({ raw: raw as unknown as Record<string, any> }))).toEqual({
    code: '51',
    details: 'Declined',
    customerId: 123
  })
  for (const raw of ['invalid', 'null', '[]', { ErrorCode: {}, Message: [], Details: true, CustomerKey: {} }]) {
    expect(paymentOperationDetails(operation({ raw: raw as Record<string, any> }))).toEqual({})
  }
})

test('transaction diagnostics follow the latest financial event and retain recorded customer identifiers', () => {
  const failure = operation({
    status: 'REJECTED',
    raw: { ErrorCode: '51', Message: 'Declined', CustomerKey: 'bank-key', CustomerId: 'bank-id' }
  })
  const update = operation({ operation: 'update', status: 'ADMIN_EDITED', createdOn: 3, raw: { message: 'Edited' } })
  const failed = buildPaymentTransactions([failure, update], [])[0]
  expect(failed.diagnostics).toMatchObject({ code: '51', message: 'Declined' })
  expect(failed.customerKey).toBe('bank-key')
  expect(failed.customerId).toBe('bank-id')
  const paid = buildPaymentTransactions([failure, operation({ createdOn: 2, raw: { ErrorCode: '0' } }), update], [])[0]
  expect(paid.state).toBe('paid')
  expect(paid.diagnostics.code).toBeUndefined()
  expect(paid.diagnostics.message).toBeUndefined()
  expect(paid.customerKey).toBe('bank-key')
  expect(buildPaymentTransactions([operation({ accountUuid: 'account' as any })], [])[0].customerKey).toBeUndefined()
})
