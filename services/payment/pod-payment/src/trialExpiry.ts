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

import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import { SubscriptionStatus, type AccountClient } from '@hcengineering/account-client'
import { hasGrantingTier } from './utils'

const TRIAL_EXPIRED = 'TRIAL_EXPIRED'

/**
 * Sweep expired trials: retire the trial record, then move the workspace to the free plan.
 */
export async function expireTrials (
  ctx: MeasureContext,
  accountClient: AccountClient,
  createFreeSubscription: ((workspace: WorkspaceUuid) => Promise<unknown>) | undefined
): Promise<void> {
  const now = Date.now()
  let expired = 0

  const trials = await accountClient.getSubscriptionsByProvider('trial', [SubscriptionStatus.Trialing])
  for (const sub of trials) {
    if (sub.trialEnd == null || sub.trialEnd > now) continue

    try {
      // Re-read: the user may have bought a paid tier or second pod may have already swept this one.
      const fresh = await accountClient.getSubscriptions(sub.workspaceUuid, false)
      if (hasGrantingTier(fresh)) continue

      await accountClient.upsertSubscription({
        ...sub,
        status: SubscriptionStatus.Canceled,
        canceledAt: now,
        providerData: { ...sub.providerData, status: TRIAL_EXPIRED, modifiedAt: now }
      })

      // accountUuid is resolved from current workspace members.
      await createFreeSubscription?.(sub.workspaceUuid)

      ctx.info('trial expired', {
        workspace: sub.workspaceUuid,
        plan: sub.plan,
        trialEnd: sub.trialEnd,
        movedToFree: createFreeSubscription !== undefined
      })
      expired++
    } catch (err: any) {
      ctx.error('failed to expire trial', { workspace: sub.workspaceUuid, err })
    }
  }

  if (expired > 0) {
    ctx.info('expired trials swept', { expired })
  }
}

/**
 * Run {@link expireTrials} immediately, then on a timer. Returns the stop function.
 *
 * This is deliberately not part of the provider reconciliation loop: a trial belongs to no payment
 * provider (`provider: 'trial'`), there is nothing external to diff against, and for tbank that loop
 * is a no-op (pod-tbank-subscriptions owns it).
 */
export function startTrialExpiry (
  ctx: MeasureContext,
  accountClient: AccountClient,
  createFreeSubscription: ((workspace: WorkspaceUuid) => Promise<unknown>) | undefined,
  intervalMinutes: number
): () => void {
  const run = (): void => {
    void expireTrials(ctx, accountClient, createFreeSubscription).catch((err: any) => {
      ctx.error('trial expiry sweep failed', { err })
    })
  }

  run()
  const timer = setInterval(run, intervalMinutes * 60 * 1000)
  ctx.info('Trial expiry sweep started', { intervalMinutes, freePlanConfigured: createFreeSubscription !== undefined })

  return () => {
    clearInterval(timer)
  }
}
