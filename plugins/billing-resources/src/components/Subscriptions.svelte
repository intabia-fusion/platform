<!--
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
-->
<script lang="ts">
  import { type SubscriptionData, SubscriptionStatus, SubscriptionType } from '@hcengineering/account-client'
  import {
    type SubscribeRequest,
    type CheckoutStatus,
    type BillingPeriod,
    PaymentError
  } from '@hcengineering/payment-client'
  import { type PlanItem, type PlanConfig, type PackageItem } from '@hcengineering/billing'
  import { getMetadata, translate, getEmbeddedLabel } from '@hcengineering/platform'
  import presentation, { MessageBox, getClient, addTxListener, removeTxListener } from '@hcengineering/presentation'
  import core, {
    UsageStatus,
    type WorkspaceUuid,
    type Tx,
    type TxWorkspaceEvent,
    WorkspaceEvent,
    getCurrentAccount
  } from '@hcengineering/core'
  import {
    IconCheckmark,
    IconStorage,
    Label,
    Loading,
    Scroller,
    Button,
    getPlatformColorByName,
    themeStore,
    getLocation,
    navigate,
    showPopup,
    addNotification,
    NotificationSeverity,
    Switcher
  } from '@hcengineering/ui'
  import { onMount, onDestroy } from 'svelte'
  import support from '@hcengineering/support'
  import contact, { getCurrentEmployee, formatName } from '@hcengineering/contact'

  import plugin from '../plugin'
  import { getAccountClient, getPaymentClient, resolveLocale } from '../utils'

  import UsageSection from './UsageSection.svelte'
  import BillingErrorNotification from './BillingErrorNotification.svelte'
  import ChangeSeatsDialog from './ChangeSeatsDialog.svelte'
  import PackageChangeDialog from './PackageChangeDialog.svelte'

  const paymentClient = getPaymentClient()

  export let isReadOnly: boolean = false

  let planConfigRaw: PlanConfig | null = null
  $: planConfig = planConfigRaw != null ? resolveLocale(planConfigRaw, $themeStore.language) : null
  $: plans = planConfig?.plans ?? ({} satisfies Record<string, PlanItem>)
  $: packages = planConfig?.packages ?? ({} satisfies Record<string, PackageItem>)
  $: yearlyDiscount = Math.max(0, ...Object.values(plans).map((p) => p.yearlyDiscount ?? 0))

  let currentSubscription: SubscriptionData | undefined = undefined
  let currentPackageSubscription: SubscriptionData | undefined = undefined
  let allSubscriptions: SubscriptionData[] = []

  // Disable pay buttons if another user is paying now
  const OTHER_CHECKOUT_FALLBACK_TTL_MS = 15 * 60 * 1000
  function otherCheckoutActive (type: SubscriptionType): boolean {
    const myUuid = getCurrentAccount().uuid
    const now = Date.now()
    return allSubscriptions.some((s) => {
      if (s.type !== type || s.providerData?.pending !== true || s.accountUuid === myUuid) return false
      const expiresAt = s.providerData?.linkExpiresAt as number | undefined
      if (expiresAt !== undefined) return now < expiresAt
      return now - ((s.providerData?.modifiedAt as number) ?? 0) < OTHER_CHECKOUT_FALLBACK_TTL_MS
    })
  }
  $: otherTierCheckoutActive = otherCheckoutActive(SubscriptionType.Tier) && allSubscriptions.length >= 0
  $: otherPackageCheckoutActive = otherCheckoutActive(SubscriptionType.Package) && allSubscriptions.length >= 0

  // Plan key may be absent from the config (e.g. legacy plan) - fall back to the raw key for display.
  $: currentPlan =
    currentSubscription != null ? (plans[currentSubscription.plan] ?? currentSubscription.plan) : undefined
  // Compare plans by key, not object identity: resolveLocale() rebuilds the plans map each tick.
  $: currentPlanKey = currentSubscription?.plan
  $: currentPackage = currentPackageSubscription != null ? packages[currentPackageSubscription.plan] : undefined
  // Packages are available on any tier, including free/no-plan.
  $: arePackagesAvailable = Object.keys(packages).length > 0
  let loading = true
  let pollingCheckoutId: string | null = null
  let isPolling = false
  let pollAttempts = 0
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let isUpdating = false
  let isCanceling = false
  let isUncanceling = false
  let isPackageBusy = false
  let isRetrying = false
  const MAX_POLL_ATTEMPTS = 120
  const POLL_INTERVAL = 2000
  let destroyed = false
  let pollErrorCount = 0
  let pollErrorShown = false
  let configError = false
  const DEFAULT_LOCALE = 'ru'

  let usageInfo: UsageStatus | null = null

  $: isCurrentCanceled = currentSubscription?.canceledAt !== undefined && currentSubscription.canceledAt > 0
  // A trial has no paid subscription to cancel — hide the cancel action (buy the plan instead).
  $: isCurrentTrial = currentSubscription?.status === SubscriptionStatus.Trialing
  // Active, paid, per-seat tier -> the "Change seats" action is available (pro-rata, no refund).
  $: isCurrentPerSeat =
    typeof currentPlan !== 'string' &&
    currentPlan?.priceMonthlyPerUser != null &&
    currentPlan?.free !== true &&
    !isCurrentTrial &&
    !isCurrentCanceled &&
    currentSubscription?.status === SubscriptionStatus.Active
  // Show the purchase button/seats for a plan when it is not the current one, OR when the user is on a
  // trial of that same plan — a trial is not a paid subscription, so buying the plan must stay available.
  // Args passed explicitly so Svelte tracks currentPlanKey/isReadOnly/isCurrentTrial as {#if} deps.
  const canPurchase = (
    planKey: string,
    planItem: PlanItem,
    curKey: string | undefined,
    readOnly: boolean,
    curTrial: boolean
  ): boolean => !readOnly && (curKey === undefined || curKey !== planKey || (curTrial && planItem.free !== true))
  $: isPackageCanceled =
    currentPackageSubscription?.canceledAt !== undefined && currentPackageSubscription.canceledAt > 0

  let paymentPeriod: BillingPeriod = 'monthly'

  // Instant provider (mock) already activated the subscription server-side: refetch instead of
  // redirecting to a checkout page. Real providers return instant=false -> redirect as before.
  async function applyCheckout (result: { checkoutUrl: string, instant?: boolean }): Promise<void> {
    if (result.instant === true) {
      await fetchSubscriptions()
    } else {
      window.location.href = result.checkoutUrl
    }
  }

  // A concurrent payment request already exists, waiting for PaymentUrl from tbank
  const CHECKOUT_INFLIGHT_RETRIES = 3
  const CHECKOUT_INFLIGHT_DELAY = 1000

  // Handle conflict reasons on update plan
  async function handleCheckoutError (error: unknown, forceRetry: () => Promise<void>): Promise<boolean> {
    if (!(error instanceof PaymentError)) return false
    if (error.reason === 'other_checkout_active') {
      showPopup(MessageBox, {
        label: plugin.string.OtherCheckoutActiveTitle,
        message: plugin.string.OtherCheckoutActiveMessage,
        okLabel: plugin.string.CancelAndSwitch,
        action: forceRetry
      })
      return true
    }
    if (error.reason === 'already_paid') {
      addNotification(
        await translate(plugin.string.CheckoutAlreadyPaidTitle, {}, $themeStore.language),
        await translate(plugin.string.CheckoutAlreadyPaidMessage, {}, $themeStore.language),
        BillingErrorNotification,
        undefined,
        NotificationSeverity.Info
      )
      return true
    }
    return false
  }

  // Create a checkout, handling claim-conflict reasons
  async function createCheckout (workspace: WorkspaceUuid, request: SubscribeRequest, attempt = 0): Promise<void> {
    if (paymentClient == null) return
    try {
      await applyCheckout(await paymentClient.createSubscription(workspace, request))
    } catch (error) {
      if (error instanceof PaymentError && error.reason === 'in_flight' && attempt < CHECKOUT_INFLIGHT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, CHECKOUT_INFLIGHT_DELAY))
        await createCheckout(workspace, request, attempt + 1)
        return
      }
      const handled = await handleCheckoutError(error, async () => {
        await createCheckout(workspace, { ...request, force: true })
      })
      if (!handled) throw error
    }
  }

  async function subscribe (plan: string, quantity?: number): Promise<void> {
    if (paymentClient == null) {
      return
    }

    const workspace = getMetadata(presentation.metadata.WorkspaceUuid)
    if (workspace === undefined) {
      console.warn('Workspace metadata not available')
      return
    }

    try {
      const request: SubscribeRequest = { type: SubscriptionType.Tier, plan, quantity, period: paymentPeriod }
      await createCheckout(workspace, request)
    } catch (error) {
      console.error('Error while upgrading plan:', error)
      await showErrorNotification()
    }
  }

  async function handleChangePackage (pkgKey: string): Promise<void> {
    if (paymentClient == null) {
      return
    }

    const workspace = getMetadata(presentation.metadata.WorkspaceUuid)
    if (workspace === undefined) {
      console.warn('Workspace metadata not available')
      return
    }

    // Replacing package when another package exists: show a proration preview (charge for a bigger
    // package, renewal-date shift for a smaller one). Client-side preview, server recomputes on apply.
    if (currentPackageSubscription !== undefined) {
      const replaceSub = currentPackageSubscription
      const target = packages[pkgKey]
      const targetPriceKopecks = Math.round(Number(target?.priceMonthly ?? 0) * 100)
      showPopup(
        PackageChangeDialog,
        {
          subscription: replaceSub,
          currentLabel: currentPackage?.description ?? '',
          targetLabel: target?.description ?? pkgKey,
          targetPriceKopecks,
          currency: target?.currency ?? currentPackage?.currency ?? ''
        },
        undefined,
        (confirmed?: boolean) => {
          if (confirmed !== true) return
          void (async () => {
            try {
              const result = await paymentClient.updateSubscriptionPlan(replaceSub.id, pkgKey)
              if ('checkoutUrl' in result) {
                await applyCheckout(result)
              } else {
                currentPackageSubscription = result
              }
            } catch (error) {
              console.error('Error replacing package:', error)
              await showErrorNotification()
            }
          })()
        }
      )
      // Connecting package, no package connected yet
    } else {
      void subscribePackage(pkgKey)
    }
  }

  async function subscribePackage (plan: string): Promise<void> {
    if (paymentClient == null) {
      return
    }

    const workspace = getMetadata(presentation.metadata.WorkspaceUuid)
    if (workspace === undefined) {
      console.warn('Workspace metadata not available')
      return
    }

    try {
      const request: SubscribeRequest = { type: SubscriptionType.Package, plan }
      await createCheckout(workspace, request)
    } catch (error) {
      console.error('Error subscribing to package:', error)
      await showErrorNotification()
    }
  }

  async function showErrorNotification (): Promise<void> {
    addNotification(
      await translate(plugin.string.SubscriptionOperationFailed, {}, $themeStore.language),
      await translate(plugin.string.SubscriptionErrorMessage, {}, $themeStore.language),
      BillingErrorNotification,
      undefined,
      NotificationSeverity.Error
    )
  }

  $: membersCount = usageInfo?.usage.membersCount ?? 0
  // Per-seat plans: how many seats the user wants to buy
  // minSeats = number of existing users
  $: minSeats = Math.max(membersCount, 1)
  // Number of seats that user put for each per-seat plan
  let seatsByPlan: Record<string, number> = {}

  // Effective seats
  function seatsFor (planKey: string): number {
    return Math.max(seatsByPlan[planKey] ?? minSeats, minSeats)
  }

  // Store raw input
  function setSeats (planKey: string, value: number): void {
    seatsByPlan = { ...seatsByPlan, [planKey]: Number.isFinite(value) ? Math.floor(value) : minSeats }
  }

  // On blur, snap the visible input value up to the floor.
  function clampSeats (planKey: string): void {
    seatsByPlan = { ...seatsByPlan, [planKey]: seatsFor(planKey) }
  }

  // Monthly price per seat without discount. NaN for flat/free plans
  function monthlyPerUserBase (item: PlanItem | undefined): number {
    return item?.priceMonthlyPerUser != null ? Number(item.priceMonthlyPerUser) : NaN
  }

  // Yearly discount factor for a plan (e.g. 15% -> 0.85). 1 when no discount.
  function discountFactor (item: PlanItem | undefined): number {
    const p = item?.yearlyDiscount ?? 0
    return 1 - p / 100
  }

  // Effective monthly price (per seat if applicable)
  function monthly (base: number, item: PlanItem | undefined, period: BillingPeriod): number {
    if (period !== 'yearly') return base
    return Math.round(base * discountFactor(item))
  }

  // Full amount charged for a plan in the given period (monthly/yearly with discount)
  function planChargeValue (item: PlanItem | undefined, planKey: string, period: BillingPeriod): number {
    if (item == null || item.free === true) return 0
    const perUser = monthlyPerUserBase(item)
    if (Number.isFinite(perUser)) {
      const seats = seatsFor(planKey)
      return period === 'yearly' ? monthly(perUser, item, period) * 12 * seats : perUser * seats
    }
    const n = Number(item.priceMonthly)
    if (!Number.isFinite(n)) return 0
    return period === 'yearly' ? monthly(n, item, period) : n
  }

  async function showPlanChangeConfirmation (newPlan: string, newPlanItem: PlanItem): Promise<void> {
    if (currentPlan === undefined) {
      return
    }
    const quantity = newPlanItem.priceMonthlyPerUser != null ? seatsFor(newPlan) : undefined

    // full charge for the new plan (monthly or yearly)
    const newPrice = newPlanItem.free === true ? 0 : planChargeValue(newPlanItem, newPlan, paymentPeriod)
    // the real last charge stored on the active subscription
    const currentPrice = (currentSubscription?.amount ?? 0) / 100
    const isDowngrade = newPrice < currentPrice
    const isFreeDowngrade = newPlanItem.free === true
    const priceDifference = Math.abs(newPrice - currentPrice)

    const title = isFreeDowngrade
      ? plugin.string.ConfirmDowngradeToFree
      : isDowngrade
        ? plugin.string.ConfirmDowngrade
        : plugin.string.ConfirmUpgrade
    const descriptionKey = isFreeDowngrade
      ? plugin.string.DowngradeToFreeDescription
      : isDowngrade
        ? plugin.string.DowngradeDescription
        : plugin.string.UpgradeDescription

    showPopup(MessageBox, {
      label: title,
      message: descriptionKey,
      params: { amount: priceDifference, currency: newPlanItem.currency },
      action: async () => {
        await executeUpdate(newPlan, quantity)
      }
    })
  }

  async function handlePlanChange (newPlan: string, planItem: PlanItem): Promise<void> {
    const quantity = planItem.priceMonthlyPerUser != null ? seatsFor(newPlan) : undefined
    if (currentSubscription?.id === undefined) {
      // No active subscription, create new one
      await subscribe(newPlan, quantity)
      return
    }

    if (currentPlan === undefined) {
      // No current plan selected, should not happen but guard against it
      return
    }

    // If subscription is canceled, show uncancel confirmation first
    if (isCurrentCanceled) {
      showPopup(MessageBox, {
        label: plugin.string.ConfirmUncancel,
        message: plugin.string.UncancelDescription,
        action: async () => {
          // After uncanceling, show the plan change confirmation
          await showPlanChangeConfirmation(newPlan, planItem)
        }
      })
    } else {
      await showPlanChangeConfirmation(newPlan, planItem)
    }
  }

  async function executeUpdate (newPlan: string, quantity?: number, force?: boolean, attempt = 0): Promise<void> {
    if (paymentClient == null) {
      return
    }
    if (currentSubscription?.id === undefined) {
      return
    }

    // Snapshot for rollback: the optimistic uncancel below must not stick if the plan update fails.
    const snapshot = { ...currentSubscription }
    try {
      isUpdating = true

      // If subscription is canceled, uncancel it first
      if (isCurrentCanceled) {
        currentSubscription = await paymentClient.uncancelSubscription(currentSubscription.id)
      }

      // Now update the plan
      const updateResult = await paymentClient.updateSubscriptionPlan(
        currentSubscription.id,
        newPlan,
        quantity,
        paymentPeriod,
        force
      )

      // CheckoutResponse: instant provider already activated (refetch), real one needs a checkout.
      if ('checkoutUrl' in updateResult) {
        await applyCheckout(updateResult)
        return
      }

      // It's a SubscriptionData - direct update successful
      currentSubscription = updateResult
    } catch (error) {
      currentSubscription = snapshot
      // Race: another owner won the claim and hasn't written the URL yet -> retry a few times.
      if (error instanceof PaymentError && error.reason === 'in_flight' && attempt < CHECKOUT_INFLIGHT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, CHECKOUT_INFLIGHT_DELAY))
        await executeUpdate(newPlan, quantity, force, attempt + 1)
        return
      }
      const handled = await handleCheckoutError(error, async () => {
        await executeUpdate(newPlan, quantity, true)
      })
      if (!handled) {
        console.error('Error updating subscription:', error)
        await showErrorNotification()
      }
    } finally {
      isUpdating = false
    }
  }

  // Full recurring price (kopecks) for the current plan at a given seat count and the active period.
  // Mirrors planChargeValue but parameterized by seats (that one reads seatsFor()).
  function recurringPriceForCurrent (seats: number): number {
    if (currentPlan == null || typeof currentPlan === 'string' || currentPlan.free === true) return 0
    const period: BillingPeriod = currentSubscription?.providerData?.period === 'yearly' ? 'yearly' : 'monthly'
    const perUser = monthlyPerUserBase(currentPlan)
    if (Number.isFinite(perUser)) {
      const rub = period === 'yearly' ? monthly(perUser, currentPlan, period) * 12 * seats : perUser * seats
      return Math.round(rub * 100)
    }
    const n = Number(currentPlan.priceMonthly)
    if (!Number.isFinite(n)) return 0
    return Math.round((period === 'yearly' ? monthly(n, currentPlan, period) : n) * 100)
  }

  // Open the seat-change dialog for the active per-seat tier; confirm applies via updateSubscriptionPlan
  // (server computes the pro-rata charge / period shift).
  function openChangeSeats (): void {
    if (currentSubscription === undefined || currentPlanKey === undefined) return
    const planKey = currentPlanKey
    showPopup(
      ChangeSeatsDialog,
      {
        subscription: currentSubscription,
        recurringPriceFor: recurringPriceForCurrent,
        minSeats,
        currency: typeof currentPlan !== 'string' ? (currentPlan?.currency ?? '') : ''
      },
      undefined,
      (seats?: number) => {
        if (seats != null) void executeUpdate(planKey, seats)
      }
    )
  }

  async function openSalesMail (planKey: string): Promise<void> {
    const email = getMetadata(support.metadata.SupportEmail)
    if (email === undefined || email === '') return
    const workspace = `"${getMetadata(presentation.metadata.WorkspaceName) ?? ''}"`
    const employee = await getClient().findOne(contact.class.Person, { _id: getCurrentEmployee() })
    const user = employee !== undefined ? formatName(employee.name) : ''
    const date = new Date().toLocaleDateString($themeStore.language ?? DEFAULT_LOCALE)
    const subject = await translate(
      plugin.string.ContactSalesSubject,
      { workspace, user, date, plan: planKey },
      $themeStore.language ?? DEFAULT_LOCALE
    )
    const link = document.createElement('a')
    link.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`
    link.rel = 'noopener noreferrer'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async function retryPayment (): Promise<void> {
    if (paymentClient == null) return
    if (currentSubscription?.id === undefined) return

    try {
      isRetrying = true
      const result = await paymentClient.retryPayment(currentSubscription.id)
      currentSubscription = result
    } catch (error) {
      console.error('Error retrying payment:', error)
      await showErrorNotification()
    } finally {
      isRetrying = false
    }
  }

  async function handleCancel (): Promise<void> {
    if (currentSubscription?.id === undefined) {
      return
    }

    if (isCurrentCanceled) {
      return
    }

    showPopup(MessageBox, {
      label: plugin.string.ConfirmCancel,
      dangerous: true,
      message: plugin.string.CancelDescription,
      action: async () => {
        await executeCancel()
      }
    })
  }

  async function executeCancel (): Promise<void> {
    if (paymentClient == null) {
      return
    }
    if (currentSubscription?.id === undefined) {
      return
    }

    try {
      isCanceling = true
      currentSubscription = await paymentClient.cancelSubscription(currentSubscription.id)
    } catch (error) {
      console.error('Error canceling subscription:', error)
      await showErrorNotification()
    } finally {
      isCanceling = false
    }
  }

  async function handleUncancel (): Promise<void> {
    if (currentSubscription?.id === undefined) {
      return
    }

    if (!isCurrentCanceled) {
      return
    }

    showPopup(MessageBox, {
      label: plugin.string.ConfirmUncancel,
      message: plugin.string.UncancelDescription,
      action: async () => {
        await executeUncancel()
      }
    })
  }

  async function executeUncancel (): Promise<void> {
    if (paymentClient == null) {
      return
    }
    if (currentSubscription?.id === undefined) {
      return
    }
    if (!isCurrentCanceled) {
      return
    }

    const snapshot = { ...currentSubscription }
    try {
      isUncanceling = true
      currentSubscription = await paymentClient.uncancelSubscription(currentSubscription.id)
    } catch (error) {
      console.error('Error uncanceling subscription:', error)
      currentSubscription = snapshot
      await showErrorNotification()
    } finally {
      isUncanceling = false
    }
  }

  // Schedule a package cancel — mirror of handleCancel for the tier.
  async function handlePackageCancel (): Promise<void> {
    if (paymentClient == null || currentPackageSubscription?.id === undefined || isPackageCanceled || isPackageBusy) {
      return
    }
    const cancelSub = currentPackageSubscription
    showPopup(MessageBox, {
      label: plugin.string.ConfirmCancelPackage,
      message: plugin.string.ConfirmCancelPackageDescription,
      dangerous: true,
      action: async () => {
        if (paymentClient == null) {
          return
        }
        try {
          isPackageBusy = true
          // Scheduled cancel: the package stays Active until periodEnd.
          currentPackageSubscription = await paymentClient.cancelSubscription(cancelSub.id)
        } catch (error) {
          console.error('Error canceling package:', error)
          await showErrorNotification()
        } finally {
          isPackageBusy = false
        }
      }
    })
  }

  // Reverse a scheduled package cancel — mirror of handleUncancel for the tier.
  async function handlePackageUncancel (): Promise<void> {
    if (paymentClient == null || currentPackageSubscription?.id === undefined || !isPackageCanceled || isPackageBusy) {
      return
    }
    const uncancelSub = currentPackageSubscription
    showPopup(MessageBox, {
      label: plugin.string.ConfirmUncancel,
      message: plugin.string.UncancelDescription,
      action: async () => {
        if (paymentClient == null) {
          return
        }
        try {
          isPackageBusy = true
          currentPackageSubscription = await paymentClient.uncancelSubscription(uncancelSub.id)
        } catch (error) {
          console.error('Error uncanceling package:', error)
          await showErrorNotification()
        } finally {
          isPackageBusy = false
        }
      }
    })
  }

  // Statuses that represent a current subscription worth displaying.
  // Active/Trialing first (a fresh paid sub wins), then PastDue/ReadOnly/Paused (needs user
  // attention), ignoring terminal Canceled/Expired records left in history.
  const DISPLAY_STATUS_PRIORITY: SubscriptionStatus[] = [
    SubscriptionStatus.Active,
    SubscriptionStatus.Trialing,
    SubscriptionStatus.PastDue,
    SubscriptionStatus.ReadOnly,
    SubscriptionStatus.Paused
  ]

  function pickDisplaySubscription (
    subscriptions: SubscriptionData[],
    type: SubscriptionType
  ): SubscriptionData | undefined {
    // Exclude pending subscriptions (status PastDue + providerData.pending === true): these are
    // not-yet-confirmed first payments (in-flight or abandoned checkout), never a real failed
    // renewal. While one exists the previous active subscription is still in effect and should
    // win; the "payment processing" UI is driven separately via checkForCheckoutParam().
    const candidates = subscriptions.filter(
      (s) =>
        s.type === type &&
        DISPLAY_STATUS_PRIORITY.includes(s.status as SubscriptionStatus) &&
        s.providerData?.pending !== true
    )
    if (candidates.length === 0) return undefined
    return candidates.reduce((best, s) => {
      const byStatus =
        DISPLAY_STATUS_PRIORITY.indexOf(s.status as SubscriptionStatus) -
        DISPLAY_STATUS_PRIORITY.indexOf(best.status as SubscriptionStatus)
      if (byStatus !== 0) return byStatus < 0 ? s : best
      // Same status priority (e.g. several stale past_due records) -> prefer the most recently
      // modified one, which is the user's current subscription. Every tbank write path sets
      // providerData.modifiedAt; a record without it (0) sorts last.
      const sMod = (s.providerData?.modifiedAt as number) ?? 0
      const bMod = (best.providerData?.modifiedAt as number) ?? 0
      return sMod > bMod ? s : best
    })
  }

  async function fetchSubscriptions (): Promise<void> {
    loading = true

    try {
      const accountClient = getAccountClient()
      if (accountClient == null) return

      // Scope to the current workspace: admin/service tokens return ALL workspaces' subscriptions
      // when the uuid is omitted, so an admin would otherwise see other workspaces' plans here.
      const workspace = getMetadata(presentation.metadata.WorkspaceUuid)
      // Include non-active subscriptions (e.g. past_due) so the payment-failed banner can be shown.
      const subscriptions = await accountClient.getSubscriptions(workspace, false)
      allSubscriptions = subscriptions
      currentSubscription = pickDisplaySubscription(subscriptions, SubscriptionType.Tier)
      currentPackageSubscription = pickDisplaySubscription(subscriptions, SubscriptionType.Package)
    } catch (err) {
      console.error('Error fetching current plan:', err)
      await showErrorNotification()
    } finally {
      loading = false
    }
  }

  async function fetchUsageStats (): Promise<void> {
    try {
      const accountClient = getAccountClient()
      if (accountClient == null) return

      const workspaceInfo = await accountClient.getWorkspaceInfo(false)
      usageInfo = workspaceInfo.usageInfo ?? null
    } catch (err) {
      console.error('Error fetching usage stats:', err)
      await showErrorNotification()
      usageInfo = null
    }
  }

  async function pollCheckoutStatus (checkoutId: string): Promise<void> {
    if (destroyed || paymentClient == null) {
      return
    }
    if (isPolling || pollAttempts >= MAX_POLL_ATTEMPTS) {
      return
    }

    isPolling = true
    pollAttempts++

    try {
      const status: CheckoutStatus = await paymentClient.getCheckoutStatus(checkoutId)

      if (destroyed) return

      if (status.status === 'completed') {
        console.info('Checkout completed, subscription ready:', status.subscriptionId)
        pollErrorCount = 0
        pollErrorShown = false
        await fetchSubscriptions()

        const loc = getLocation()
        const cleanedLoc = { ...loc, query: {} }
        navigate(cleanedLoc)

        pollingCheckoutId = null
        pollAttempts = 0
      } else {
        // Still pending, schedule next poll
        const delay = Math.min(POLL_INTERVAL * Math.pow(1.5, pollErrorCount), 30000)
        pollTimer = setTimeout(() => {
          void pollCheckoutStatus(checkoutId)
        }, delay)
      }
    } catch (err) {
      console.error('Error polling checkout status:', err)
      pollErrorCount++
      if (!pollErrorShown) {
        pollErrorShown = true
        await showErrorNotification()
      }
      if (!destroyed && pollAttempts < MAX_POLL_ATTEMPTS) {
        const delay = Math.min(POLL_INTERVAL * Math.pow(1.5, pollErrorCount), 30000)
        pollTimer = setTimeout(() => {
          void pollCheckoutStatus(checkoutId)
        }, delay)
      }
    } finally {
      isPolling = false
    }
  }

  function checkForCheckoutParam (): void {
    const loc = getLocation()
    const checkoutId = (loc.query?.checkout_id ?? loc.query?.order_id) as string | undefined
    const paymentStatus = loc.query?.payment as string | undefined

    if (checkoutId !== undefined && paymentStatus === 'success') {
      // Check if any subscription (tier or package) already matches this checkout
      const allSubs = [currentSubscription, currentPackageSubscription].filter(Boolean)
      const isMatchingSubscription = allSubs.some((s) => s?.providerCheckoutId === checkoutId)

      if (!isMatchingSubscription) {
        // No matching subscription found, start polling
        pollingCheckoutId = checkoutId
        pollAttempts = 0
        pollErrorCount = 0
        pollErrorShown = false
        void pollCheckoutStatus(checkoutId)
      } else {
        // Subscription already exists and matches this checkout, just clean up the URL
        const cleanedLoc = { ...loc, query: {} }
        navigate(cleanedLoc)
      }
    }
  }

  $: isCheckoutPolling = pollingCheckoutId !== null

  function formatEndDate (endDate: number, lang: string): string {
    const date = new Date(endDate)
    return date.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  function formatAmount (cents: number, currency: string, lang: string): string {
    try {
      return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(cents / 100)
    } catch {
      return `${cents / 100} ${currency}`
    }
  }

  $: items = [
    {
      id: 'monthly',
      labelIntl: plugin.string.PaymentMonth
    },
    {
      id: 'yearly',
      labelIntl: plugin.string.PaymentYear,
      // Discount hint is a language-neutral "−N%", built here rather than via i18n.
      badge: yearlyDiscount > 0 ? getEmbeddedLabel(`−${yearlyDiscount}%`) : undefined
    }
  ]

  async function loadPlanConfig (): Promise<void> {
    try {
      const paymentUrl = getMetadata(presentation.metadata.PaymentUrl) ?? ''
      const res = await fetch(paymentUrl + '/api/v1/plan-config')
      if (!res.ok) {
        console.warn('Failed to load plan config:', res.status)
        configError = true
        return
      }
      planConfigRaw = await res.json()
      configError = false
    } catch (err) {
      console.error('Failed to load plan config:', err)
      configError = true
    }
  }

  // Server broadcasts LimitsChanged on any plan/subscription edit (e.g. admin changing the trial) —
  // refetch so an open modal reflects it instead of showing the plan as of when it was opened.
  const txListener = (txes: Tx[]): void => {
    for (const tx of txes) {
      if (
        tx._class === core.class.TxWorkspaceEvent &&
        (tx as TxWorkspaceEvent).event === WorkspaceEvent.LimitsChanged
      ) {
        void fetchSubscriptions()
        return
      }
    }
  }

  onMount(() => {
    addTxListener(txListener)
    void (async () => {
      // First, load plan config
      await loadPlanConfig()

      // Then load current subscriptions
      await fetchSubscriptions()

      // Then fetch usage stats
      await fetchUsageStats()

      // Then check if we need to poll for a new subscription from checkout
      checkForCheckoutParam()
    })()
  })

  onDestroy(() => {
    destroyed = true
    clearTimeout(pollTimer)
    removeTxListener(txListener)
  })
</script>

{#if Object.keys(plans).length > 0 || configError}
  {#if configError && Object.keys(plans).length === 0}
    <div class="flex-col flex-gap-4" style="padding: var(--spacing-3);">
      <div>{getEmbeddedLabel('Failed to load plans')}</div>
      <Button
        label={getEmbeddedLabel('Retry')}
        kind="primary"
        on:click={() => {
          void loadPlanConfig()
        }}
      />
    </div>
  {/if}
{/if}
{#if Object.keys(plans).length > 0}
  <Scroller align={'center'} padding={'var(--spacing-3)'} bottomPadding={'var(--spacing-3)'}>
    <div class="hulyComponent-content gapV-8">
      <div class="flex-col flex-gap-4">
        <div class="section-title">
          <Label label={plugin.string.ActivePlan} />
        </div>
        <div class="current-tier-card w-full flex-gap-4">
          {#if loading || isCheckoutPolling}
            <Loading />
            {#if isCheckoutPolling}
              <div class="processing"><Label label={plugin.string.ProcessingPayment} /></div>
            {/if}
          {:else if currentPlan === undefined}
            <div class="no-plan-container flex-col flex-gap-4">
              <div class="fs-title text-lg"><Label label={plugin.string.NoActivePlan} /></div>
              <div class="text-md"><Label label={plugin.string.SelectPlanToBegin} /></div>

              {#if usageInfo !== null}
                <div class="usage-section">
                  <UsageSection
                    usage={usageInfo}
                    plan={currentPlan}
                    pkg={currentPackage}
                    tierSub={currentSubscription}
                    pkgSub={currentPackageSubscription}
                  />
                </div>
              {/if}
            </div>
          {:else}
            <div class="tier-body">
              <div class="tier-body-main flex-col flex-gap-4">
                <div class="current-tier-card-title" data-id="currentTierCard">
                  <div class="flex-row-center">
                    <div class="fs-title" data-id="currentTierName">{currentPlan.label ?? currentPlan}</div>
                    {#if isCurrentCanceled}
                      <div class="status-badge-warning ml-2 text-md" data-id="currentTierStatus">
                        <Label label={plugin.string.CancelScheduled} />
                      </div>
                    {:else if isCurrentTrial}
                      <div class="status-badge-active ml-2 text-md" data-id="currentTierStatus">
                        <Label label={plugin.string.TrialPeriod} />
                      </div>
                    {:else if currentSubscription?.status === 'active'}
                      <div class="status-badge-active ml-2 text-md" data-id="currentTierStatus">
                        <Label label={plugin.string.Active} />
                      </div>
                    {/if}
                    {#if currentSubscription?.status === 'readonly'}
                      <div class="status-badge-disabled ml-2 text-md"><Label label={plugin.string.Disabled} /></div>
                    {/if}
                  </div>
                  {#if currentSubscription?.amount != null}
                    <div class="flex-row-center items-end" data-id="currentTierAmount">
                      <span class="fs-title text-xl">
                        {formatAmount(
                          currentSubscription.amount,
                          currentPlan.currency ?? '',
                          $themeStore.language ?? DEFAULT_LOCALE
                        )}
                      </span>
                      <span class="ml-1 lower">
                        <!-- amount is the real charge: yearly total for a yearly plan, monthly otherwise. -->
                        <Label
                          label={currentSubscription.providerData?.period === 'yearly'
                            ? plugin.string.Yearly
                            : plugin.string.Monthly}
                        />
                      </span>
                    </div>
                  {/if}
                </div>
                {#if typeof currentPlan !== 'string'}
                  {#if currentPlan.description}
                    <div class="text-md content-color">{currentPlan.description}</div>
                  {/if}
                  {#if (currentPlan.features?.length ?? 0) > 0}
                    <div class="flex-col flex-gap-2">
                      {#each currentPlan.features ?? [] as feature}
                        <div class="flex-row-center flex-gap-2">
                          <IconCheckmark size="small" />
                          <span class="text-md">{feature}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                {/if}
                {#if isCurrentTrial && currentSubscription?.trialEnd != null}
                  {@const date = formatEndDate(currentSubscription.trialEnd, $themeStore.language ?? DEFAULT_LOCALE)}
                  <div class="curr-tier-hint">
                    <Label label={plugin.string.TrialEndsHint} params={{ date }} />
                  </div>
                {:else if currentSubscription?.periodEnd || currentPlan.free !== true || isCurrentCanceled}
                  <div class="curr-tier-footer">
                    {#if currentSubscription?.periodEnd}
                      {@const date = formatEndDate(
                        currentSubscription.periodEnd,
                        $themeStore.language ?? DEFAULT_LOCALE
                      )}
                      {#if isCurrentCanceled}
                        <div><Label label={plugin.string.SubscriptionValidUntil} params={{ date }} /></div>
                      {:else}
                        <div><Label label={plugin.string.SubscriptionRenews} params={{ date }} /></div>
                      {/if}
                    {/if}

                    <div class="curr-tier-actions">
                      {#if isCurrentPerSeat && !isReadOnly}
                        <Button
                          label={plugin.string.ChangeSeats}
                          kind="regular"
                          dataId="changeSeats"
                          disabled={loading || isCheckoutPolling || isCanceling || isUpdating || isRetrying}
                          on:click={openChangeSeats}
                        />
                      {/if}
                      {#if !isCurrentCanceled && currentPlan.free !== true}
                        <Button
                          label={plugin.string.CancelSubscription}
                          kind="ghost"
                          dataId="cancelSubscription"
                          disabled={loading || isCheckoutPolling || isCanceling || isUpdating || isRetrying}
                          on:click={() => {
                            void handleCancel()
                          }}
                        />
                      {:else if isCurrentCanceled}
                        <Button
                          label={plugin.string.UncancelSubscription}
                          kind="primary"
                          dataId="uncancelSubscription"
                          disabled={loading || isCheckoutPolling || isUncanceling || isUpdating || isRetrying}
                          on:click={() => {
                            void handleUncancel()
                          }}
                        />
                      {/if}
                    </div>
                  </div>
                {/if}

                {#if currentPackage !== undefined}
                  <div class="current-package-block flex-col flex-gap-2">
                    <Label label={plugin.string.AdditionalPackage} />
                    <div class="current-tier-card-title">
                      <div class="flex-row-center">
                        <div class="fs-title">{currentPackage?.description}</div>
                        {#if isPackageCanceled}
                          <div class="status-badge-warning ml-2 text-md">
                            <Label label={plugin.string.CancelScheduled} />
                          </div>
                        {:else if currentPackageSubscription?.status === 'active'}
                          <div class="status-badge-active ml-2 text-md"><Label label={plugin.string.Active} /></div>
                        {/if}
                      </div>
                      {#if currentPackageSubscription?.amount != null}
                        <div class="flex-row-center items-end">
                          <span class="fs-title text-xl">
                            {formatAmount(
                              currentPackageSubscription.amount,
                              currentPackage.currency ?? '',
                              $themeStore.language ?? DEFAULT_LOCALE
                            )}
                          </span>
                          <span class="ml-1 lower">
                            <Label label={plugin.string.Monthly} />
                          </span>
                        </div>
                      {/if}
                    </div>
                    <div class="curr-tier-footer">
                      {#if currentPackageSubscription?.periodEnd}
                        {@const pkgDate = formatEndDate(
                          currentPackageSubscription.periodEnd,
                          $themeStore.language ?? DEFAULT_LOCALE
                        )}
                        {#if isPackageCanceled}
                          <div><Label label={plugin.string.SubscriptionValidUntil} params={{ date: pkgDate }} /></div>
                        {:else}
                          <div><Label label={plugin.string.SubscriptionRenews} params={{ date: pkgDate }} /></div>
                        {/if}
                      {/if}

                      {#if !isReadOnly}
                        {#if !isPackageCanceled}
                          <Button
                            label={plugin.string.Disconnect}
                            kind="ghost"
                            disabled={loading || isCheckoutPolling || isUpdating || isPackageBusy}
                            on:click={() => {
                              void handlePackageCancel()
                            }}
                          />
                        {:else}
                          <Button
                            label={plugin.string.UncancelSubscription}
                            kind="primary"
                            disabled={loading || isCheckoutPolling || isUpdating || isPackageBusy}
                            on:click={() => {
                              void handlePackageUncancel()
                            }}
                          />
                        {/if}
                      {/if}
                    </div>
                  </div>
                {/if}
                {#if currentSubscription?.status === 'past_due' && currentSubscription.providerData?.pending !== true}
                  <div class="past-due-warning flex-col flex-gap-2">
                    <div class="flex-row-center flex-gap-2">
                      <span class="fs-title">
                        <Label label={plugin.string.PaymentFailed} />
                      </span>
                    </div>
                    <div class="text-md">
                      <Label label={plugin.string.PaymentFailedDescription} />
                    </div>
                    <div class="flex-row-center flex-gap-2">
                      <Button
                        label={plugin.string.RetryPayment}
                        kind="primary"
                        disabled={isRetrying || isUpdating || isCanceling || isUncanceling || isCheckoutPolling}
                        on:click={() => {
                          void retryPayment()
                        }}
                      />
                    </div>
                  </div>
                {/if}
              </div>
              {#if usageInfo !== null}
                <div class="usage-section tier-body-usage">
                  <UsageSection
                    usage={usageInfo}
                    plan={currentPlan}
                    pkg={currentPackage}
                    tierSub={currentSubscription}
                    pkgSub={currentPackageSubscription}
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="flex-col flex-gap-4">
        <div class="section-title">
          <Label label={isReadOnly ? plugin.string.RestrictedPlans : plugin.string.AllPlans} />
        </div>
        {#if items.length > 0}
          <div class="flex flex-gap-4">
            <Switcher
              name={'monthlyYearlyActions'}
              {items}
              selected={paymentPeriod}
              kind={'subtle'}
              on:select={(e) => {
                if (e !== undefined && e.detail.id !== undefined) paymentPeriod = e.detail.id
              }}
            />
          </div>
        {/if}
        <Scroller contentDirection="horizontal" buttons={false} showOverflowArrows shrink={false} noFade={false}>
          <div class="flex-stretch flex-gap-4 flex-no-shrink mb-3">
            {#each Object.entries(plans) as [planKey, planItem] (planKey)}
              {@const color =
                planItem.color !== null && planItem.color !== undefined && planItem.color.length > 0
                  ? getPlatformColorByName(planItem.color, $themeStore.dark)
                  : null}
              {@const bgAttr = $themeStore.dark ? 'background' : 'background-color'}
              {@const rawSeats = seatsByPlan[planKey] ?? minSeats}
              {@const seats = Math.max(rawSeats, minSeats)}
              {@const perUserBaseVal = monthlyPerUserBase(planItem)}
              {@const hasPerUser = Number.isFinite(perUserBaseVal)}
              {@const monthlyPerUserVal = hasPerUser ? monthly(perUserBaseVal, planItem, paymentPeriod) : 0}
              {@const priceLocale = $themeStore.language ?? DEFAULT_LOCALE}
              {@const monthlyVal =
                planItem.priceMonthly != null
                  ? monthly(planItem.priceMonthly, planItem, paymentPeriod).toLocaleString(priceLocale)
                  : undefined}
              {@const total = paymentPeriod === 'yearly' ? monthlyPerUserVal * 12 * seats : monthlyPerUserVal * seats}
              <div
                class="tier-card"
                data-id={`planCard-${planKey}`}
                style={color !== null && color !== undefined ? `${bgAttr}: ${color.background};` : ''}
              >
                <div class="tier-card-content">
                  <div class="fs-title text-lg">
                    {planItem.label}
                  </div>
                  <div class="flex-col h-10">
                    <span class="fs-title text-xl">
                      {#if planItem.priceMonthlyText != null}
                        {planItem.priceMonthlyText}
                      {:else}
                        {hasPerUser ? monthlyPerUserVal.toLocaleString(priceLocale) : (monthlyVal ?? '')}
                        {planItem.currency ?? ''}
                      {/if}
                    </span>
                    {#if planItem.currency != null}
                      <span class="lower">
                        <Label
                          label={planItem.priceMonthly != null ? plugin.string.Monthly : plugin.string.MonthlyPerUser}
                        />
                      </span>
                    {/if}
                  </div>
                  <div class="mb-4 h-10">
                    {planItem.description}
                  </div>
                  <div>
                    {#each planItem.limits ?? [] as limit}
                      <div class="ml-2 mb-2 font-medium">
                        - {limit}
                      </div>
                    {/each}
                  </div>

                  <div class="tier-features">
                    {#each planItem.features ?? [] as feature}
                      <div class="feature-item">
                        <span class="feature-bullet"><IconCheckmark size="small" /></span>
                        <span>{feature}</span>
                      </div>
                    {/each}
                  </div>
                </div>
                {#if planItem.priceMonthlyPerUser != null && planItem.contactSales !== true && canPurchase(planKey, planItem, currentPlanKey, isReadOnly, isCurrentTrial)}
                  <div class="seats-section flex-col flex-gap-2">
                    <Label label={plugin.string.UsersCount} />:
                    <input
                      class="seats-input"
                      type="number"
                      min={minSeats}
                      step="1"
                      data-id={`planSeats-${planKey}`}
                      value={rawSeats}
                      id={`planSeats-${planKey}`}
                      on:input={(e) => {
                        setSeats(planKey, Number(e.currentTarget.value))
                      }}
                      on:blur={() => {
                        clampSeats(planKey)
                      }}
                    />
                    <div class="flex-row-center items-end flex-gap-1">
                      <Label label={plugin.string.Total} />:
                      <span class="fs-title">
                        {total.toLocaleString(priceLocale)}
                        {planItem.currency ?? ''}
                      </span>
                    </div>
                  </div>
                {/if}
                <div class="tier-card-footer">
                  {#if planItem.contactSales === true}
                    <Button
                      label={plugin.string.ContactSales}
                      dataId={`planContactSales-${planKey}`}
                      size={'large'}
                      kind={'regular'}
                      on:click={() => {
                        void openSalesMail(planKey)
                      }}
                    />
                  {:else if canPurchase(planKey, planItem, currentPlanKey, isReadOnly, isCurrentTrial)}
                    <Button
                      label={currentPlanKey === undefined || (isCurrentTrial && currentPlanKey === planKey)
                        ? plugin.string.Subscribe
                        : plugin.string.ChangePlan}
                      dataId={`planSubscribe-${planKey}`}
                      size={'large'}
                      kind={currentPlanKey === undefined ||
                      (isCurrentTrial && currentPlanKey === planKey) ||
                      planItem.index > (plans[currentPlanKey]?.index ?? -1)
                        ? 'primary'
                        : 'regular'}
                      disabled={loading ||
                        isCheckoutPolling ||
                        isUpdating ||
                        isCanceling ||
                        isUncanceling ||
                        isRetrying ||
                        otherTierCheckoutActive}
                      showTooltip={otherTierCheckoutActive
                        ? { label: plugin.string.OtherCheckoutActiveTooltip }
                        : undefined}
                      on:click={() => {
                        void handlePlanChange(planKey, planItem)
                      }}
                    />
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </Scroller>
      </div>

      {#if Object.keys(packages).length > 0}
        <div class="flex-col flex-gap-4 packages-section">
          <div class="section-title">
            <Label label={plugin.string.AdditionalSpace} />
          </div>
          {#if arePackagesAvailable}
            <Scroller contentDirection="horizontal" buttons={false} showOverflowArrows shrink={false} noFade={false}>
              <div class="flex-stretch flex-gap-4 flex-no-shrink mb-3">
                {#each Object.entries(packages) as [pkgKey, pkgItem] (pkgItem.description)}
                  {@const priceLocale = $themeStore.language ?? DEFAULT_LOCALE}
                  <div class="tier-card">
                    <div class="tier-card-content">
                      <div class="package-item">
                        <IconStorage size="medium" />
                        <span class="fs-title text-lg">{pkgItem.description}</span>
                      </div>
                      <div class="flex-row-center items-end">
                        <span class="fs-title text-l">
                          {pkgItem.priceMonthly.toLocaleString(priceLocale)}
                          {pkgItem.currency}
                        </span>
                        <span class="ml-1 lower">
                          <Label label={plugin.string.Monthly} />
                        </span>
                      </div>
                      <div class="tier-card-footer">
                        {#if !isReadOnly && currentPackageSubscription?.plan !== pkgKey}
                          <Button
                            label={plugin.string.Connect}
                            size={'large'}
                            kind={'secondary'}
                            dataId={`packageConnect-${pkgKey}`}
                            disabled={loading || isCheckoutPolling || isUpdating || otherPackageCheckoutActive}
                            showTooltip={otherPackageCheckoutActive
                              ? { label: plugin.string.OtherCheckoutActiveTooltip }
                              : undefined}
                            on:click={() => {
                              void handleChangePackage(pkgKey)
                            }}
                          />
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </Scroller>
          {/if}
        </div>
      {/if}
    </div>
  </Scroller>
{/if}

<style lang="scss">
  .section-title {
    font-weight: 500;
    font-size: 1rem;
  }

  .current-tier-card {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    width: 31rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
    padding: var(--spacing-2);
  }

  /* Active plan: plan details left, usage right. Widen the card only when usage is present. */
  .current-tier-card:has(.tier-body-usage) {
    width: 52rem;
  }

  .tier-body {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-4);
    align-items: flex-start;
  }

  .tier-body-main {
    flex: 1 1 0;
    min-width: 0;
  }

  /* Usage column: divider + padding only when it actually renders. */
  .tier-body:has(.tier-body-usage) .tier-body-main {
    border-right: 1px solid var(--theme-divider-color);
    padding-right: var(--spacing-4);
  }

  .tier-body-usage {
    flex: 1 1 0;
    min-width: 0;
    padding-top: 0;
  }

  .current-tier-card-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-badge-active {
    color: var(--theme-state-positive-color);
    background-color: var(--theme-state-positive-background-color);
    border-radius: var(--small-BorderRadius);
    padding: 0.125rem 0.5rem;
  }

  .status-badge-disabled {
    color: var(--theme-state-negative-color);
    background-color: var(--theme-state-negative-background-color);
    border-radius: var(--small-BorderRadius);
    padding: 0.125rem 0.5rem;
  }

  .status-badge-warning {
    color: var(--theme-warning-color);
    background-color: color-mix(in srgb, var(--theme-warning-color) 12%, transparent);
    border-radius: var(--small-BorderRadius);
    padding: 0.125rem 0.5rem;
  }

  .tier-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex-shrink: 0;
    width: 17rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
    padding: var(--spacing-2);
    background-color: var(--theme-button-default);
  }

  .tier-card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    min-height: 0;
  }

  .tier-features {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .feature-item {
    display: flex;
    gap: var(--spacing-0_5);
    font-size: 0.8125rem;
  }

  .feature-bullet {
    color: var(--theme-state-positive-color);
    font-weight: 600;
    flex-shrink: 0;
  }

  .package-item {
    display: flex;
    gap: var(--spacing-1);
    align-items: center;
  }

  .curr-tier-footer {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    padding-bottom: var(--spacing-2);
  }

  /* Action buttons on their own row under the renewal date. */
  .curr-tier-actions {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-2);
    align-items: center;
  }

  /* Divider above the add-on packages section. */
  .packages-section {
    padding-top: var(--spacing-4);
    border-top: 1px solid var(--theme-divider-color);
  }

  /* Divider above the active add-on package block inside the plan card. */
  .current-package-block {
    padding-top: var(--spacing-3);
    margin-top: var(--spacing-2);
    border-top: 1px solid var(--theme-divider-color);
  }

  .curr-tier-hint {
    padding-top: var(--spacing-2);
    margin-top: var(--spacing-1);
    border-top: 1px solid var(--theme-divider-color);
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
  }

  .tier-card-footer {
    display: flex;
    flex-direction: row-reverse;
    margin-top: var(--spacing-3);
    height: 2.25rem;
  }

  .seats-section {
    margin-top: var(--spacing-3);
  }

  .seats-input {
    width: 70%;
    padding: 0.375rem 0.5rem;
    color: var(--theme-content-color);
    background-color: var(--theme-button-default);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--small-BorderRadius);

    &:focus {
      outline: none;
      border-color: var(--primary-edit-border-color);
    }
  }

  .processing {
    text-align: center;
  }

  .usage-section {
    padding-top: var(--spacing-2);
    /* border-top: 1px solid var(--theme-divider-color); */
  }

  .past-due-warning {
    padding: var(--spacing-2);
  }
</style>
