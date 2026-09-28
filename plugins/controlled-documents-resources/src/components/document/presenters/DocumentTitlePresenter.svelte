<script lang="ts">
  import type { Document } from '@hcengineering/controlled-documents'
  import documents from '@hcengineering/controlled-documents'
  import type { Ref } from '@hcengineering/core'

  import { getClient } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  export let value: Ref<Document> | undefined

  let document: Document | undefined = undefined
  const client = getClient()

  $: if (value) {
    void client.findOne(documents.class.Document, { _id: value }).then((result) => {
      document = result
    })
  }
</script>

{#if document}
  {document.title}
{:else}
  <Label label={view.string.LabelNA} />
{/if}
