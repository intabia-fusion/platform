<script lang="ts">
  import { Document } from '@intabiafusion/controlled-documents'
  import { getCurrentEmployee } from '@intabiafusion/contact'
  import { DocumentQuery } from '@intabiafusion/core'
  import DocumentsContainer from './DocumentsContainer.svelte'

  import documents from '../plugin'
  import { IntlString } from '@intabiafusion/platform'
  import { createEventDispatcher } from 'svelte'

  export let query: DocumentQuery<Document> = {}
  export let config: [string, IntlString, object][] = []

  const dispatch = createEventDispatcher()
  const currentEmployee = getCurrentEmployee()

  $: resultQuery = {
    ...query,
    owner: currentEmployee
  }
</script>

<DocumentsContainer
  query={resultQuery}
  icon={documents.icon.Document}
  title={documents.string.MyDocuments}
  {config}
  on:action={(event) => dispatch('action', event.detail)}
/>
