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
  import core, { Doc, generateId, notEmpty, TxCreateDoc, TxProcessor } from '@hcengineering/core'
  import { DocNavLink, ObjectPresenter } from '@hcengineering/view-resources'
  import { Icon, IconEdit, Label } from '@hcengineering/ui'
  import view from '@hcengineering/view'

  import communication from '../../../../plugin'
  import { getCollectionAttribute } from '../../../../activity'
  import { Aggregated } from '../../../../types'

  export let doc: Doc
  export let message: Aggregated<ActivityMessage>

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const query = createQuery()

  let objects: Doc[] = []

  $: objectClass = (message.extra.update as ActivityCollectionUpdate).objectClass
  $: collection = (message.extra.update as ActivityCollectionUpdate).collection

  $: clazz = hierarchy.getClass(objectClass)
  $: objectPanel = hierarchy.classHierarchyMixin(doc._class, view.mixin.ObjectPanel)
  $: attribute = getCollectionAttribute(hierarchy, doc._class, collection)

  $: messages = (message.previous ?? []).concat(message) as ActivityMessage[]
  $: createMessages = messages.filter((it) => it.extra.action === 'create')
  $: removeMessages = messages.filter((it) => it.extra.action === 'remove')
  $: resultMessages = createMessages.length > 0 ? createMessages : removeMessages
  $: objectIds = messages.map((it) => (it.extra?.update as ActivityCollectionUpdate).objectId).filter(notEmpty)

  $: query.query(objectClass, { _id: { $in: objectIds } }, (res) => {
    objects = res
  })

  function buildObject (message: ActivityMessage): Doc {
    const update = getCollectionUpdate(message)
    const createTx: TxCreateDoc<Doc> = {
      _id: generateId(),
      _class: core.class.TxCreateDoc,
      space: core.space.Workspace,
      objectId: update.objectId,
      objectClass: update.objectClass,
      objectSpace: doc.space,
      attributes: update.attributes ?? {},
      modifiedBy: message.creator,
      modifiedOn: message.created.getTime()
    }

    return TxProcessor.createDoc2Doc(createTx)
  }

  $: label = attribute?.label ?? clazz.pluralLabel ?? clazz.label
  $: icon = attribute?.icon ?? clazz.icon ?? IconEdit

  function getCollectionUpdate (message: ActivityMessage): ActivityCollectionUpdate {
    return message.extra.update as ActivityCollectionUpdate
  }

  function getTitle (object: Doc, key: string, update: ActivityCollectionUpdate): string {
    return (object as any)[key] ?? update.title ?? ''
  }
</script>

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
    {#if object}
      {#if clazz.titleKey}
        <DocNavLink
          {object}
          disabled={false}
          accent={true}
          component={objectPanel?.component ?? view.component.EditDoc}
          shrink={1}
        >
          {getTitle(object, clazz.titleKey, update)}
        </DocNavLink>
      {:else}
        <ObjectPresenter
          value={object}
          accent
          props={{ withShowMore: false }}
          shouldShowAvatar={update.objectClass === core.class.Collaborator}
        />
      {/if}
    {:else if update.title}
      <DocNavLink
        object={undefined}
        disabled={true}
        accent={true}
        component={objectPanel?.component ?? view.component.EditDoc}
        shrink={1}
      >
        {update.title}
      </DocNavLink>
    {:else if update.attributes}
      {@const obj = buildObject(m)}
      <ObjectPresenter value={obj} accent props={{ withShowMore: false }} />
    {/if}
    {#if index < resultMessages.length - 1}
      <span class="ml-1" />
    {/if}
  {/each}
</span>

<style lang="scss">
  .content {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }
  .icon {
    display: flex;
    align-items: center;
    color: var(--global-secondary-TextColor);
    fill: var(--global-secondary-TextColor);
  }
</style>
