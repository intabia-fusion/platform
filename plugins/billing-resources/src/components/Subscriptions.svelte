<!--
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
-->
<script lang="ts">
  import { type SubscriptionData, SubscriptionStatus, SubscriptionType } from '@hcengineering/account-client'
  import { type SubscribeRequest, type CheckoutStatus } from '@hcengineering/payment-client'
  import { type PlanItem, type PlanConfig, type PackageItem } from '@hcengineering/billing'
  import { getMetadata, translate, getEmbeddedLabel } from '@hcengineering/platform'
  import presentation, { MessageBox, getClient } from '@hcengineering/presentation'
  import { UsageStatus } from '@hcengineering/core'
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
    NotificationSeverity
  } from '@hcengineering/ui'
  import { onMount, onDestroy } from 'svelte'
  import support from '@hcengineering/support'
  import contact, { getCurrentEmployee, formatName } from '@hcengineering/contact'

  import plugin from '../plugin'
  import { getAccountClient, getPaymentClient, resolveLocale } from '../utils'

  import UsageSection from './UsageSection.svelte'
  import BillingErrorNotification from './BillingErrorNotification.svelte'

  const paymentClient = getPaymentClient()

  export let isReadOnly: boolean = false

  let planConfigRaw: PlanConfig | null = null
  $: planConfig = planConfigRaw != null ? resolveLocale(planConfigRaw, $themeStore.language) : null
  $: plans = planConfig?.plans ?? ({} satisfies Record<string, PlanItem>)
  $: packages = planConfig?.packages ?? ({} satisfies Record<string, PackageItem>)

  let currentSubscription: SubscriptionData | undefined = undefined
  let currentPackageSubscription: SubscriptionData | undefined = undefined
  // Plan key may be absent from the config (e.g. legacy plan) - fall back to the raw key for display.
  $: currentPlan =
    currentSubscription != null ? (plans[currentSubscription.plan] ?? currentSubscription.plan) : undefined
  $: currentPackage = currentPackageSubscription != null ? packages[currentPackageSubscription.plan] : undefined
  $: arePackagesAvailable =
    currentPlan != null &&
    Object.values(packages).some((pkg) => pkg.eligiblePlans?.includes(currentSubscription?.plan ?? '') ?? false)
  let loading = true
  let pollingCheckoutId: string | null = null
  let isPolling = false
  let pollAttempts = 0
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let isUpdating = false
  let isCanceling = false
  let isUncanceling = false
  let isRetrying = false
  const MAX_POLL_ATTEMPTS = 120
  const POLL_INTERVAL = 2000
  let destroyed = false
  let pollErrorCount = 0
  let pollErrorShown = false
  let configError = false

  let usageInfo: UsageStatus | null = null

  $: isCurrentCanceled = currentSubscription?.canceledAt !== undefined && currentSubscription.canceledAt > 0

  // Instant provider (mock) already activated the subscription server-side: refetch instead of
  // redirecting to a checkout page. Real providers return instant=false -> redirect as before.
  async function applyCheckout (result: { checkoutUrl: string, instant?: boolean }): Promise<void> {
    if (result.instant === true) {
      await fetchSubscriptions()
    } else {
      window.location.href = result.checkoutUrl
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
      const request: SubscribeRequest = { type: SubscriptionType.Tier, plan, quantity }
      await applyCheckout(await paymentClient.createSubscription(workspace, request))
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

    // Canceling package
    const cancelSub = currentPackageSubscription
    if (cancelSub !== undefined && pkgKey === cancelSub.plan) {
      showPopup(MessageBox, {
        label: plugin.string.ConfirmCancelPackage,
        message: '',
        dangerous: true,
        action: async () => {
          try {
            await paymentClient.cancelSubscription(cancelSub.id)
            currentPackageSubscription = undefined
          } catch (error) {
            console.error('Error canceling package:', error)
            await showErrorNotification()
          }
        }
      })
      // Connecting package when another package exists
    } else if (currentPackageSubscription !== undefined) {
      const replaceSub = currentPackageSubscription
      showPopup(MessageBox, {
        label: plugin.string.ConfirmConnectPackage,
        message: plugin.string.ReplacePackageDescription,
        params: { package: currentPackage?.description },
        action: async () => {
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
        }
      })
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
      await applyCheckout(await paymentClient.createSubscription(workspace, request))
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

  // Price used for upgrade/downgrade comparison
  function planMonthlyValue (item: PlanItem | undefined, planKey?: string): number {
    if (item == null) return 0
    if (item.free === true) return 0
    if (item.priceMonthlyPerUser != null) {
      const seats = planKey !== undefined ? seatsFor(planKey) : minSeats
      return Number(item.priceMonthlyPerUser) * seats
    }
    const n = Number(item.priceMonthly)
    return Number.isFinite(n) ? n : 0
  }

  async function showPlanChangeConfirmation (newPlan: string, newPlanItem: PlanItem): Promise<void> {
    if (currentPlan === undefined) {
      return
    }

    const quantity = newPlanItem.priceMonthlyPerUser != null ? seatsFor(newPlan) : undefined
    const newPriceMonthly = planMonthlyValue(newPlanItem, newPlan)
    const currentPriceMonthly = planMonthlyValue(currentPlan, currentSubscription?.plan)
    const isDowngrade = newPriceMonthly < currentPriceMonthly
    const isFreeDowngrade = newPlanItem.free === true
    const priceDifference = Math.abs(newPriceMonthly - currentPriceMonthly)

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

  async function executeUpdate (newPlan: string, quantity?: number): Promise<void> {
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
      const updateResult = await paymentClient.updateSubscriptionPlan(currentSubscription.id, newPlan, quantity)

      // CheckoutResponse: instant provider already activated (refetch), real one needs a checkout.
      if ('checkoutUrl' in updateResult) {
        await applyCheckout(updateResult)
        return
      }

      // It's a SubscriptionData - direct update successful
      currentSubscription = updateResult
    } catch (error) {
      console.error('Error updating subscription:', error)
      currentSubscription = snapshot
      await showErrorNotification()
    } finally {
      isUpdating = false
    }
  }

  async function openSalesMail (planKey: string): Promise<void> {
    const email = getMetadata(support.metadata.SupportEmail)
    if (email === undefined || email === '') return
    const workspace = `"${getMetadata(presentation.metadata.WorkspaceName) ?? ''}"`
    const employee = await getClient().findOne(contact.class.Person, { _id: getCurrentEmployee() })
    const user = employee !== undefined ? formatName(employee.name) : ''
    const date = new Date().toLocaleDateString($themeStore.language ?? 'en')
    const subject = await translate(
      plugin.string.ContactSalesSubject,
      { workspace, user, date, plan: planKey },
      $themeStore.language
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

      // Include non-active subscriptions (e.g. past_due) so the payment-failed banner can be shown.
      const subscriptions = await accountClient.getSubscriptions(undefined, false)
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

  onMount(() => {
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
            <div class="current-tier-card-title">
              <div class="flex-row-center">
                <div class="fs-title">{currentPlan.label ?? currentPlan}</div>
                {#if currentSubscription?.status === 'active'}
                  <div class="status-badge-active ml-2 text-md"><Label label={plugin.string.Active} /></div>
                {/if}
                {#if currentSubscription?.status === 'readonly'}
                  <div class="status-badge-disabled ml-2 text-md"><Label label={plugin.string.Disabled} /></div>
                {/if}
              </div>
              {#if currentSubscription?.amount != null}
                <div class="flex-row-center items-end">
                  <span class="fs-title text-xl">
                    {formatAmount(currentSubscription.amount, currentPlan.currency ?? '', $themeStore.language)}
                  </span>
                  <span class="ml-1 lower">
                    <Label label={plugin.string.Monthly} />
                  </span>
                </div>
              {/if}
            </div>

            {#if currentPackage !== undefined}
              <Label label={plugin.string.AdditionalPackage} />
              <div class="current-tier-card-title" style="margin-top: -10px;">
                <div class="flex-row-center">
                  <div class="fs-title">{currentPackage?.description}</div>
                </div>
                {#if currentPackageSubscription?.amount != null}
                  <div class="flex-row-center items-end">
                    <span class="fs-title text-xl">
                      {formatAmount(
                        currentPackageSubscription.amount,
                        currentPackage.currency ?? '',
                        $themeStore.language
                      )}
                    </span>
                    <span class="ml-1 lower">
                      <Label label={plugin.string.Monthly} />
                    </span>
                  </div>
                {/if}
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
                    disabled={isRetrying}
                    on:click={() => {
                      void retryPayment()
                    }}
                  />
                </div>
              </div>
            {/if}

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

            <div class="curr-tier-footer">
              {#if currentSubscription?.periodEnd}
                {@const date = formatEndDate(currentSubscription.periodEnd, $themeStore.language)}
                {#if isCurrentCanceled}
                  <div><Label label={plugin.string.SubscriptionValidUntil} params={{ date }} /></div>
                {:else}
                  <div><Label label={plugin.string.SubscriptionRenews} params={{ date }} /></div>
                {/if}
              {/if}

              {#if !isCurrentCanceled && currentPlan.free !== true}
                <Button
                  label={plugin.string.CancelSubscription}
                  kind="ghost"
                  disabled={loading || isCheckoutPolling || isCanceling || isUpdating || isRetrying}
                  on:click={() => {
                    void handleCancel()
                  }}
                />
              {:else if isCurrentCanceled}
                <Button
                  label={plugin.string.UncancelSubscription}
                  kind="primary"
                  disabled={loading || isCheckoutPolling || isUncanceling || isUpdating || isRetrying}
                  on:click={() => {
                    void handleUncancel()
                  }}
                />
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="flex-col flex-gap-4">
        <div class="section-title">
          <Label label={isReadOnly ? plugin.string.RestrictedPlans : plugin.string.AllPlans} />
        </div>
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
                      {planItem.priceMonthly ?? planItem.priceMonthlyPerUser}
                      {planItem.currency ?? ''}
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
                {#if planItem.priceMonthlyPerUser != null && planItem.contactSales !== true && !isReadOnly && (currentPlan === undefined || currentPlan !== planItem)}
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
                        {Number(planItem.priceMonthlyPerUser) * seats}
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
                  {:else if !isReadOnly && (currentPlan === undefined || currentPlan !== planItem)}
                    <Button
                      label={currentPlan === undefined ? plugin.string.Subscribe : plugin.string.ChangePlan}
                      dataId={`planSubscribe-${planKey}`}
                      size={'large'}
                      kind={currentPlan === undefined || planItem.index > currentPlan.index ? 'primary' : 'regular'}
                      disabled={loading ||
                        isCheckoutPolling ||
                        isUpdating ||
                        isCanceling ||
                        isUncanceling ||
                        isRetrying}
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
        <div class="flex-col flex-gap-4">
          <div class="section-title">
            <Label label={plugin.string.AdditionalSpace} />
          </div>
          {#if arePackagesAvailable || currentPackage !== undefined}
            <Scroller contentDirection="horizontal" buttons={false} showOverflowArrows shrink={false} noFade={false}>
              <div class="flex-stretch flex-gap-4 flex-no-shrink mb-3">
                {#each Object.entries(packages) as [pkgKey, pkgItem] (pkgItem.description)}
                  <div class="tier-card">
                    <div class="tier-card-content">
                      <div class="package-item">
                        <IconStorage size="medium" />
                        <span class="fs-title text-lg">{pkgItem.description}</span>
                      </div>
                      <div class="flex-row-center items-end">
                        <span class="fs-title text-l">
                          {pkgItem.priceMonthly}
                          {pkgItem.currency}
                        </span>
                        <span class="ml-1 lower">
                          <Label label={plugin.string.Monthly} />
                        </span>
                      </div>
                      <div class="tier-card-footer">
                        {#if !isReadOnly}
                          {@const isConnected = currentPackage === pkgItem}
                          {@const isEligible =
                            pkgItem.eligiblePlans?.includes(currentSubscription?.plan ?? '') ?? false}
                          <Button
                            label={isConnected ? plugin.string.Disconnect : plugin.string.Connect}
                            size={'large'}
                            kind={isConnected ? 'regular' : 'secondary'}
                            disabled={loading || isCheckoutPolling || isUpdating || (!isConnected && !isEligible)}
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
          {:else}
            <div class="no-plan-container flex-col flex-gap-4">
              <div class="fs-title text-md"><Label label={plugin.string.UpgradeToAccessPackages} /></div>
            </div>
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
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--spacing-2);
    border-top: 1px solid var(--theme-divider-color);
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
