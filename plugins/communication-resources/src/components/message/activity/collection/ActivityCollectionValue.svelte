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
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { ActivityCollectionUpdate, ActivityMessage } from '@hcengineering/communication-types'
  import { Doc, notEmpty } from '@hcengineering/core'
  import { Icon, IconEdit, Label } from '@hcengineering/ui'
  import attachment from '@hcengineering/attachment'

  import communication from '../../../../plugin'
  import { getCollectionAttribute } from '../../../../activity'
  import { Aggregated } from '../../../../types'
  import CollectionItemPresenter from './CollectionItemPresenter.svelte'

  export let doc: Doc
  export let message: Aggregated<ActivityMessage>
  export let compact = false

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const query = createQuery()

  let objects: Doc[] = []

  $: objectClass = (message.extra.update as ActivityCollectionUpdate).objectClass
  $: collection = (message.extra.update as ActivityCollectionUpdate).collection

  $: clazz = hierarchy.getClass(objectClass)
  $: attribute = getCollectionAttribute(hierarchy, doc._class, collection)

  $: messages = (message.previous ?? []).concat(message) as ActivityMessage[]
  $: createMessages = messages.filter((it) => it.extra.action === 'create')
  $: removeMessages = messages.filter((it) => it.extra.action === 'remove')
  $: resultMessages = createMessages.length > 0 ? createMessages : removeMessages
  $: objectIds = messages.map((it) => (it.extra?.update as ActivityCollectionUpdate).objectId).filter(notEmpty)

  $: query.query(objectClass, { _id: { $in: objectIds } }, (res) => {
    objects = res
  })

  $: label = attribute?.label ?? clazz.pluralLabel ?? clazz.label
  $: icon = attribute?.icon ?? clazz.icon ?? IconEdit

  function getCollectionUpdate (message: ActivityMessage): ActivityCollectionUpdate {
    return message.extra.update as ActivityCollectionUpdate
  }

  $: isColumn = hierarchy.isDerived(objectClass, attachment.class.Attachment)
</script>

{#if isColumn}
  <span class="content column no-word-wrap flex-wrap">
    <span class="label flex-gap-1 no-word-wrap" class:h-10={!compact} class:h-6={compact} class:mb-2={compact}>
      <span class="icon mr-1">
        <Icon {icon} size="small" />
      </span>
      {#if createMessages.length > 0}
        <Label label={communication.string.New} />
      {:else if removeMessages.length > 0}
        <Label label={communication.string.Removed} />
      {/if}
      <span class="lower"><Label {label} /></span>:
    </span>
    <span class="content flex-gap-1 no-word-wrap flex-wrap">
      {#each resultMessages as m, index}
        {@const update = getCollectionUpdate(m)}
        {@const object = objects.find((it) => it._id === update.objectId)}
        <CollectionItemPresenter {doc} {object} {update} message={m} />
        {#if index < resultMessages.length - 1}
          <span class="ml-1" />
        {/if}
      {/each}
    </span>
  </span>
{:else}
  <span class="content flex-gap-1 no-word-wrap flex-wrap">
    <span class="icon mr-1">
      <Icon {icon} size="small" />
    </span>
    {#if createMessages.length > 0}
      <Label label={communication.string.New} />
    {:else if removeMessages.length > 0}
      <Label label={communication.string.Removed} />
    {/if}
    <span class="lower"><Label {label} /></span>:
    {#each resultMessages as m, index}
      {@const update = getCollectionUpdate(m)}
      {@const object = objects.find((it) => it._id === update.objectId)}
      <CollectionItemPresenter {doc} {object} {update} message={m} />
      {#if index < resultMessages.length - 1}
        <span class="ml-1" />
      {/if}
    {/each}
  </span>
{/if}

<style lang="scss">
  .content {
    display: flex;
    align-items: center;
    flex-wrap: wrap;

    &.column {
      align-items: start;
      flex-direction: column;
    }
  }

  .label {
    display: flex;
    align-items: center;
  }
  .icon {
    display: flex;
    align-items: center;
    color: var(--global-secondary-TextColor);
    fill: var(--global-secondary-TextColor);
  }
</style>
