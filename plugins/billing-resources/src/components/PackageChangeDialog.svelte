<!--
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
  import { createEventDispatcher } from 'svelte'
  import { Card } from '@hcengineering/presentation'
  import { Label, themeStore } from '@hcengineering/ui'
  import { type SubscriptionData } from '@hcengineering/payment-client'
  import plugin from '../plugin'
  import { proratePackage } from '../proration'

  // The active package subscription being replaced, and the target package price/label.
  export let subscription: SubscriptionData
  export let currentLabel: string = '' // currently connected package
  export let targetLabel: string = '' // package the user picked
  export let targetPriceKopecks: number // recurring price of the new package (kopecks)
  export let currency: string = ''

  const dispatch = createEventDispatcher()
  const DEFAULT_LOCALE = 'ru'
  $: lang = $themeStore.language ?? DEFAULT_LOCALE

  $: canPreview = subscription.amount != null && subscription.periodStart != null && subscription.periodEnd != null
  $: preview = canPreview
    ? proratePackage({
      oldAmount: subscription.amount ?? 0,
      periodStart: subscription.periodStart ?? 0,
      periodEnd: subscription.periodEnd ?? 0,
      now: Date.now(),
      newFullPrice: targetPriceKopecks
    })
    : undefined

  $: isUpgrade = preview?.isUpgrade ?? false
  $: extraDays =
    preview !== undefined && subscription.periodEnd != null
      ? Math.max(0, Math.round((preview.periodEnd - subscription.periodEnd) / (24 * 3600 * 1000)))
      : 0

  function fmt (kopecks: number): string {
    return new Intl.NumberFormat(lang).format(Math.round(kopecks / 100))
  }
  function fmtDate (ms: number): string {
    return new Date(ms).toLocaleDateString(lang)
  }

  async function apply (): Promise<void> {
    dispatch('close', true)
  }
</script>

<Card
  label={plugin.string.ConfirmConnectPackage}
  okLabel={plugin.string.Connect}
  width="small"
  okAction={apply}
  canSave={true}
  on:close={() => {
    dispatch('close')
  }}
  on:changeContent
>
  <div class="flex-col flex-gap-4" data-id="packageChangeDialog">
    <div class="text-md content-color">
      <Label label={plugin.string.ReplacePackageSwitch} params={{ current: currentLabel, target: targetLabel }} />
    </div>

    {#if preview !== undefined}
      <div class="preview flex-col flex-gap-2" data-id="packagePreview">
        {#if isUpgrade}
          <div data-id="packageChargeRow">
            <Label label={plugin.string.SeatChargeNow} params={{ amount: `${fmt(preview.charge)} ${currency}` }} />
          </div>
        {:else}
          <div data-id="packageExtendRow">
            <Label
              label={plugin.string.SeatDowngradeExtends}
              params={{ days: extraDays, date: fmtDate(preview.periodEnd) }}
            />
          </div>
        {/if}
        <div class="dark-color text-sm" data-id="packageNewPrice">
          <Label
            label={plugin.string.NewRecurringPrice}
            params={{ amount: `${fmt(targetPriceKopecks)} ${currency}` }}
          />
        </div>
      </div>
    {/if}
  </div>
</Card>

<style lang="scss">
  .preview {
    padding: var(--spacing-2);
    border-radius: var(--small-BorderRadius);
    background: var(--theme-bg-color);
  }
</style>
