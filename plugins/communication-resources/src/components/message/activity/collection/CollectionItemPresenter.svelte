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
  import core, { Doc, generateId, TxCreateDoc, TxProcessor } from '@hcengineering/core'
  import { ActivityCollectionUpdate, ActivityMessage } from '@hcengineering/communication-types'
  import { DocNavLink, ObjectPresenter } from '@hcengineering/view-resources'
  import view from '@hcengineering/view'
  import { getClient } from '@hcengineering/presentation'

  export let message: ActivityMessage
  export let doc: Doc
  export let object: Doc | undefined
  export let update: ActivityCollectionUpdate

  const client = getClient()
  const hierarchy = client.getHierarchy()

  $: clazz = hierarchy.getClass(update.objectClass)
  $: objectPanel = hierarchy.classHierarchyMixin(update.objectClass, view.mixin.ObjectPanel)

  function getTitle (object: Doc, key: string, update: ActivityCollectionUpdate): string {
    return (object as any)[key] ?? update.title ?? ''
  }

  function buildObject (message: ActivityMessage): Doc {
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
</script>

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
      disabled={false}
      props={{ withShowMore: false, showPreview: true }}
      shouldShowAvatar={update.objectClass === core.class.Collaborator}
    />
  {/if}
{:else if update.title}
  <DocNavLink
    object={undefined}
    disabled={message.extra.action === 'remove'}
    accent={true}
    component={objectPanel?.component ?? view.component.EditDoc}
    shrink={1}
  >
    {update.title}
  </DocNavLink>
{:else if update.attributes}
  {@const obj = buildObject(message)}
  <ObjectPresenter value={obj} disabled={true} accent props={{ withShowMore: false }} />
{/if}
