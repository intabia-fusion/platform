<script lang="ts">
  import Line from './Line.svelte'
  import XAxis from './XAxis.svelte'
  import GridLines from './GridLines.svelte'

  interface DataSeries {
    color: string
    data: { date: number, value: number }[]
  }

  export let valueFormatter: (value: number) => Promise<string>
  export let series: DataSeries[] = []

  const margin = {
    top: 20,
    right: 20,
    bottom: 30,
    left: 60
  }

  let width = 100
  $: height = 0.3 * width

  $: innerWidth = width - margin.left - margin.right
  $: innerHeight = height - margin.top - margin.bottom

  $: allValues = series.flatMap((s) => s.data.map((d) => d.value))
  $: dates = series.length > 0 ? series[0].data.map((d) => d.date) : []
</script>

<div class="wrapper" bind:clientWidth={width}>
  <svg role="img" {width} {height}>
    <g transform={`translate(${margin.left}, ${margin.top})`}>
      <XAxis height={innerHeight} width={innerWidth} values={dates} />
      <GridLines height={innerHeight} width={innerWidth} {valueFormatter} values={allValues} />
      {#each series as s}
        <Line height={innerHeight} width={innerWidth} data={s.data} sharedValues={allValues} color={s.color} />
      {/each}
    </g>
  </svg>
</div>

<style>
  .wrapper {
    position: relative;
    width: 100%;
  }
</style>
