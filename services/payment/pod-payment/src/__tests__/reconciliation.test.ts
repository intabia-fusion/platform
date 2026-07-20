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

import { startActiveSubscriptionReconciliation } from '../reconciliation'
import type { PaymentProvider } from '../providers/index'

describe('startActiveSubscriptionReconciliation', () => {
  const accountsUrl = 'https://accounts.example.test'
  const serviceToken = 'service-token'

  let ctx: any
  let publish: jest.Mock

  beforeEach(() => {
    ctx = { info: jest.fn(), error: jest.fn() }
    publish = jest.fn().mockResolvedValue(undefined)
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('runs immediately and again on each interval tick', async () => {
    const reconcile = jest.fn().mockResolvedValue(undefined)
    const provider = { providerName: 'mock', reconcileActiveSubscriptions: reconcile } as unknown as PaymentProvider

    const stop = startActiveSubscriptionReconciliation(ctx, accountsUrl, serviceToken, provider, 5, publish)

    // immediate run scheduled on the microtask queue
    await Promise.resolve()
    expect(reconcile).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(5 * 60 * 1000)
    await Promise.resolve()
    expect(reconcile).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(5 * 60 * 1000)
    await Promise.resolve()
    expect(reconcile).toHaveBeenCalledTimes(3)

    stop()
  })

  test('logs rejection from reconcileActiveSubscriptions without throwing', async () => {
    const reconcile = jest.fn().mockRejectedValue(new Error('boom'))
    const provider = { providerName: 'mock', reconcileActiveSubscriptions: reconcile } as unknown as PaymentProvider

    const stop = startActiveSubscriptionReconciliation(ctx, accountsUrl, serviceToken, provider, 5, publish)

    await Promise.resolve()
    await Promise.resolve()

    expect(ctx.error).toHaveBeenCalledWith('Initial subscription reconciliation failed', {
      provider: 'mock',
      err: expect.any(Error)
    })

    stop()
  })

  test('stop() clears the interval so no further runs happen', async () => {
    const reconcile = jest.fn().mockResolvedValue(undefined)
    const provider = { providerName: 'mock', reconcileActiveSubscriptions: reconcile } as unknown as PaymentProvider

    const stop = startActiveSubscriptionReconciliation(ctx, accountsUrl, serviceToken, provider, 5, publish)
    await Promise.resolve()
    expect(reconcile).toHaveBeenCalledTimes(1)

    stop()

    jest.advanceTimersByTime(5 * 60 * 1000)
    await Promise.resolve()
    expect(reconcile).toHaveBeenCalledTimes(1)
  })
})
