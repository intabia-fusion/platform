//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { writable, derived, get } from 'svelte/store'
import { type SubscriptionData, SubscriptionStatus } from '@hcengineering/account-client'
import { type PlanItem, type PackageItem } from '@hcengineering/billing'
import { type UsageStatus, type WorkspaceInfoWithStatus } from '@hcengineering/core'
import { checkUsageAgainstLimits, calculateLimits } from '../utils'

export interface SubscriptionState {
  currentSubscription: SubscriptionData | undefined
  currentPlan: PlanItem | undefined
  currentPackageSubscription: SubscriptionData | undefined
  currentPackage: PackageItem | undefined
  workspaceInfo: WorkspaceInfoWithStatus | undefined
  usageInfo: UsageStatus | undefined
  limitExceeded: boolean
  onFreePlan: boolean // on free limits (own free plan, or paid tier no longer granting)
  freePlanOverdue: boolean // on free BECAUSE payment lapsed (readonly/expired) -> show "overdue" hint
  isLimited: boolean // this user is seatless -> read-only
}

const initialState: SubscriptionState = {
  currentSubscription: undefined,
  currentPlan: undefined,
  currentPackageSubscription: undefined,
  currentPackage: undefined,
  workspaceInfo: undefined,
  usageInfo: undefined,
  limitExceeded: false,
  onFreePlan: false,
  freePlanOverdue: false,
  isLimited: false
}

// Main subscription store
export const subscriptionStore = writable<SubscriptionState>(initialState)

export const limitExceeded = derived(subscriptionStore, ($store) => $store.limitExceeded)
export const onFreePlan = derived(subscriptionStore, ($store) => $store.onFreePlan)
export const freePlanOverdue = derived(subscriptionStore, ($store) => $store.freePlanOverdue)
export const isLimited = derived(subscriptionStore, ($store) => $store.isLimited)

/** Resolved numeric limits (0 = unlimited) for the active plan/package, reactive on subscription changes. */
export const planLimits = derived(subscriptionStore, ($s) =>
  calculateLimits($s.currentPlan, $s.currentPackage, $s.currentSubscription, $s.currentPackageSubscription)
)

/**
 * Server-computed count of seat-occupying members (active employees minus AI/system/Admin/guest),
 * from pod-billing usage.ts. Single source of truth for "seats used": counting active Employee
 * mixins client-side would include the AI bot and disagree with what the server enforces.
 * undefined until usageInfo is loaded; refreshed on the pod-billing interval (~25s).
 */
export const seatCount = derived(subscriptionStore, ($s) => $s.usageInfo?.usage.membersCount)

/**
 * True when the plan's user limit is reached (0 = unlimited). undefined seats block until known.
 * Trails seatCount, so up to one pod-billing interval passes before a just-added/removed employee
 * flips this — the server rejects an over-limit create regardless.
 */
export const seatLimitReached = derived([seatCount, planLimits], ([$seats, $limits]) => {
  const limit = $limits.usersLimit
  return limit > 0 && ($seats === undefined || $seats >= limit)
})

export function updateLimitExceeded (limit: boolean): void {
  subscriptionStore.update((store) => ({
    ...store,
    limitExceeded: limit
  }))
}

export function setSubscriptionState (
  subscription: SubscriptionData | undefined,
  plan: PlanItem | undefined,
  workspaceInfo?: WorkspaceInfoWithStatus | undefined,
  packageSubscription?: SubscriptionData | undefined,
  pkg?: PackageItem | undefined,
  // The current (latest) tier subscription regardless of status — used to decide payment/free state.
  statusTier?: SubscriptionData | undefined
): void {
  const usage = workspaceInfo?.usageInfo ?? get(subscriptionStore).usageInfo
  const workspace = workspaceInfo ?? get(subscriptionStore).workspaceInfo
  const tierForStatus = statusTier ?? subscription
  // Free limits are activated:
  //  - when free plan is active (free plan chosen/provisioned after a cancel)
  //  - status = readonly/expired and a free fallback exists
  const activeOnFree = tierForStatus?.status === SubscriptionStatus.Active && plan?.free === true
  const overdueOnFree =
    tierForStatus?.status === SubscriptionStatus.ReadOnly || tierForStatus?.status === SubscriptionStatus.Expired
  const hasFree = tierForStatus?.freeLimits != null
  const onFreePlan = activeOnFree || (overdueOnFree && hasFree)
  // tooltip explains overdue as the reason for the free plan
  const freePlanOverdue = overdueOnFree && hasFree

  subscriptionStore.update((store) => ({
    ...store,
    currentSubscription: subscription,
    currentPlan: plan,
    currentPackageSubscription: packageSubscription,
    currentPackage: pkg,
    usageInfo: usage,
    workspaceInfo: workspace,
    limitExceeded: checkUsageAgainstLimits(usage, plan, pkg, subscription, packageSubscription),
    onFreePlan,
    freePlanOverdue
  }))
}

export function setIsLimited (limited: boolean): void {
  subscriptionStore.update((store) => ({ ...store, isLimited: limited }))
}

export function resetSubscriptionStore (): void {
  subscriptionStore.set(initialState)
}
