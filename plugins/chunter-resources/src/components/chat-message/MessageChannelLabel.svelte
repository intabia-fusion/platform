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
<script lang="ts">
  import type { ActivityMessage } from '@hcengineering/activity'
  import chunter, { type ThreadMessage } from '@hcengineering/chunter'
  import type { Class, Doc, Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { Icon, languageStore } from '@hcengineering/ui'

  import { getChannelName, getObjectIcon } from '../../utils'

  export let message: ActivityMessage

  const hierarchy = getClient().getHierarchy()

  $: isReply = hierarchy.isDerived(message._class, chunter.class.ThreadMessage)
  $: chatId = (isReply ? (message as ThreadMessage).objectId : message.attachedTo) as Ref<Doc>
  $: chatClass = (isReply ? (message as ThreadMessage).objectClass : message.attachedToClass) as Ref<Class<Doc>>

  $: icon = getObjectIcon(chatClass)

  let name: string | undefined = undefined
  $: void getChannelName(chatId, chatClass, undefined, $languageStore).then((res) => {
    name = res
  })
</script>

{#if name !== undefined && name !== ''}
  <span class="reference flex-row-center flex-gap-1">
    {#if icon !== undefined}
      <div class="icon"><Icon {icon} size={'x-small'} /></div>
    {/if}
    <span class="label overflow-label font-medium-12 text-left secondary-textColor">{name}</span>
  </span>
{/if}

<style lang="scss">
  .reference {
    flex-shrink: 1;
    min-width: 0;
    max-width: 20rem;
    height: 1.25rem;
    padding: 0 var(--spacing-0_75) 0 var(--spacing-0_5);
    box-shadow: inset 0 0 0 1px var(--global-subtle-ui-BorderColor);
    border-radius: var(--extra-small-BorderRadius);
    background-color: var(--tag-nuance-SkyBackground);
  }

  .icon {
    flex-shrink: 0;
    color: var(--global-secondary-TextColor);
  }
</style>
