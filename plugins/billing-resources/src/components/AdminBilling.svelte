<!--
// Copyright © 2026 Intabia Fusion
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
  import { onMount } from 'svelte'
  import { Button, EditBox, Label, Loading, PaletteColorIndexes, Progress, Scroller } from '@hcengineering/ui'
  import type { AiTokensBreakdown, BillingPricing, ProviderPool } from '@hcengineering/billing-client'

  import { getBillingClient } from '../utils'
  import plugin from '../plugin'

  let loading = true
  let pools: ProviderPool[] = []
  let byModel: AiTokensBreakdown[] = []
  let byLevel: AiTokensBreakdown[] = []
  let byWorkspace: AiTokensBreakdown[] = []
  let pricing: BillingPricing | undefined
  // Per-pool "+N tokens" top-up input (provider id -> amount to add).
  const topup: Record<string, number> = {}

  // Calculator inputs: per-user monthly budget (rub) + active 5h windows per day.
  let calcRubPerUser = 25
  let calcWindowsPerDay = 2
  let calcPricePer1000 = 0.065

  // Cost of `tokens` at a price-per-1000 rate (rub).
  function cost (tokens: number, pricePer1000: number): number {
    return (tokens / 1000) * pricePer1000
  }

  // Price for a model/provider key from the pricing config (0 if unknown).
  function priceFor (key: string | undefined): number {
    if (key === undefined || pricing === undefined) return 0
    return pricing.pricePer1000[key] ?? 0
  }

  function fmtRub (v: number): string {
    return `${v.toFixed(2)} ₽`
  }

  // Suggested limits from budget + windows/day (5h = budget / windows-per-month).
  $: calcBudgetTokens = calcPricePer1000 > 0 ? Math.floor((calcRubPerUser / calcPricePer1000) * 1000) : 0
  $: calcWindow5h = Math.floor(calcBudgetTokens / Math.max(1, calcWindowsPerDay * 30))
  $: calcWindowWeek = Math.floor(calcBudgetTokens / 4)

  // Forecast: extrapolate current-month spend to month end by elapsed fraction.
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const elapsedFrac = Math.min(1, now.getDate() / daysInMonth)
  $: forecastCost = elapsedFrac > 0 ? totalCost / elapsedFrac : totalCost
  $: forecastVsBudget = calcRubPerUser > 0 ? Math.round((forecastCost / calcRubPerUser) * 100) : 0

  async function reloadPools (): Promise<void> {
    const client = getBillingClient()
    if (client !== null) pools = await client.listProviderPools()
  }

  async function addTokens (providerId: string): Promise<void> {
    const delta = topup[providerId]
    if (delta === undefined || delta <= 0) return
    const client = getBillingClient()
    if (client === null) return
    await client.addProviderPoolTokens(providerId, delta)
    topup[providerId] = 0
    await reloadPools()
  }

  // Color a usage bar by how close it is to the limit: green < 80%, amber < 100%, red.
  function barColor (pct: number): number | undefined {
    if (pct >= 100) return PaletteColorIndexes.Firework
    if (pct >= 80) return PaletteColorIndexes.Sunshine
    return undefined
  }

  function pct (used: number, total: number): number {
    if (total <= 0) return 0
    return Math.min(100, Math.round((used / total) * 100))
  }

  // Render a breakdown row as % of the largest bucket (relative spend), not raw numbers.
  function relPct (value: number, max: number): number {
    if (max <= 0) return 0
    return Math.round((value / max) * 100)
  }

  $: modelMax = byModel.reduce((m, b) => Math.max(m, b.totalTokens), 0)
  $: levelMax = byLevel.reduce((m, b) => Math.max(m, b.totalTokens), 0)

  onMount(async () => {
    const client = getBillingClient()
    if (client === null) {
      loading = false
      return
    }
    try {
      ;[pools, byModel, byLevel, byWorkspace, pricing] = await Promise.all([
        client.listProviderPools(),
        client.getTokenUsage('model'),
        client.getTokenUsage('level'),
        client.getTokenUsage('workspace'),
        client.getPricing()
      ])
    } finally {
      loading = false
    }
  })

  $: totalCost = byModel.reduce((s, b) => s + cost(b.totalTokens, priceFor(b.model)), 0)
</script>

