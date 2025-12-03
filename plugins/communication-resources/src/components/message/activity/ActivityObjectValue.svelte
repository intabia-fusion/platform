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
  import { getClient } from '@hcengineering/presentation'
  import cardPlugin from '@hcengineering/card'
  import { type ActivityMessage } from '@hcengineering/communication-types'
  import view from '@hcengineering/view'
  import { DocNavLink, getDocTitle, ObjectIcon } from '@hcengineering/view-resources'
  import { Icon, Label } from '@hcengineering/ui'
  import type { Class, Doc } from '@hcengineering/core'

  import communication from './../../../plugin'

  export let message: ActivityMessage
  export let doc: Doc

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let title: string = ''

  $: clazz = hierarchy.getClass(doc._class)
  $: objectPanel = hierarchy.classHierarchyMixin(doc._class, view.mixin.ObjectPanel)
  $: action = message.extra.action

  $:void updateTitle(doc, clazz)

  async function updateTitle (doc: Doc, clazz: Class<Doc>): Promise<void> {
    if (clazz.titleKey != null) {
      title = (doc as any)[clazz.titleKey]
      return
    }

    title = await getDocTitle(client, doc._id, doc._class, doc) ?? ''
  }
</script>

<span class="container flex-gap-1 overflow-label">
  <span class="icon mr-1">
    {#if hierarchy.isDerived(doc._class, communication.type.Direct)}
      <Icon icon={clazz.icon ?? cardPlugin.icon.Card} size="small" />
    {:else}
      <ObjectIcon value={doc} size={'small'} ignoreIconMixin={true}/>
    {/if}
  </span>

  {#if action === 'create'}
    <Label label={communication.string.New} />
  {:else if action === 'remove'}
    <Label label={communication.string.Removed} />
  {/if}
  <span class="lower">
    <Label label={clazz.label} />:
  </span>
  <DocNavLink
    object={doc}
    disabled={action === 'remove'}
    accent={true}
    component={objectPanel?.component ?? view.component.EditDoc}
    shrink={1}
  >
    {#if title !== ''}
      {title}
      {/if}
  </DocNavLink>
</span>

<style lang="scss">
  .icon {
    display: flex;
    align-items: center;
    color: var(--global-secondary-TextColor);
    fill: var(--global-secondary-TextColor);
  }

  .container {
    display: flex;
    align-items: center;
  }
</style>
