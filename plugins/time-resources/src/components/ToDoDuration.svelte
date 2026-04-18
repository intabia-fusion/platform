<script lang="ts">
  import { themeStore, formatDuration } from '@intabiafusion/ui'
  import { WorkSlot } from '@intabiafusion/time'
  import { calculateEventsDuration } from '../utils'

  export let events: WorkSlot[]

  let duration: string
  $: formatDuration(calculateEventsDuration(events), $themeStore.language).then((res) => {
    duration = res
  })
</script>

{duration}