{#if loading}
  <Loading />
{:else}
  <Scroller>
    <div class="flex-col flex-gap-6 p-6">
      <section class="flex-col flex-gap-3">
        <div class="fs-title"><Label label={plugin.string.ProviderPools} /></div>
        {#if pools.length === 0}
          <span class="content-dark-color"><Label label={plugin.string.NoProviderPools} /></span>
        {/if}
        {#each pools as pool (pool.providerId)}
          {@const unlimited = pool.kind === 'local' || pool.purchasedTokens <= 0}
          {@const usedPct = unlimited ? 0 : pct(pool.usedTokens, pool.purchasedTokens)}
          <div class="flex-col flex-gap-1">
            <div class="flex-between text-md">
              <span class="pr-2">{pool.providerId} ({pool.kind})</span>
              <span>{unlimited ? '∞' : `${usedPct}%`}</span>
            </div>
            {#if !unlimited}
              <Progress value={usedPct} max={100} color={barColor(usedPct)} fallback={100} />
            {/if}
            {#if pool.kind !== 'local'}
              <div class="flex-row-center flex-gap-2 mt-1">
                <EditBox
                  kind="default"
                  format="number"
                  bind:value={topup[pool.providerId]}
                  placeholder={plugin.string.AddTokens}
                />
                <Button label={plugin.string.AddTokens} kind="regular" on:click={() => addTokens(pool.providerId)} />
              </div>
            {/if}
          </div>
        {/each}
      </section>

      <section class="flex-col flex-gap-3">
        <div class="flex-between fs-title">
          <Label label={plugin.string.ByModel} />
          <span>{fmtRub(totalCost)}</span>
        </div>
        {#each byModel as row (row.model)}
          <div class="flex-col flex-gap-1">
            <div class="flex-between text-md">
              <span class="pr-2">{row.model !== undefined && row.model !== '' ? row.model : '—'}</span>
              <span class="flex-row-center flex-gap-2">
                <span class="content-dark-color">{fmtRub(cost(row.totalTokens, priceFor(row.model)))}</span>
                <span>{relPct(row.totalTokens, modelMax)}%</span>
              </span>
            </div>
            <Progress value={relPct(row.totalTokens, modelMax)} max={100} fallback={100} />
          </div>
        {/each}
      </section>

      <section class="flex-col flex-gap-3">
        <div class="fs-title"><Label label={plugin.string.ByLevel} /></div>
        {#each byLevel as row (row.level)}
          <div class="flex-col flex-gap-1">
            <div class="flex-between text-md">
              <span class="pr-2">{row.level !== undefined && row.level !== '' ? row.level : '—'}</span>
              <span>{relPct(row.totalTokens, levelMax)}%</span>
            </div>
            <Progress value={relPct(row.totalTokens, levelMax)} max={100} fallback={100} />
          </div>
        {/each}
      </section>

      <section class="flex-col flex-gap-3">
        <div class="fs-title"><Label label={plugin.string.ByWorkspace} /></div>
        {#each byWorkspace as row (row.workspace)}
          <div class="flex-between text-md">
            <span class="pr-2">{row.workspace ?? '—'}</span>
            <span>{row.totalTokens.toLocaleString('en-US')}</span>
          </div>
        {/each}
      </section>

      <section class="flex-col flex-gap-3">
        <div class="fs-title"><Label label={plugin.string.Calculator} /></div>
        <div class="flex-row-center flex-gap-4">
          <div class="flex-col flex-gap-1">
            <span class="text-sm content-dark-color"><Label label={plugin.string.BudgetPerUser} /></span>
            <EditBox format="number" bind:value={calcRubPerUser} />
          </div>
          <div class="flex-col flex-gap-1">
            <span class="text-sm content-dark-color"><Label label={plugin.string.WindowsPerDay} /></span>
            <EditBox format="number" bind:value={calcWindowsPerDay} />
          </div>
          <div class="flex-col flex-gap-1">
            <span class="text-sm content-dark-color"><Label label={plugin.string.PricePer1000} /></span>
            <EditBox format="number" bind:value={calcPricePer1000} />
          </div>
        </div>
        <div class="flex-col flex-gap-1 text-md">
          <div class="flex-between">
            <Label label={plugin.string.MonthlyBudgetTokens} />
            <span>{calcBudgetTokens.toLocaleString('en-US')}</span>
          </div>
          <div class="flex-between">
            <Label label={plugin.string.SuggestedWindow5h} />
            <span>{calcWindow5h.toLocaleString('en-US')}</span>
          </div>
          <div class="flex-between">
            <Label label={plugin.string.SuggestedWindowWeek} />
            <span>{calcWindowWeek.toLocaleString('en-US')}</span>
          </div>
          {#if pricing !== undefined}
            <div class="flex-between content-dark-color">
              <Label label={plugin.string.CurrentWindows} />
              <span
                >{pricing.window5hLimitPerUser.toLocaleString('en-US')} / {pricing.windowWeekLimitPerUser.toLocaleString(
                  'en-US'
                )}</span
              >
            </div>
          {/if}
        </div>
      </section>

      <section class="flex-col flex-gap-3">
        <div class="fs-title"><Label label={plugin.string.Forecast} /></div>
        <div class="flex-col flex-gap-1 text-md">
          <div class="flex-between">
            <Label label={plugin.string.ForecastMonthly} />
            <span>{fmtRub(forecastCost)}</span>
          </div>
          <div class="flex-between content-dark-color">
            <span>{forecastVsBudget}% <Label label={plugin.string.ForecastVsBudget} /></span>
            <span>{fmtRub(calcRubPerUser)}</span>
          </div>
          <Progress
            value={Math.min(100, forecastVsBudget)}
            max={100}
            color={barColor(forecastVsBudget)}
            fallback={100}
          />
        </div>
      </section>
    </div>
  </Scroller>
{/if}
