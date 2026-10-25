<script lang="ts">
  import type { Drawing } from '@hcengineering/attachment'
  import { DateRangeMode } from '@hcengineering/core'
  import ui, { DatePresenter } from '@hcengineering/ui'
  import { PersonIdPresenter } from '@hcengineering/view-resources'

  export let value: Drawing
</script>

<div class="flex-presenter flex-gap-3">
  <DatePresenter value={value.createdOn} mode={DateRangeMode.DATETIME} kind="list" icon={ui.icon.Scribble} />
  <PersonIdPresenter value={value.createdBy} withPadding={false} shouldShowName={false} />
</div>
