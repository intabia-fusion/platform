//
// Copyright © 2025 Hardcore Engineering Inc.
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
import { get } from 'svelte/store'

import login from '@hcengineering/login'
import { getMetadata } from '@hcengineering/platform'
import presentation from '@hcengineering/presentation'
import billing from '@hcengineering/billing'
import {
  getClient as getAccountClientRaw,
  type AccountClient,
  type SubscriptionData
} from '@hcengineering/account-client'
import { getClient as getBillingClientRaw, type BillingClient } from '@hcengineering/billing-client'
import { getClient as getPaymentClientRaw, type PaymentClient } from '@hcengineering/payment-client'
import {
  type UsageStatus,
  type WorkspaceInfoWithStatus,
  AccountRole,
  getCurrentAccount,
  hasAccountRole
} from '@hcengineering/core'
import { showPopup } from '@hcengineering/ui'
import { type PlanItem, type PlanConfig, type LocalizedString } from '@hcengineering/billing'

import { setSubscriptionState, updateLimitExceeded, subscriptionStore } from './stores/subscription'
import SubscriptionsModal from './components/SubscriptionsModal.svelte'

export function getAccountClient (): AccountClient | null {
  const accountsUrl = getMetadata(login.metadata.AccountsUrl) ?? ''
  const token = getMetadata(presentation.metadata.Token) ?? ''
  if (accountsUrl === '' || token === '') {
    return null
  }

  return getAccountClientRaw(accountsUrl, token)
}

export function getBillingClient (): BillingClient | null {
  const billingUrl = getMetadata(billing.metadata.BillingURL) ?? ''
  const token = getMetadata(presentation.metadata.Token) ?? ''
  if (billingUrl === '' || token === '') {
    return null
  }
  return getBillingClientRaw(billingUrl, token)
}

export function getPaymentClient (): PaymentClient | null {
  const paymentUrl = getMetadata(presentation.metadata.PaymentUrl) ?? ''
  const token = getMetadata(presentation.metadata.Token) ?? ''
  if (paymentUrl === '' || token === '') {
    return null
  }

  return getPaymentClientRaw(paymentUrl, token)
}

let _planConfig: PlanConfig | null = null

async function getPlanConfig (): Promise<PlanConfig> {
  if (_planConfig == null) {
    const paymentUrl = getMetadata(presentation.metadata.PaymentUrl) ?? ''
    const res = await fetch(paymentUrl + '/api/v1/plan-config')
    if (!res.ok) {
      console.warn('Failed to load plan config:', res.status)
      return { plans: {}, packages: {} }
    }
    _planConfig = (await res.json()) as PlanConfig
  }
  return _planConfig
}

export async function isLimitExceeded (): Promise<boolean> {
  try {
    const accountClient = getAccountClient()
    if (accountClient == null) return false

    const workspaceInfo = await accountClient.getWorkspaceInfo(false)
    const usageInfo = workspaceInfo?.usageInfo ?? null

    if (usageInfo === null) {
      return false
    }

    const subscription = await getCurrentSubscription(accountClient)
    if (subscription == null) {
      return true
    }

    const config = await getPlanConfig()
    const plan = config.plans[subscription.plan] ?? null
    if (plan == null) {
      return true
    }

    return checkUsageAgainstLimits(usageInfo, plan)
  } catch (error) {
    console.error('Error checking usage limits:', error)
    return false
  }
}

export async function checkWorkspaceLimits (): Promise<void> {
  try {
    const accountClient = getAccountClient()
    if (accountClient == null) {
      updateLimitExceeded(false)
      return
    }

    const workspaceInfo = await accountClient.getWorkspaceInfo(false)
    const usageInfo = workspaceInfo?.usageInfo ?? null

    const subscription = await getCurrentSubscription(accountClient)
    const config = await getPlanConfig()
    const plan = subscription != null ? (config.plans[subscription.plan] ?? null) : null

    // Update subscription store
    setSubscriptionState(subscription, plan ?? undefined, workspaceInfo)

    // Check limits
    if (usageInfo === null || subscription == null || plan == null) {
      updateLimitExceeded(subscription == null)
      return
    }

    const exceeded = checkUsageAgainstLimits(usageInfo, plan)
    updateLimitExceeded(exceeded)
  } catch (error) {
    console.error('Error checking workspace limits:', error)
    updateLimitExceeded(false)
  }
}

export function calculateLimits (plan: PlanItem | undefined): {
  storageLimit: number
  trafficLimit: number
  meetingMinutesLimit: number
  tokenLimit: number
} {
  const DEFAULT_STORAGE_GB = 10
  const DEFAULT_TRAFFIC_GB = 10
  const DEFAULT_MEETING_MINUTES = 600
  const DEFAULT_TOKEN = 20

  return {
    storageLimit: (plan?.storageLimitGB ?? DEFAULT_STORAGE_GB) * 1e9,
    trafficLimit: (plan?.trafficLimitGB ?? DEFAULT_TRAFFIC_GB) * 1e9,
    meetingMinutesLimit: plan?.meetingMinutesLimit ?? DEFAULT_MEETING_MINUTES,
    tokenLimit: (plan?.tokenLimit ?? DEFAULT_TOKEN) * 1000
  }
}

export function checkUsageAgainstLimits (usageInfo: UsageStatus | undefined, plan: PlanItem | undefined): boolean {
  if (usageInfo == null) return false
  const storageUsedBytes = usageInfo.usage.storageBytes ?? 0
  const meetingMinutes = usageInfo.usage.meetingMinutes ?? 0

  const { storageLimit, meetingMinutesLimit } = calculateLimits(plan)

  return storageUsedBytes > storageLimit || meetingMinutes > meetingMinutesLimit
}

export function resolveLocale (config: PlanConfig, lang: string): PlanConfig {
  const resolve = (s: LocalizedString): string => {
    if (typeof s === 'string') return s
    return s[lang] ?? s.en ?? Object.values(s)[0] ?? ''
  }

  return {
    plans: Object.fromEntries(
      Object.entries(config.plans).map(([k, t]) => [
        k,
        {
          ...t,
          label: resolve(t.label),
          description: resolve(t.description),
          users: resolve(t.users),
          additional: resolve(t.additional),
          features: t.features.map((f) => resolve(f))
        }
      ])
    ),
    packages: Object.fromEntries(
      Object.entries(config.packages).map(([k, p]) => [
        k,
        {
          ...p,
          description: resolve(p.description)
        }
      ])
    )
  }
}

export async function getCurrentSubscription (accountClient: AccountClient): Promise<SubscriptionData | undefined> {
  const subscriptions = await accountClient.getSubscriptions()
  return subscriptions.find((p) => p.type === 'tier')
}

export async function getWorkspaceInfo (): Promise<WorkspaceInfoWithStatus | undefined> {
  const accountClient = getAccountClient()
  if (accountClient == null) return undefined
  return await accountClient.getWorkspaceInfo(false)
}

export async function upgradePlan (): Promise<void> {
  try {
    const currentAccount = getCurrentAccount()
    if (currentAccount == null) {
      return
    }

    const workspaceInfo = get(subscriptionStore).workspaceInfo ?? (await getWorkspaceInfo())

    const isBillingAccount =
      workspaceInfo?.billingAccount != null
        ? workspaceInfo?.billingAccount === currentAccount.uuid
        : hasAccountRole(currentAccount, AccountRole.Owner)

    showPopup(SubscriptionsModal, { isReadOnly: !isBillingAccount })
  } catch (error) {
    console.error('Failed to show upgrade plan modal:', error)
  }
}
