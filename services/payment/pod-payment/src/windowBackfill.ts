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

import { type MeasureContext } from '@hcengineering/core'
import {
  SubscriptionStatus,
  type AccountClient,
  type Subscription,
  type SubscriptionData,
  type SubscriptionUpsert
} from '@hcengineering/account-client'

/** Subscriptions written per bulk call. */
const BATCH_SIZE = 100

/** Limits for a subscription as the plan config defines them today. */
export type LimitsResolver = (sub: Subscription) => SubscriptionData['limits'] | undefined

/**
 * Subscriptions written before `windowMonthLimit` was baked in carry no AI window, so the pod falls
 * back to its env default - usually far off the plan. Recompute it from the plan config for every
 * subscription that is missing one.
 */
export async function backfillWindowLimits (
  ctx: MeasureContext,
  accountClient: AccountClient,
  resolveLimits: LimitsResolver
): Promise<number> {
  const subs = await accountClient.getSubscriptionsByProvider(undefined, [
    SubscriptionStatus.Active,
    SubscriptionStatus.PastDue,
    SubscriptionStatus.Trialing
  ])

  const writes: SubscriptionUpsert[] = []
  for (const sub of subs) {
    // A window that is already set stays as it is: a trial or a hand-made subscription may
    // deliberately differ from the plan.
    if (sub.limits?.windowMonthLimit != null) continue
    const limits = resolveLimits(sub)
    if (limits?.windowMonthLimit == null) continue
    writes.push({ ...sub, limits } as unknown as SubscriptionUpsert)
  }

  if (writes.length === 0) {
    ctx.info('AI window backfill: nothing to do', { checked: subs.length })
    return 0
  }

  let updated = 0
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writes.slice(i, i + BATCH_SIZE)
    const results = await accountClient.upsertSubscriptionsBulk(batch)
    const byId = new Map(batch.map((w) => [w.id, w]))
    for (const result of results) {
      const write = byId.get(result.id)
      if (!result.ok) {
        ctx.error('AI window backfill failed for subscription', {
          workspace: write?.workspaceUuid,
          error: result.error
        })
        continue
      }
      updated++
    }
  }

  ctx.info('AI window backfill done', { checked: subs.length, updated })
  return updated
}
