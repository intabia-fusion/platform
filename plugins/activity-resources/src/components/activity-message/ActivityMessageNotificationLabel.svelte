<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { Icon, Label, languageStore, tooltip } from '@hcengineering/ui'
  import type { DocNotifyContext } from '@hcengineering/notification'
  import notification from '@hcengineering/notification'
  import type { ActivityMessage, ActivityMessageLite } from '@hcengineering/activity'
  import activity from '@hcengineering/activity'
  import type { WithLookup } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { classIcon, contextPreview, PreviewIcon, previewTitle } from '@hcengineering/view-resources'
  import { getEmbeddedLabel } from '@hcengineering/platform'

  import ActivityMessagePreview from './ActivityMessagePreview.svelte'

  export let context: WithLookup<DocNotifyContext<ActivityMessage>>

  const client = getClient()

  let message: ActivityMessageLite | undefined = undefined
  $: message = context.message as ActivityMessageLite

  // The preview of a thread's context is the one of the document the thread is in
  $: previewStore = contextPreview(context)
  $: preview = $previewStore

  $: titleStore = previewTitle(client, preview, $languageStore)
  $: title = preview?.identifier ?? $titleStore

  // A thread in a document without a preview (an event, a to-do) is named by the class of that document
  $: parentClass = context.preview == null ? message?.attachedToClass : undefined
  $: parentLabel = parentClass != null ? client.getHierarchy().findClass(parentClass)?.label : undefined
</script>

<span class="flex-presenter flex-gap-1 font-semi-bold">
  <Label label={activity.string.Thread} />
  {#if title && preview != null}
    <span class="lower">
      <Label label={activity.string.In} />
    </span>
    <span class="flex-presenter flex-gap-0-5" use:tooltip={{ label: getEmbeddedLabel(title) }}>
      <PreviewIcon value={preview} size="small" fallback={notification.icon.Notifications} />
      {title}
    </span>
  {:else if parentLabel != null}
    <span class="lower">
      <Label label={activity.string.In} />
    </span>
    <span class="flex-presenter flex-gap-0-5">
      <Icon icon={classIcon(client, parentClass) ?? notification.icon.Notifications} size="small" />
      <Label label={parentLabel} />
    </span>
  {/if}
</span>
{#if message}
  <span class="font-normal">
    <ActivityMessagePreview value={message} readonly type="content-only" />
  </span>
{/if}
