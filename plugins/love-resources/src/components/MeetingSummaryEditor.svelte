<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<!--
  Summary field of a meeting: the standard collaborative editor, plus a spinner for the stretch
  between "Summarize discussion" being clicked and the pod writing the text. The request only
  queues the job, so without this the click has no visible effect for a good while.
-->
<script lang="ts">
  import { type Doc } from '@hcengineering/core'
  import { type KeyedAttribute } from '@hcengineering/presentation'
  import { summarizingStore, stopSummarizing } from '@hcengineering/chunter-resources'
  import { Spinner } from '@hcengineering/ui'
  import CollaborativeDocEditor from '@hcengineering/view-resources/src/components/CollaborativeDocEditor.svelte'

  export let object: Doc
  export let key: KeyedAttribute
  export let draft = false
  export let onChange: ((val: any) => void) | undefined = undefined

  $: generating = $summarizingStore.has(object._id)

  // The pod writes the summary into the document itself, so its arrival is the only signal that the
  // job finished - there is no completion event to subscribe to.
  $: if (generating && (object as any)[key.key] != null) {
    stopSummarizing(object._id)
  }
</script>

{#if generating}
  <div class="p-3" data-id="meeting-summary-spinner">
    <Spinner size={'small'} />
  </div>
{:else}
  <CollaborativeDocEditor {object} {key} {draft} {onChange} />
{/if}
