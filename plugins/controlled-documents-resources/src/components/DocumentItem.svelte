<script lang="ts">
  import type { WithLookup } from '@hcengineering/core'
  import ui, { Icon } from '@hcengineering/ui'
  import type { DocumentMeta } from '@hcengineering/controlled-documents'

  export let value: WithLookup<DocumentMeta>
</script>

<div class="flex-row-center">
  <div class="flex-center p-1 content-dark-color flex-no-shrink mr-2-5">
    <Icon icon={ui.icon.Document} size="medium" />
  </div>
  <span class="overflow-label">
    {value.title}
  </span>
</div>
