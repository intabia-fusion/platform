<script lang="ts">
  import type { Document } from '@hcengineering/controlled-documents'
  import { getCurrentEmployee } from '@hcengineering/contact'
  import type { DocumentQuery } from '@hcengineering/core'
  import DocumentsContainer from './DocumentsContainer.svelte'

  import documents from '../plugin'
  import type { IntlString } from '@hcengineering/platform'
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
