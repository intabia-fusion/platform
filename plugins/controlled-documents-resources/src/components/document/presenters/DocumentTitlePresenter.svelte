<script lang="ts">
  import documents, { Document } from '@intabiafusion/controlled-documents'
  import { Ref } from '@intabiafusion/core'

  import { getClient } from '@intabiafusion/presentation'
  import { Label } from '@intabiafusion/ui'
  import view from '@intabiafusion/view'

  export let value: Ref<Document> | undefined

  let document: Document | undefined = undefined
  const client = getClient()

  $: if (value) {
    client.findOne(documents.class.Document, { _id: value }).then((result) => {
      document = result
    })
  }
</script>

{#if document}
  {document.title}
{:else}
  <Label label={view.string.LabelNA} />
{/if}
