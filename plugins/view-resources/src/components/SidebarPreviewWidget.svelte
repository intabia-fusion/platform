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
  import { Class, Doc, Ref } from '@hcengineering/core'
  import workbench, { Widget, WidgetTab } from '@hcengineering/workbench'
  import { getClient } from '@hcengineering/presentation'
  import { getResource } from '@hcengineering/platform'
  import { AnyComponent, Component } from '@hcengineering/ui'

  import { getSidebarObjectComponent } from '../utils'

  export let widget: Widget | undefined
  export let tab: WidgetTab | undefined

  const hierarchy = getClient().getHierarchy()

  let comp: AnyComponent | undefined
  let objectId: Ref<Doc> | undefined
  let objectClass: Ref<Class<Doc>> | undefined

  $: objectId = tab?.objectId
  $: objectClass = tab?.objectClass
  $: comp = objectClass !== undefined ? getSidebarObjectComponent(hierarchy, objectClass) : undefined

  // closeWidget resolved via getResource - no direct workbench-resources import (package cycle)
  async function handleClose (): Promise<void> {
    if (widget !== undefined) {
      const closeWidget = await getResource(workbench.function.CloseWidget)
      await closeWidget(widget._id)
    }
  }
</script>

{#if comp && objectId && objectClass}
  <div class="sidebar-doc-preview">
    <Component
      is={comp}
      props={{ _id: objectId, _class: objectClass, embedded: true, allowClose: true, isSidebar: true }}
      on:close={handleClose}
    />
  </div>
{/if}

<style lang="scss">
  .sidebar-doc-preview {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    // Compact the panel content for the narrow sidebar: drop the wide centered margins/padding
    :global(.popupPanel-body__main-content) {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0.75rem 1rem;
    }
  }
</style>
