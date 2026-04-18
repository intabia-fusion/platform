<script lang="ts">
  import { Issue } from '@intabiafusion/tracker'
  import { DocReferencePresenter } from '@intabiafusion/view-resources'

  export let value: Issue
</script>

<DocReferencePresenter {value} on:click>
  <slot />
</DocReferencePresenter>
