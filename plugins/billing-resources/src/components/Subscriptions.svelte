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
  import { type SubscriptionData, SubscriptionType } from '@hcengineering/account-client'
  import { type SubscribeRequest, type CheckoutStatus } from '@hcengineering/payment-client'
  import { type PlanItem, type PlanConfig, type PackageItem } from '@hcengineering/billing'
  import { getMetadata, translate } from '@hcengineering/platform'
  import presentation, { MessageBox } from '@hcengineering/presentation'
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
  $: currentPlan = currentSubscription != null ? plans[currentSubscription.plan] : undefined
  $: currentPackage = currentPackageSubscription != null ? packages[currentPackageSubscription.plan] : undefined
  $: arePackagesAvailable =
    currentPlan != null &&
    Object.values(packages).some((pkg) => pkg.eligiblePlans?.includes(currentSubscription?.plan ?? '') ?? false)
  let loading = true
  let pollingCheckoutId: string | null = null
  let isPolling = false
  let pollAttempts = 0
  let pollTimer: any
  let isUpdating = false
  let isCanceling = false
  let isUncanceling = false
  const MAX_POLL_ATTEMPTS = 120
  const POLL_INTERVAL = 2000

  let usageInfo: UsageStatus | null = null

  $: isCurrentCanceled = currentSubscription?.canceledAt !== undefined && currentSubscription.canceledAt > 0

  async function subscribe (plan: string): Promise<void> {
    if (paymentClient == null) {
      return
    }

    const workspace = getMetadata(presentation.metadata.WorkspaceUuid)
    if (workspace === undefined) {
      console.warn('Workspace metadata not available')
      return
    }

    try {
      const request: SubscribeRequest = { type: SubscriptionType.Tier, plan }
      const { checkoutUrl } = await paymentClient.createSubscription(workspace, request)
      window.location.href = checkoutUrl
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
              window.location.href = result.checkoutUrl
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
      const { checkoutUrl } = await paymentClient.createSubscription(workspace, request)
      window.location.href = checkoutUrl
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

  async function showPlanChangeConfirmation (newPlan: string, newPlanItem: PlanItem): Promise<void> {
    if (currentPlan === undefined) {
      return
    }

    const isDowngrade = newPlanItem.priceMonthly < currentPlan.priceMonthly
    const priceDifference = Math.abs(newPlanItem.priceMonthly - currentPlan.priceMonthly)

    const title = isDowngrade ? plugin.string.ConfirmDowngrade : plugin.string.ConfirmUpgrade
    const descriptionKey = isDowngrade ? plugin.string.DowngradeDescription : plugin.string.UpgradeDescription

    showPopup(MessageBox, {
      label: title,
      message: descriptionKey,
      params: { amount: priceDifference.toFixed(2) },
      action: async () => {
        await executeUpdate(newPlan)
      }
    })
  }

  async function handlePlanChange (newPlan: string, planItem: PlanItem): Promise<void> {
    if (currentSubscription?.id === undefined) {
      // No active subscription, create new one
      await subscribe(newPlan)
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

  async function executeUpdate (newPlan: string): Promise<void> {
    if (paymentClient == null) {
      return
    }
    if (currentSubscription?.id === undefined) {
      return
    }

    try {
      isUpdating = true

      // If subscription is canceled, uncancel it first
      if (isCurrentCanceled) {
        currentSubscription = await paymentClient.uncancelSubscription(currentSubscription.id)
      }

      // Now update the plan
      const updateResult = await paymentClient.updateSubscriptionPlan(currentSubscription.id, newPlan)

      // Check if it's a CheckoutResponse (free-to-paid upgrade requires checkout)
      if ('checkoutUrl' in updateResult) {
        // Redirect to checkout URL for free-to-paid upgrade
        window.location.href = (updateResult as any).checkoutUrl
        return
      }

      // It's a SubscriptionData - direct update successful
      currentSubscription = updateResult
    } catch (error) {
      console.error('Error updating subscription:', error)
      await showErrorNotification()
    } finally {
      isUpdating = false
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

    try {
      isUncanceling = true
      currentSubscription = await paymentClient.uncancelSubscription(currentSubscription.id)
    } catch (error) {
      console.error('Error uncanceling subscription:', error)
      await showErrorNotification()
    } finally {
      isUncanceling = false
    }
  }

  async function fetchSubscriptions (): Promise<void> {
    loading = true

    try {
      const accountClient = getAccountClient()
      if (accountClient == null) return

      const subscriptions = await accountClient.getSubscriptions()
      currentSubscription = subscriptions.find((p) => p.type === 'tier')
      currentPlan = currentSubscription != null ? plans[currentSubscription.plan] : undefined
      currentPackageSubscription = subscriptions.find((p) => p.type === 'package')
      currentPackage = currentPackageSubscription != null ? packages[currentPackageSubscription.plan] : undefined
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
    if (paymentClient == null) {
      return
    }
    if (isPolling || pollAttempts >= MAX_POLL_ATTEMPTS) {
      return
    }

    isPolling = true
    pollAttempts++

    try {
      const status: CheckoutStatus = await paymentClient.getCheckoutStatus(checkoutId)

      if (status.status === 'completed') {
        // Subscription is ready, refresh subscriptions and clean up URL
        console.info('Checkout completed, subscription ready:', status.subscriptionId)
        await fetchSubscriptions()

        // Clean up the checkout_id from URL using navigate
        const loc = getLocation()
        const cleanedLoc = { ...loc, query: {} }
        navigate(cleanedLoc)

        pollingCheckoutId = null
        pollAttempts = 0
      } else {
        // Still pending, poll again after delay
        pollTimer = setTimeout(() => {
          void pollCheckoutStatus(checkoutId)
        }, POLL_INTERVAL)
      }
    } catch (err) {
      console.error('Error polling checkout status:', err)
      await showErrorNotification()
      // Retry on error (up to max attempts)
      if (pollAttempts < MAX_POLL_ATTEMPTS) {
        pollTimer = setTimeout(() => {
          void pollCheckoutStatus(checkoutId)
        }, POLL_INTERVAL)
      }
    } finally {
      isPolling = false
    }
  }

  function checkForCheckoutParam (): void {
    const loc = getLocation()
    const checkoutId = loc.query?.checkout_id as string | undefined
    const paymentStatus = loc.query?.payment as string | undefined

    if (checkoutId !== undefined && paymentStatus === 'success') {
      // Check if any subscription (tier or package) already matches this checkout
      const allSubs = [currentSubscription, currentPackageSubscription].filter(Boolean)
      const isMatchingSubscription = allSubs.some((s) => s?.providerCheckoutId === checkoutId)

      if (!isMatchingSubscription) {
        // No matching subscription found, start polling
        pollingCheckoutId = checkoutId
        pollAttempts = 0
        void pollCheckoutStatus(checkoutId)
      } else {
        // Subscription already exists and matches this checkout, just clean up the URL
        const cleanedLoc = { ...loc, query: {} }
        navigate(cleanedLoc)
      }
    }
  }

  $: isCheckoutPolling = pollingCheckoutId !== null

  function formatEndDate (endDate: number): string {
    const date = new Date(endDate)
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  async function loadPlanConfig (): Promise<void> {
    try {
      const paymentUrl = getMetadata(presentation.metadata.PaymentUrl) ?? ''
      const res = await fetch(paymentUrl + '/api/v1/plan-config')
      if (!res.ok) {
        console.warn('Failed to load plan config:', res.status)
        return
      }
      planConfigRaw = await res.json()
    } catch (err) {
      console.error('Failed to load plan config:', err)
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
    // Clean up any pending polling timer when component is destroyed
    if (pollTimer !== undefined) {
      clearTimeout(pollTimer)
    }
  })
</script>

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
                  <UsageSection usage={usageInfo} plan={currentPlan} />
                </div>
              {/if}
            </div>
          {:else}
            <div class="current-tier-card-title">
              <div class="flex-row-center">
                <div class="fs-title">{currentPlan.label}</div>
                {#if currentSubscription?.status === 'active'}
                  <div class="status-badge ml-2 text-md"><Label label={plugin.string.Active} /></div>
                {/if}
              </div>
              {#if currentSubscription?.amount}
                <div class="flex-row-center items-end">
                  <span class="fs-title text-xl">
                    {currentSubscription?.amount / 100}
                    {currentPlan.currency}
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
                {#if currentPackageSubscription?.amount}
                  <div class="flex-row-center items-end">
                    <span class="fs-title text-xl">
                      {currentPackageSubscription?.amount / 100}
                      {currentPackage.currency}
                    </span>
                    <span class="ml-1 lower">
                      <Label label={plugin.string.Monthly} />
                    </span>
                  </div>
                {/if}
              </div>
            {/if}

            {#if usageInfo !== null}
              <div class="usage-section">
                <UsageSection usage={usageInfo} plan={currentPlan} />
              </div>
            {/if}

            <div class="curr-tier-footer">
              {#if currentSubscription?.periodEnd}
                {@const date = formatEndDate(currentSubscription.periodEnd)}
                {#if isCurrentCanceled}
                  <div><Label label={plugin.string.SubscriptionValidUntil} params={{ date }} /></div>
                {:else}
                  <div><Label label={plugin.string.SubscriptionRenews} params={{ date }} /></div>
                {/if}
              {/if}

              {#if !isCurrentCanceled}
                <Button
                  label={plugin.string.CancelSubscription}
                  kind="ghost"
                  disabled={loading || isCheckoutPolling || isCanceling}
                  on:click={() => {
                    void handleCancel()
                  }}
                />
              {:else}
                <Button
                  label={plugin.string.UncancelSubscription}
                  kind="primary"
                  disabled={loading || isCheckoutPolling || isUncanceling}
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
              <div
                class="tier-card"
                style={color !== null && color !== undefined ? `${bgAttr}: ${color.background};` : ''}
              >
                <div class="tier-card-content">
                  <div class="fs-title text-lg">
                    {planItem.label}
                  </div>
                  <div class="flex-row-center items-end">
                    <span class="fs-title text-xl">
                      {planItem.priceMonthly}
                      {planItem.currency}
                    </span>
                    <span class="ml-1 lower">
                      <Label label={plugin.string.Monthly} />
                    </span>
                  </div>
                  <div class="mb-2 h-16">
                    {planItem.description}
                  </div>

                  <div class="tier-features">
                    {#each planItem.features as feature}
                      <div class="feature-item">
                        <span class="feature-bullet"><IconCheckmark size="small" /></span>
                        <span>{feature}</span>
                      </div>
                    {/each}
                  </div>
                </div>
                <div class="tier-card-footer">
                  {#if !isReadOnly && (currentPlan === undefined || currentPlan !== planItem)}
                    <Button
                      label={currentPlan === undefined ? plugin.string.Subscribe : plugin.string.ChangePlan}
                      size={'large'}
                      kind={currentPlan === undefined || planItem.priceMonthly > currentPlan.priceMonthly
                        ? 'primary'
                        : 'regular'}
                      disabled={loading || isCheckoutPolling || isUpdating}
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

  .status-badge {
    color: var(--theme-state-positive-color);
    background-color: var(--theme-state-positive-background-color);
    border-radius: var(--small-BorderRadius);
    padding: 0.125rem 0.5rem;
  }

  .tier-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex-shrink: 0;
    width: 15rem;
    // max-height: 22rem;
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

  .processing {
    text-align: center;
  }

  .usage-section {
    padding-top: var(--spacing-2);
    /* border-top: 1px solid var(--theme-divider-color); */
  }
</style>
