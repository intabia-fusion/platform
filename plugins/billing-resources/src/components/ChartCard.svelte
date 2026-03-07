<script lang="ts">
  import LineChart from './Chart/LineChart.svelte'
  import { Label } from '@hcengineering/ui'
  import type { IntlString } from '@hcengineering/platform'

  interface DataSeries {
    label: IntlString
    color: string
    data: { date: number, value: number }[]
  }

  export let label: IntlString
  export let valueFormatter: (value: number) => Promise<string> = (value) => Promise.resolve(value.toString())
  export let series: DataSeries[] = []

  function normalizeDataSet (data: { date: number, value: number }[]): { date: number, value: number }[] {
    const startDate = new Date(Date.now())
    startDate.setHours(0, 0, 0, 0)
    startDate.setDate(startDate.getDate() - 29)
    const result: { date: number, value: number }[] = []
    for (let i = 0; i < 30; i++) {
      const value = data.find((d) => d.date === startDate.getTime())?.value ?? 0
      result.push({ date: startDate.getTime(), value })
      startDate.setDate(startDate.getDate() + 1)
    }
    return result
  }

  let normalizedSeries: DataSeries[]
  $: normalizedSeries = series.map((s) => ({
    ...s,
    data: normalizeDataSet(s.data)
  }))
</script>

<div class="flex-col clear-mins stats-big-card" {...$$restProps}>
  <div class="flex-row-center">
    <span class="fs-title">
      <Label {label} />
    </span>
  </div>
  {#if series.length > 1}
    <div class="flex-row-center flex-gap-2 mt-1">
      {#each series as s}
        <div class="legend-dot" style="background-color: {s.color}" />
        <span class="text-sm"><Label label={s.label} /></span>
      {/each}
    </div>
  {/if}
  <div class="mt-2 flex-grow flex-center stats">
    <LineChart {valueFormatter} series={normalizedSeries} />
  </div>
</div>

<style lang="scss">
  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .stats-big-card {
    flex: 2 0 calc(100% - 16px);
    min-width: 24rem;
    min-height: 8rem;
    padding: 12px 16px;
    box-sizing: border-box;
    background-color: var(--theme-button-default);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.5rem;

    display: flex;

    overflow: hidden;
    word-break: break-word;
  }
</style>
