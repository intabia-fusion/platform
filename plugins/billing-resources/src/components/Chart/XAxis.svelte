<script lang="ts">
  import { getUserTimezone } from '@hcengineering/ui'

  export let width: number
  export let height: number
  export let values: number[]
  export let minDistance = 80

  $: maxLabels = Math.floor(width / minDistance) + 1

  $: step = Math.max(1, Math.ceil(values.length / maxLabels))

  $: visibleValues = values.filter((_, i) => i % step === 0 || i === values.length - 1)

  $: totalRange = values[values.length - 1] - values[0]
  $: getX = (value: number) => (totalRange === 0 ? 0 : ((value - values[0]) / totalRange) * width)
</script>

<g transform={`translate(0 ${height})`}>
  {#each visibleValues as value}
    <g transform={`translate(${getX(value)} 0)`}>
      <line y1={0} y2={6} stroke="#bdc3c7" />
      <text y={10} dy="1.0em" text-anchor="middle" fill="var(--theme-halfcontent-color)">
        {new Date(value).toLocaleDateString('default', {
          timeZone: getUserTimezone(),
          day: 'numeric',
          month: 'numeric'
        })}
      </text>
    </g>
  {/each}
</g>
