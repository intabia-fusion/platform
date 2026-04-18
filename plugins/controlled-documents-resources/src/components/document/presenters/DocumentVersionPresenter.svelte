<script lang="ts">
  import { WithLookup } from '@intabiafusion/core'
  import { Document } from '@intabiafusion/controlled-documents'
  import { Label } from '@intabiafusion/ui'
  import document from '../../../plugin'

  export let value: WithLookup<Document> | undefined
</script>

{#if value}
  <Label label={document.string.VersionValue} params={{ major: value.major, minor: value.minor }} />
{/if}
