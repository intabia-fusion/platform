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
  onFreePlan: boolean // unpaid but a free tier applies -> runs on free limits, not read-only
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
  isLimited: false
}

// Main subscription store
export const subscriptionStore = writable<SubscriptionState>(initialState)

export const limitExceeded = derived(subscriptionStore, ($store) => $store.limitExceeded)
export const onFreePlan = derived(subscriptionStore, ($store) => $store.onFreePlan)
export const isLimited = derived(subscriptionStore, ($store) => $store.isLimited)

/** Resolved numeric limits (0 = unlimited) for the active plan/package, reactive on subscription changes. */
export const planLimits = derived(subscriptionStore, ($s) =>
  calculateLimits($s.currentPlan, $s.currentPackage, $s.currentSubscription, $s.currentPackageSubscription)
)

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
  // A granting `subscription` may be undefined when the tier is canceled, but the banner still needs it.
  statusTier?: SubscriptionData | undefined
): void {
  const usage = workspaceInfo?.usageInfo ?? get(subscriptionStore).usageInfo
  const workspace = workspaceInfo ?? get(subscriptionStore).workspaceInfo
  const tierForStatus = statusTier ?? subscription
  const badStatus =
    tierForStatus?.status === SubscriptionStatus.PastDue ||
    tierForStatus?.status === SubscriptionStatus.Canceled ||
    tierForStatus?.status === SubscriptionStatus.Expired
  // A free fallback (baked into the subscription) keeps the workspace usable on free limits when
  // unpaid — show the "free plan" hint, not the hard read-only banner.
  const hasFree = tierForStatus?.freeLimits != null
  const onFreePlan = badStatus && hasFree

  subscriptionStore.update((store) => ({
    ...store,
    currentSubscription: subscription,
    currentPlan: plan,
    currentPackageSubscription: packageSubscription,
    currentPackage: pkg,
    usageInfo: usage,
    workspaceInfo: workspace,
    limitExceeded: checkUsageAgainstLimits(usage, plan, pkg, subscription, packageSubscription),
    onFreePlan
  }))
}

export function setIsLimited (limited: boolean): void {
  subscriptionStore.update((store) => ({ ...store, isLimited: limited }))
}

export function resetSubscriptionStore (): void {
  subscriptionStore.set(initialState)
}
