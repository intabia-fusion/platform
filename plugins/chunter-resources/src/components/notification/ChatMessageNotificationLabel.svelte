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
  import type { IconSize } from '@hcengineering/ui'
  import { Icon, Label, languageStore, tooltip } from '@hcengineering/ui'
  import type { DocNotifyContext } from '@hcengineering/notification'
  import notification from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import type { Class, Doc, Ref, WithLookup } from '@hcengineering/core'
  import { contextPreview, PreviewIcon, previewTitle } from '@hcengineering/view-resources'
  import type { ChatMessage, ThreadMessage } from '@hcengineering/chunter'
  import contact from '@hcengineering/contact'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import type { ActivityMessageLite } from '@hcengineering/activity'

  import chunter from '../../plugin'
  import ChatMessagePreview from '../chat-message/ChatMessagePreview.svelte'
  import ThreadMessagePreview from '../threads/ThreadMessagePreview.svelte'

  export let context: WithLookup<DocNotifyContext<ChatMessage>>

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let message: ActivityMessageLite<ChatMessage> | undefined = undefined
  $: message = context.message as ActivityMessageLite<ChatMessage>

  $: isThread = hierarchy.isDerived(context.objectClass, chunter.class.ThreadMessage)

  // The preview of a thread's context is the one of the channel the thread is in
  $: previewStore = contextPreview(context)
  $: preview = $previewStore

  $: titleStore = previewTitle(client, preview, $languageStore)
  $: channelTitle = preview?.identifier ?? $titleStore

  function toThread (message: ChatMessage): ActivityMessageLite<ThreadMessage> {
    return message as ActivityMessageLite<ThreadMessage>
  }

  function isAvatarIcon (_class?: Ref<Class<Doc>>): boolean {
    if (_class == null) return false
    return hierarchy.isDerived(_class, contact.class.Person) || hierarchy.isDerived(_class, chunter.class.DirectMessage)
  }

  let iconSize: IconSize = 'small'
  $: iconSize = isAvatarIcon(preview?.objectClass) ? 'tiny' : 'small'
</script>

<span class="flex-presenter flex-gap-1 header">
  <Label label={chunter.string.Thread} />
  <span class="lower">
    <Label label={chunter.string.In} />
  </span>
  <span class="flex-presenter flex-gap-0-5" use:tooltip={{ label: getEmbeddedLabel(channelTitle) }}>
    {#if preview != null}
      <PreviewIcon value={preview} size={iconSize} fallback={notification.icon.Notifications} />
    {:else}
      <Icon icon={notification.icon.Notifications} size={iconSize} />
    {/if}
    <span class="overflow-label ml-0-5">
      {channelTitle}
    </span>
  </span>
</span>
<span class="font-normal mt-1">
  {#if message}
    {#if isThread}
      <ThreadMessagePreview value={toThread(message)} readonly type="content-only" />
    {:else}
      <ChatMessagePreview value={message} readonly type="content-only" />
    {/if}
  {/if}
</span>

<style lang="scss">
  .header {
    font-size: 0.875rem;
    font-weight: 600;
  }
</style>
