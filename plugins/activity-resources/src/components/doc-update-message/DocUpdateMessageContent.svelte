<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import { Icon, Label } from '@hcengineering/ui'
  import { Asset, IntlString } from '@hcengineering/platform'
  import activity, { DisplayDocUpdateMessage, DocUpdateMessage, DocUpdateMessageViewlet } from '@hcengineering/activity'
  import { createQuery, getClient, IconWithEmoji } from '@hcengineering/presentation'
  import { Doc } from '@hcengineering/core'
  import attachment from '@hcengineering/attachment'
  import view from '@hcengineering/view'

  import DocUpdateMessageObjectValue from './DocUpdateMessageObjectValue.svelte'

  export let message: DisplayDocUpdateMessage
  export let viewlet: DocUpdateMessageViewlet | undefined
  export let objectName: IntlString | undefined
  export let collectionName: IntlString | undefined
  export let objectIcon: Asset | undefined
  export let preview = false

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const objectsQuery = createQuery()

  const isOwn = message.objectId === message.attachedTo

  let valueMessages: DocUpdateMessage[] = []
  let objects: Doc[] = []

  $: valueMessages = message.previousMessages?.length ? [...message.previousMessages, message] : [message]

  $: objectsQuery.query(message.objectClass, { _id: { $in: valueMessages.map((it) => it.objectId) } }, (res) => {
    objects = res
  })

  $: isColumn = hierarchy.isDerived(message.objectClass, attachment.class.Attachment) && !preview
  $: _icon = viewlet?.icon ?? objectIcon ?? activity.icon.Activity
  $: clazz = hierarchy.findClass(message.objectClass)
</script>

{#if isColumn}
  <span class="content column no-word-wrap flex-wrap">
    <span class="label flex-gap-1 no-word-wrap h-10">
      <span class="icon mr-1">
        <Icon
          icon={_icon === view.ids.IconWithEmoji ? IconWithEmoji : _icon}
          iconProps={_icon === view.ids.IconWithEmoji ? { color: clazz?.color ?? 0 } : {}}
          size="small"
        />
      </span>
      {#if message.action === 'create'}
        <Label label={activity.string.New} />
      {:else if message.action === 'remove' && message.updateCollection}
        <Label label={activity.string.Removed} />
      {/if}
      <span class="lower">
        {#if collectionName && (message.previousMessages?.length || !isOwn)}
          <Label label={collectionName} />:
        {:else if objectName}
          <Label label={objectName} />:
        {/if}
      </span>
    </span>
    <span class="content flex-gap-1 no-word-wrap flex-wrap">
      {#each valueMessages as valueMessage, index}
        <DocUpdateMessageObjectValue
          message={valueMessage}
          {viewlet}
          {preview}
          doc={objects.find((it) => it._id === valueMessage.objectId)}
        />
        {#if index < valueMessages.length - 1}
          <span class="ml-1" />
        {/if}
      {/each}
    </span>
  </span>
{:else}
  <div class="content overflow-label" class:preview>
    <span class="mr-1">
      <Icon
        icon={_icon === view.ids.IconWithEmoji ? IconWithEmoji : _icon}
        iconProps={_icon === view.ids.IconWithEmoji ? { icon: clazz?.color ?? 0 } : {}}
        size="small"
      />
    </span>
    {#if message.action === 'create'}
      <Label label={activity.string.New} />
    {:else if message.action === 'remove' && message.updateCollection}
      <Label label={activity.string.Removed} />
    {/if}
    <span class="lower">
      {#if collectionName && (message.previousMessages?.length || !isOwn)}
        <Label label={collectionName} />:
      {:else if objectName}
        <Label label={objectName} />:
      {/if}
    </span>

    <span class="overflow-label values" class:preview>
      {#each valueMessages as valueMessage, index}
        <DocUpdateMessageObjectValue
          message={valueMessage}
          {viewlet}
          {preview}
          doc={objects.find((it) => it._id === valueMessage.objectId)}
        />
        {#if index < valueMessages.length - 1}
          <span class="ml-1" />
        {/if}
      {/each}
    </span>
  </div>
{/if}

<style lang="scss">
  .content {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    flex-wrap: wrap;
    color: var(--global-primary-TextColor);

    &.column {
      align-items: start;
      flex-direction: column;
    }

    &.preview {
      flex-wrap: nowrap;
    }
  }

  .label {
    display: flex;
    align-items: center;
  }

  .values {
    display: flex;
    align-items: center;
    flex-wrap: wrap;

    &.preview {
      flex-wrap: nowrap;
    }
  }
</style>
