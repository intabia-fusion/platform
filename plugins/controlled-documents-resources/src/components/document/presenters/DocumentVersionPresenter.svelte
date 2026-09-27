<script lang="ts">
  import type { WithLookup } from '@hcengineering/core'
  import type { Document } from '@hcengineering/controlled-documents'
  import { Label } from '@hcengineering/ui'
  import document from '../../../plugin'

  export let value: WithLookup<Document> | undefined
</script>

{#if value}
  <Label label={document.string.VersionValue} params={{ major: value.major, minor: value.minor }} />
{/if}
