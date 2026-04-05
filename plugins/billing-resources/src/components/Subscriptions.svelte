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
  import { Tier } from '@hcengineering/billing'
  import { getMetadata, translate } from '@hcengineering/platform'
  import presentation, { getClient, MessageBox } from '@hcengineering/presentation'
  import { type Ref, SortingOrder, UsageStatus } from '@hcengineering/core'
  import {
    IconCheckmark,
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
  import { getAccountClient, getPaymentClient, getBillingApiUrl, getBillingApiToken } from '../utils'

  import UsageSection from './UsageSection.svelte'
  import BillingErrorNotification from './BillingErrorNotification.svelte'

  const client = getClient()
  const paymentClient = getPaymentClient()

  const tiers = client.getModel().findAllSync(plugin.class.Tier, {}, { sort: { index: SortingOrder.Ascending } })
  const tierByPlan = tiers.reduce<Record<string, Tier>>((acc, tier) => {
    const { plan } = getTypeAndPlan(tier._id)
    acc[plan] = tier
    return acc
  }, {})

  export let isReadOnly: boolean = false

  let currentSubscription: SubscriptionData | undefined = undefined
  $: currentTier = currentSubscription != null ? tierByPlan[currentSubscription.plan] : undefined
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

  // API products
  interface ApiProduct {
    id: string
    type: string
    attributes: {
      id: number
      name: string
      description: string
      image: string | null
      slug: string
      stock: number | null
      per_user_limit: number | null
      sort: number | null
      allow_quantity: string
      email_template: string | null
      hidden: boolean
      updated_at: string
      created_at: string
    }
    relationships: {
      plans: {
        data: Array<{ type: string; id: string }>
      }
    }
  }

  interface ApiPlan {
    id: string
    type: string
    attributes: {
      id: number
      name: string
      type: string
      billing_period: number | null
      billing_unit: string | null
      sort: number
    }
    relationships: {
      prices: {
        data: Array<{ type: string; id: string }>
      }
    }
  }

  interface ApiPrice {
    id: string
    type: string
    attributes: {
      id: number
      price: string
      setup_fee: number | null
      currency_code: string
    }
  }

  interface ApiResponse {
    data: ApiProduct[]
    links: Record<string, string>
    meta: Record<string, any>
    included: Array<ApiPlan | ApiPrice>
  }

  let apiProducts: ApiProduct[] = []
  let apiPlans: ApiPlan[] = []
  let apiPrices: ApiPrice[] = []
  let apiLoading = true

  async function fetchApiProducts (): Promise<void> {
    const apiUrl = getBillingApiUrl()
    const apiToken = getBillingApiToken()

    if (apiUrl === '' || apiToken === '') {
      console.warn('Billing API URL or token not configured')
      apiLoading = false
      return
    }

    apiLoading = true
    try {
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data: ApiResponse = await response.json()
      apiProducts = data.data
      apiPlans = data.included.filter((item): item is ApiPlan => item.type === 'plans') as ApiPlan[]
      apiPrices = data.included.filter((item): item is ApiPrice => item.type === 'prices') as ApiPrice[]
    } catch (error) {
      console.error('Error fetching products from API:', error)
      await showErrorNotification()
    } finally {
      apiLoading = false
    }
  }

  function getPlanForProduct (productId: string): ApiPlan | undefined {
    const product = apiProducts.find((p) => p.id === productId)
    if (product == null) return undefined

    const planId = product.relationships.plans.data[0]?.id
    if (planId == null) return undefined

    return apiPlans.find((p) => p.id === planId)
  }

  function getPriceForPlan (planId: string): ApiPrice | undefined {
    const plan = apiPlans.find((p) => p.id === planId)
    if (plan == null) return undefined

    const priceId = plan.relationships.prices.data[0]?.id
    if (priceId == null) return undefined

    return apiPrices.find((p) => p.id === priceId)
  }

  $: isCurrentCanceled = currentSubscription?.canceledAt !== undefined && currentSubscription.canceledAt > 0

  async function subscribe (tierId: Ref<Tier>): Promise<void> {
    if (paymentClient == null) {
      return
    }

    const workspace = getMetadata(presentation.metadata.WorkspaceUuid)
    if (workspace === undefined) {
      console.warn('Workspace metadata not available')
      return
    }

    try {
      const request: SubscribeRequest = getTypeAndPlan(tierId)
      const { checkoutUrl } = await paymentClient.createSubscription(workspace, request)
      window.location.href = checkoutUrl
    } catch (error) {
      console.error('Error while upgrading plan:', error)
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

  async function showPlanChangeConfirmation (newPlan: string, newTier: Tier): Promise<void> {
    if (currentTier === undefined) {
      return
    }

    const isDowngrade = newTier.priceMonthly < currentTier.priceMonthly
    const priceDifference = Math.abs(newTier.priceMonthly - currentTier.priceMonthly)

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

  async function handlePlanChange (newTierId: Ref<Tier>): Promise<void> {
    const { plan: newPlan } = getTypeAndPlan(newTierId)
    const newTier = tierByPlan[newPlan]

    if (currentSubscription?.id === undefined) {
      // No active subscription, create new one
      await subscribe(newTierId)
      return
    }

    if (currentTier === undefined) {
      // No current tier selected, should not happen but guard against it
      return
    }

    // If subscription is canceled, show uncancel confirmation first
    if (isCurrentCanceled) {
      showPopup(MessageBox, {
        label: plugin.string.ConfirmUncancel,
        message: plugin.string.UncancelDescription,
        action: async () => {
          // After uncanceling, show the plan change confirmation
          await showPlanChangeConfirmation(newPlan, newTier)
        }
      })
    } else {
      await showPlanChangeConfirmation(newPlan, newTier)
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

  function formatSize (gb: number): { limit: number, unit: string } {
    return gb < 1000 ? { limit: gb, unit: 'GB' } : { limit: Math.floor(gb / 1000), unit: 'TB' }
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

  function getTypeAndPlan (tierId: Ref<Tier>): { type: SubscriptionType, plan: string } {
    const parts = tierId.split(':')
    if (parts.length !== 3) {
      throw new Error(`Invalid tier id: ${tierId}`)
    }

    return {
      type: parts[1] as SubscriptionType,
      plan: parts[2].toLowerCase()
    }
  }

  onMount(() => {
    void (async () => {
      // First, load current subscriptions
      await fetchSubscriptions()

      // Then fetch products from billing API
      await fetchApiProducts()

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

{#if tiers.length > 0}
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
          {:else if currentTier === undefined}
            <div class="no-plan-container flex-col flex-gap-4">
              <div class="fs-title text-lg"><Label label={plugin.string.NoActivePlan} /></div>
              <div class="text-md"><Label label={plugin.string.SelectPlanToBegin} /></div>

              {#if usageInfo !== null}
                <div class="usage-section">
                  <UsageSection usage={usageInfo} tier={currentTier} />
                </div>
              {/if}
            </div>
          {:else}
            <div class="current-tier-card-title">
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
            </div>

            {#if usageInfo !== null}
              <div class="usage-section">
                <UsageSection usage={usageInfo} tier={currentTier} />
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
        {#if apiLoading}
          <Loading />
        {:else if apiProducts.length > 0}
          <div class="products-grid">
            {#each apiProducts as product}
              {@const plan = getPlanForProduct(product.id)}
              {@const price = plan != null ? getPriceForPlan(plan.id) : undefined}
              <div class="product-card">
                <div class="product-card-content">
                  <div class="product-name">{product.attributes.name}</div>
                  {#if price != null}
                    <div class="product-price">
                      <span class="price-value">{price.attributes.price}</span>
                      <span class="price-currency">{price.attributes.currency_code}</span>
                      {#if plan != null && plan.attributes.billing_period != null}
                        <span class="price-period">
                          / {plan.attributes.billing_period}
                          {plan.attributes.billing_unit ?? 'мес'}
                        </span>
                      {/if}
                    </div>
                  {/if}
                  <div class="product-description">
                    {@html product.attributes.description}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-md">Нет доступных подписок</div>
        {/if}
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

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--spacing-4);
    width: 100%;
  }

  .product-card {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);
    padding: var(--spacing-3);
    background-color: var(--theme-button-default);
    min-height: 200px;
  }

  .product-card-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .product-name {
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.4;
  }

  .product-price {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .price-value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .price-currency {
    font-size: 1rem;
    font-weight: 500;
    color: var(--theme-content-color);
  }

  .price-period {
    font-size: 0.875rem;
    color: var(--theme-content-color);
    opacity: 0.7;
  }

  .product-description {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--theme-content-color);
    opacity: 0.8;
  }

  .product-description :global(p) {
    margin: 0.5rem 0;
  }

  .product-description :global(hr) {
    border: none;
    border-top: 1px solid var(--theme-divider-color);
    margin: 0.75rem 0;
  }

  .product-description :global(ul) {
    padding-left: 1.25rem;
    margin: 0.5rem 0;
  }

  .product-description :global(li) {
    margin: 0.25rem 0;
  }

  .product-description :global(strong) {
    font-weight: 600;
  }

  .processing {
    text-align: center;
  }

  .usage-section {
    padding-top: var(--spacing-2);
    /* border-top: 1px solid var(--theme-divider-color); */
  }
</style>
