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
  import { type SubscriptionData } from '@hcengineering/account-client'
  import { type CheckoutStatus } from '@hcengineering/payment-client'
  import { getMetadata, translate } from '@hcengineering/platform'
  import presentation, { getClient, MessageBox } from '@hcengineering/presentation'
  import billing, { type Tier } from '@hcengineering/billing'
  import { UsageStatus } from '@hcengineering/core'
  import {
    Label,
    Loading,
    Scroller,
    Button,
    themeStore,
    getLocation,
    navigate,
    showPopup,
    addNotification,
    NotificationSeverity
  } from '@hcengineering/ui'
  import { onMount, onDestroy } from 'svelte'

  import plugin from '../plugin'
  import { getAccountClient, getPaymentClient, getPaymenterClient } from '../utils'
  import { type PaymenterPlanInfo } from '@hcengineering/paymenter-client'

  import UsageSection from './UsageSection.svelte'
  import BillingErrorNotification from './BillingErrorNotification.svelte'

  const client = getClient()
  const paymentClient = getPaymentClient()

  const paymenterClient = getPaymenterClient()

  const tiers = client.getModel().findAllSync(billing.class.Tier, {})
  const tierByPlan: Record<string, Tier> = {}
  for (const tier of tiers) {
    const parts = (tier._id as string).split(':')
    if (parts.length >= 3) {
      tierByPlan[parts[2].toLowerCase()] = tier
    }
  }

  export let isReadOnly: boolean = false

  let currentSubscription: SubscriptionData | undefined = undefined
  let currentTier: any = undefined
  let loading = true
  let pollingCheckoutId: string | null = null
  let isPolling = false
  let pollAttempts = 0
  let pollTimer: any
  let isCanceling = false
  let isUncanceling = false
  const MAX_POLL_ATTEMPTS = 120
  const POLL_INTERVAL = 2000

  let usageInfo: UsageStatus | null = null
  let paymenterPlans: PaymenterPlanInfo[] = []
  let paymenterLoading = false

  $: isCurrentCanceled = currentSubscription?.canceledAt !== undefined && currentSubscription.canceledAt > 0

  async function showErrorNotification (): Promise<void> {
    addNotification(
      await translate(plugin.string.SubscriptionOperationFailed, {}, $themeStore.language),
      await translate(plugin.string.SubscriptionErrorMessage, {}, $themeStore.language),
      BillingErrorNotification,
      undefined,
      NotificationSeverity.Error
    )
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
      currentTier = plan !== undefined ? tierByPlan[plan] : undefined
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

  async function fetchPaymenterPlans (): Promise<void> {
    if (paymenterClient == null) return
    paymenterLoading = true
    try {
      paymenterPlans = await paymenterClient.getPlans()
    } catch (err) {
      console.error('Error fetching Paymenter plans:', err)
      paymenterPlans = []
    } finally {
      paymenterLoading = false
    }
  }

  function getPlanData (plan: PaymenterPlanInfo): {
    planId: string
    label: string
    slug: string
    price: number
    currencySymbol: string
    currencyCode: string
    billingPeriodText: string
  } {
    const currencyCode = plan.currencyCode ?? 'RUB'
    const currencySymbol = currencyCode === 'RUB' ? '₽' : currencyCode === 'USD' ? '$' : currencyCode

    let billingPeriodText = ''
    if (plan.planType === 'recurring' && plan.billingPeriod === 1 && plan.billingUnit === 'month') {
      billingPeriodText = plugin.string.Monthly
    } else if (plan.planType === 'recurring' && plan.billingUnit != null && plan.billingPeriod != null) {
      billingPeriodText = `/${plan.billingPeriod} ${plan.billingUnit}`
    }

    return {
      planId: plan.planId,
      label: plan.productName,
      slug: plan.productSlug,
      price: plan.price,
      currencySymbol,
      currencyCode,
      billingPeriodText
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

  onMount(() => {
    void (async () => {
      // First, load current subscriptions
      await fetchSubscriptions()

      // Then fetch usage stats
      await fetchUsageStats()

      // Fetch Paymenter plans
      await fetchPaymenterPlans()

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

{#if tiers.length > 0}
  <Scroller align={'center'} padding={'var(--spacing-3)'} bottomPadding={'var(--spacing-3)'}>
    <div class="hulyComponent-content gapV-8">
      <div class="flex-col flex-gap-4">
        <!-- <div class="section-title">
          <Label label={plugin.string.ActivePlan} />
        </div> -->
        <div class="current-tier-card w-full flex-gap-4">
          {#if loading || isCheckoutPolling}
            <Loading />
            {#if isCheckoutPolling}
              <div class="processing"><Label label={plugin.string.ProcessingPayment} /></div>
            {/if}
          {:else if currentTier === undefined}
            <div class="no-plan-container flex-col flex-gap-4">
              <!-- <div class="fs-title text-lg"><Label label={plugin.string.NoActivePlan} /></div>
              <div class="text-md"><Label label={plugin.string.SelectPlanToBegin} /></div> -->

              {#if usageInfo !== null}
                <div class="usage-section">
                  <UsageSection usage={usageInfo} tier={currentTier} />
                </div>
              {/if}
            </div>
          {:else}
            <!-- <div class="current-tier-card-title">
              <div class="flex-row-center">
                <div class="fs-title"><Label label={currentTier.label} /></div>
                {#if currentSubscription?.status === 'active'}
                  <div class="status-badge ml-2 text-md"><Label label={plugin.string.Active} /></div>
                {/if}
              </div>
              {#if currentSubscription?.amount}
                <div class="flex-row-center items-end">
                  <span class="fs-title text-xl">
                    ${currentSubscription?.amount / 100}
                  </span>
                  <span class="ml-1 lower">
                    <Label label={plugin.string.Monthly} />
                  </span>
                </div>
              {/if}
            </div> -->

            {#if usageInfo !== null}
              <div class="usage-section">
                <UsageSection usage={usageInfo} tier={currentTier} />
              </div>
            {/if}

            <!-- <div class="curr-tier-footer">
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
            </div> -->
          {/if}
        </div>
      </div>

      <div class="flex-col flex-gap-4">
        <div class="plans-header">
          <div class="section-title">
            <Label label={isReadOnly ? plugin.string.RestrictedPlans : plugin.string.AllPlans} />
          </div>
          <Button
            label={plugin.string.GoToStore}
            size={'small'}
            kind={'primary'}
            on:click={() => {
              const paymenterUrl = getMetadata(billing.metadata.PaymenterURL)
              if (paymenterUrl !== undefined && paymenterUrl !== '') {
                window.open(`${paymenterUrl}/products/platform`, '_blank')
              }
            }}
          />
        </div>
        <div class="plans-grid">
          {#each paymenterPlans as plan}
            {@const planData = getPlanData(plan)}
            <div class="tier-card">
              <div class="tier-card-content">
                <div class="fs-title text-lg">
                  <Label label={planData.label} />
                </div>
                <div class="flex-row-center items-end">
                  <span class="fs-title text-xl">
                    {planData.currencySymbol}{planData.price}
                  </span>
                  {#if planData.billingPeriodText}
                    <span class="ml-1 lower">
                      <Label label={planData.billingPeriodText} />
                    </span>
                  {/if}
                </div>
              </div>
              <div class="tier-card-footer">
                <Button
                  label={plugin.string.GoTo}
                  size={'small'}
                  kind={'primary'}
                  on:click={() => {
                    const paymenterUrl = getMetadata(billing.metadata.PaymenterURL)
                    if (paymenterUrl !== undefined && paymenterUrl !== '') {
                      window.open(`${paymenterUrl}/products/platform/${planData.slug}`, '_blank')
                    }
                  }}
                />
              </div>
            </div>
          {/each}
        </div>
        </div>
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

  .plans-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-1);
  }

  .plans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: var(--spacing-4);
  }

  .tier-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
    padding: var(--spacing-3);
    background-color: var(--theme-button-default);
  }

  .tier-card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .tier-card-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--spacing-3);
    padding-top: var(--spacing-2);
    border-top: 1px solid var(--theme-divider-color);
  }

  .usage-section {
    padding-top: var(--spacing-2);
    /* border-top: 1px solid var(--theme-divider-color); */
  }
</style>
