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
  import { DisplayDocUpdateMessage, DocUpdateMessage, DocUpdateMessageViewlet } from '@hcengineering/activity'
  import core, { Class, Doc, generateId, Ref, TxCreateDoc, TxProcessor } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { AnyComponent, Component } from '@hcengineering/ui'
  import view, { ObjectPanel } from '@hcengineering/view'
  import {
    buildRemovedDoc,
    checkIsObjectRemoved,
    DocNavLink,
    getDocTitle,
    isAttachedDoc
  } from '@hcengineering/view-resources'
  import contact from '@hcengineering/contact'

  export let message: DisplayDocUpdateMessage
  export let viewlet: DocUpdateMessageViewlet | undefined
  export let doc: Doc | undefined
  export let preview = false

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let object: Doc | undefined = undefined
  let isRemoved = false

  $: objectPanel = hierarchy.classHierarchyMixin(message.objectClass, view.mixin.ObjectPanel)
  $: objectPresenter = hierarchy.classHierarchyMixin(message.objectClass, view.mixin.ObjectPresenter)
  $: clazz = hierarchy.findClass(message.objectClass)

  async function getValue (object: Doc, clazz?: Class<Doc>): Promise<string | undefined> {
    if (clazz?.titleKey != null && clazz.titleKey !== '') {
      return (object as any)[clazz.titleKey] ?? ''
    }

    return (await getDocTitle(client, object._id, object._class, object)) ?? ''
  }

  function buildObject (message: DocUpdateMessage): Doc | undefined {
    if (message.objectAttributes == null) return undefined

    const createTx: TxCreateDoc<Doc> = {
      _id: generateId(),
      _class: core.class.TxCreateDoc,
      space: core.space.Workspace,
      objectId: message.objectId,
      objectClass: message.objectClass,
      objectSpace: message.space,
      attributes: message.objectAttributes ?? {},
      modifiedBy: message.createdBy ?? message.modifiedBy,
      modifiedOn: message.createdOn ?? message.modifiedOn
    }

    return TxProcessor.createDoc2Doc(createTx)
  }

  async function loadObject (_id: Ref<Doc>, _class: Ref<Class<Doc>>, attachedTo: Ref<Doc>, doc?: Doc): Promise<void> {
    if (doc != null) {
      object = doc
      return
    }

    isRemoved = true
    object = buildObject(message) ?? (await buildRemovedDoc(client, _id, _class))
  }

  $: void loadObject(message.objectId, message.objectClass, message.attachedTo, doc)

  function getPanelComponent (object: Doc, objectPanel?: ObjectPanel): AnyComponent {
    if (objectPanel !== undefined) {
      return objectPanel.component
    }

    if (isAttachedDoc(object)) {
      return view.component.AttachedDocPanel
    }

    return view.component.EditDoc
  }
</script>

{#if isRemoved && message.objectTitle}
  <span class="valueLink">
    <DocNavLink
      object={undefined}
      disabled={true}
      colorInherit
      component={objectPanel?.component ?? view.component.EditDoc}
      shrink={1}
    >
      {message.objectTitle}
    </DocNavLink>
  </span>
{:else if object}
  {#await getValue(object, clazz) then value}
    {#if value !== ''}
      <span class="valueLink">
        <DocNavLink
          {object}
          colorInherit
          disabled={message.action === 'remove'}
          component={getPanelComponent(object, objectPanel)}
          shrink={0}
        >
          <span class="overflow-label select-text">{value}</span>
        </DocNavLink>
      </span>
    {:else if objectPresenter}
      <Component
        is={objectPresenter.presenter}
        disabled={message.action === 'remove'}
        props={{
          value: object,
          accent: true,
          shouldShowAvatar:
            hierarchy.isDerived(message.objectClass, core.class.Collaborator) ||
            hierarchy.isDerived(message.objectClass, contact.class.Person),
          preview,
          showPreview: message.action === 'create'
        }}
      />
    {/if}
  {/await}
{/if}

<style lang="scss">
  .valueLink {
    font-weight: 500;
    color: var(--global-primary-LinkColor);
  }
</style>
