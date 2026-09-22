<script lang="ts">
  import { themeStore, formatDuration, tooltip } from '@hcengineering/ui'
  import { WorkSlot } from '@hcengineering/time'
  import time from '../plugin'
  import { splitEventsDuration } from '../utils'

  export let events: WorkSlot[]

  let spent: string = ''
  let planned: string = ''
  $: split = splitEventsDuration(events)
  $: formatDuration(split.spent, $themeStore.language).then((res) => {
    spent = res
  })
  $: formatDuration(split.planned, $themeStore.language).then((res) => {
    planned = res
  })
</script>

{#if split.spent > 0}{spent}{/if}
{#if split.planned > 0}
  <span class="ml-1 content-dark-color" use:tooltip={{ label: time.string.PlannedTime }}>+{planned}</span>
{/if}
