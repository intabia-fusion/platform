<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
<script lang="ts">
  import { AttributeModel } from '@hcengineering/view'
  import { ActivityUpdate, ActivityUpdateType, Markdown } from '@hcengineering/communication-types'
  import { Person } from '@hcengineering/contact'
  import { Doc } from '@hcengineering/core'

  import ActivityUpdateTagViewer from './ActivityUpdateTagViewer.svelte'
  import ActivityUpdateAttributeViewer from './attributes/ActivityUpdateAttributeViewer.svelte'
  import ActivityUpdateTypeViewer from './ActivityUpdateTypeViewer.svelte'
  import ActivityUpdateProcessViewer from './ActivityUpdateProcessViewer.svelte'
  import ActivityCollaborativeContentViewer from './ActivityCollaborativeContentViewer.svelte'

  export let model: AttributeModel | undefined = undefined
  export let update: ActivityUpdate
  export let content: Markdown
  export let doc: Doc
  export let author: Person | undefined
  export let compact = false
</script>

{#if update.type === ActivityUpdateType.Attribute}
  <ActivityUpdateAttributeViewer {model} {update} cardType={doc._class} />
{:else if update.type === ActivityUpdateType.Tag}
  <ActivityUpdateTagViewer {update} {content} />
{:else if update.type === ActivityUpdateType.Type}
  <ActivityUpdateTypeViewer {update} />
{:else if update.type === ActivityUpdateType.Process}
  <ActivityUpdateProcessViewer {update} {content} />
{:else if update.type === ActivityUpdateType.CollaborativeChange}
  <ActivityCollaborativeContentViewer {model} {update} {compact}/>
{/if}
