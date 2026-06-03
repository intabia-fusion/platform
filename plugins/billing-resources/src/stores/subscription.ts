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
  paymentExhausted: boolean // whole workspace unpaid -> read-only
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
  paymentExhausted: false,
  isLimited: false
}

// Main subscription store
export const subscriptionStore = writable<SubscriptionState>(initialState)

export const limitExceeded = derived(subscriptionStore, ($store) => $store.limitExceeded)
export const paymentExhausted = derived(subscriptionStore, ($store) => $store.paymentExhausted)
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
  pkg?: PackageItem | undefined
): void {
  const usage = workspaceInfo?.usageInfo ?? get(subscriptionStore).usageInfo
  const workspace = workspaceInfo ?? get(subscriptionStore).workspaceInfo
  const exhausted =
    subscription?.status === SubscriptionStatus.PastDue ||
    subscription?.status === SubscriptionStatus.Canceled ||
    subscription?.status === SubscriptionStatus.Expired

  subscriptionStore.update((store) => ({
    ...store,
    currentSubscription: subscription,
    currentPlan: plan,
    currentPackageSubscription: packageSubscription,
    currentPackage: pkg,
    usageInfo: usage,
    workspaceInfo: workspace,
    limitExceeded: checkUsageAgainstLimits(usage, plan, pkg, subscription, packageSubscription),
    paymentExhausted: exhausted
  }))
}

export function setIsLimited (limited: boolean): void {
  subscriptionStore.update((store) => ({ ...store, isLimited: limited }))
}

export function resetSubscriptionStore (): void {
  subscriptionStore.set(initialState)
}
