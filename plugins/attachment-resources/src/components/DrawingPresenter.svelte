<script lang="ts">
  import { type Drawing } from '@intabiafusion/attachment'
  import { DateRangeMode } from '@intabiafusion/core'
  import { DatePresenter, IconScribble } from '@intabiafusion/ui'
  import { PersonIdPresenter } from '@intabiafusion/view-resources'

  export let value: Drawing
</script>

<div class="flex-presenter flex-gap-3">
  <DatePresenter value={value.createdOn} mode={DateRangeMode.DATETIME} kind="list" icon={IconScribble} />
  <PersonIdPresenter value={value.createdBy} shouldShowName={false} />
</div>
