<script lang="ts">
  import { DateRangeMode, type Timestamp } from '@hcengineering/core'
  import { DatePresenter } from '@hcengineering/view-resources'

  export let value: Timestamp | undefined = undefined
</script>

{#if value !== undefined}
  <DatePresenter {value} mode={DateRangeMode.DATETIME} shouldShowAvatar={false} />
{/if}
