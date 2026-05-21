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
  import { type TariffItem, type TariffConfig, type PackageItem } from '@hcengineering/billing'
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

  let tariffConfigRaw: TariffConfig | null = null
  $: tariffConfig = (tariffConfigRaw != null) ? resolveLocale(tariffConfigRaw, $themeStore.language) : null
  $: tariffs = tariffConfig?.tariffs ?? ({} satisfies Record<string, TariffItem>)
  $: tariffsByPlan = Object.values(tariffs).reduce<Record<string, TariffItem>>((acc, t) => {
    acc[t.plan] = t
    return acc
  }, {})
  $: packages = tariffConfig?.packages ?? ({} satisfies Record<string, PackageItem>)

  let currentSubscription: SubscriptionData | undefined = undefined
  $: currentTariff = currentSubscription != null ? tariffsByPlan[currentSubscription.plan] : undefined
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

  async function showPlanChangeConfirmation (newPlan: string, newTariff: TariffItem): Promise<void> {
    if (currentTariff === undefined) {
      return
    }

    const isDowngrade = newTariff.priceMonthly < currentTariff.priceMonthly
    const priceDifference = Math.abs(newTariff.priceMonthly - currentTariff.priceMonthly)

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

  async function handlePlanChange (tariff: TariffItem): Promise<void> {
    const newPlan = tariff.plan

    if (currentSubscription?.id === undefined) {
      // No active subscription, create new one
      await subscribe(newPlan)
      return
    }

    if (currentTariff === undefined) {
      // No current tariff selected, should not happen but guard against it
      return
    }

    // If subscription is canceled, show uncancel confirmation first
    if (isCurrentCanceled) {
      showPopup(MessageBox, {
        label: plugin.string.ConfirmUncancel,
        message: plugin.string.UncancelDescription,
        action: async () => {
          // After uncanceling, show the plan change confirmation
          await showPlanChangeConfirmation(newPlan, tariff)
        }
      })
    } else {
      await showPlanChangeConfirmation(newPlan, tariff)
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
      const plan = currentSubscription?.plan
      currentTariff = plan !== undefined ? tariffsByPlan[plan] : undefined
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
      // Check if we already have a tier subscription that matches this checkout
      const isMatchingSubscription = currentSubscription?.providerCheckoutId === checkoutId

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

  async function loadTariffConfig (): Promise<void> {
    try {
      const res = await fetch('/config/tariff-config.json')
      if (!res.ok) {
        console.warn('Failed to load tariff config:', res.status)
        return
      }
      tariffConfigRaw = await res.json()
    } catch (err) {
      console.error('Failed to load tariff config:', err)
    }
  }

  onMount(() => {
    void (async () => {
      // First, load tariff config
      await loadTariffConfig()

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

{#if Object.keys(tariffs).length > 0}
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
          {:else if currentTariff === undefined}
            <div class="no-plan-container flex-col flex-gap-4">
              <div class="fs-title text-lg"><Label label={plugin.string.NoActivePlan} /></div>
              <div class="text-md"><Label label={plugin.string.SelectPlanToBegin} /></div>

              {#if usageInfo !== null}
                <div class="usage-section">
                  <UsageSection usage={usageInfo} tariff={currentTariff} />
                </div>
              {/if}
            </div>
          {:else}
            <div class="current-tier-card-title">
              <div class="flex-row-center">
                <div class="fs-title">{currentTariff.label}</div>
                {#if currentSubscription?.status === 'active'}
                  <div class="status-badge ml-2 text-md"><Label label={plugin.string.Active} /></div>
                {/if}
              </div>
              {#if currentSubscription?.amount}
                <div class="flex-row-center items-end">
                  <span class="fs-title text-xl">
                    {currentSubscription?.amount / 100}
                    {currentTariff.currency}
                  </span>
                  <span class="ml-1 lower">
                    <Label label={plugin.string.Monthly} />
                  </span>
                </div>
              {/if}
            </div>

            {#if usageInfo !== null}
              <div class="usage-section">
                <UsageSection usage={usageInfo} tariff={currentTariff} />
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
            {#each Object.values(tariffs) as tariff (tariff.plan)}
              {@const color =
                tariff.color !== null && tariff.color !== undefined && tariff.color.length > 0
                  ? getPlatformColorByName(tariff.color, $themeStore.dark)
                  : null}
              {@const bgAttr = $themeStore.dark ? 'background' : 'background-color'}
              <div
                class="tier-card"
                style={color !== null && color !== undefined ? `${bgAttr}: ${color.background};` : ''}
              >
                <div class="tier-card-content">
                  <div class="fs-title text-lg">
                    {tariff.label}
                  </div>
                  <div class="flex-row-center items-end">
                    <span class="fs-title text-xl">
                      {tariff.priceMonthly}
                      {tariff.currency}
                    </span>
                    <span class="ml-1 lower">
                      <Label label={plugin.string.Monthly} />
                    </span>
                  </div>
                  <div class="mb-2 h-16">
                    {tariff.description}
                  </div>

                  <div class="tier-features">
                    {#each tariff.features as feature}
                      <div class="feature-item">
                        <span class="feature-bullet"><IconCheckmark size="small" /></span>
                        <span>{feature}</span>
                      </div>
                    {/each}
                  </div>
                </div>
                <div class="tier-card-footer">
                  {#if !isReadOnly && (currentTariff === undefined || currentTariff.plan !== tariff.plan)}
                    <Button
                      label={currentTariff === undefined ? plugin.string.Subscribe : plugin.string.ChangePlan}
                      size={'large'}
                      kind={currentTariff === undefined || tariff.priceMonthly > currentTariff.priceMonthly
                        ? 'primary'
                        : 'regular'}
                      disabled={loading || isCheckoutPolling || isUpdating}
                      on:click={() => {
                        void handlePlanChange(tariff)
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
          <Scroller contentDirection="horizontal" buttons={false} showOverflowArrows shrink={false} noFade={false}>
            <div class="flex-stretch flex-gap-4 flex-no-shrink mb-3">
              {#each Object.values(packages) as pkg (pkg.description)}
                <div class="tier-card">
                  <div class="tier-card-content">
                    <div class="package-item">
                      <IconStorage size="medium" />
                      <span class="fs-title text-lg">{pkg.description}</span>
                    </div>
                    <div class="flex-row-center items-end">
                      <span class="fs-title text-l">
                        {pkg.priceMonthly}
                        {pkg.currency}
                      </span>
                      <span class="ml-1 lower">
                        <Label label={plugin.string.Monthly} />
                      </span>
                    </div>
                    <div class="tier-card-footer">
                      {#if !isReadOnly}
                        <Button
                          label={plugin.string.Connect}
                          size={'large'}
                          kind={'regular'}
                          disabled={loading || isCheckoutPolling || isUpdating}
                          on:click={() => {
                            void subscribePackage(pkg.plan)
                          }}
                        />
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </Scroller>
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
