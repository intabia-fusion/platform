<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import type { Class, Doc, DocumentQuery, FindOptions, Ref, WithLookup } from '@hcengineering/core'
  import type { Resource } from '@hcengineering/drive'
  import { ActionContext, createQuery, getClient } from '@hcengineering/presentation'
  import type { BuildModelKey, ViewOptions } from '@hcengineering/view'
  import type { SelectDirection } from '@hcengineering/view-resources'
  import { ListSelectionProvider, buildConfigLookup, focusStore } from '@hcengineering/view-resources'

  import { isFolder } from '../utils'
  import GridItem from './GridItem.svelte'

  export let _class: Ref<Class<Resource>>
  export let query: DocumentQuery<Resource>
  export let config: Array<BuildModelKey | string>
  export let options: FindOptions<Resource> | undefined = undefined
  export let viewOptions: ViewOptions

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const q = createQuery()

  let ordered: Array<WithLookup<Resource>> = []

  // The pointer moves the selection too, for the keys to start from; shown, it would stay lit after the pointer left.
  let byKeys = false

  const listProvider = new ListSelectionProvider((offset: 1 | -1 | 0, of?: Doc, dir?: SelectDirection) => {
    if (dir === 'vertical') {
      // The provider re-selects with no offset on every update: only a move is a key.
      if (offset !== 0) byKeys = true
      let pos = ordered.findIndex((p) => p._id === of?._id)
      pos += offset
      if (pos < 0) {
        pos = 0
      }
      if (pos >= ordered.length) {
        pos = ordered.length - 1
      }
      listProvider.updateFocus(ordered[pos])
    }
  })

  let objects: WithLookup<Resource>[] = []

  $: orderBy = viewOptions.orderBy
  $: lookup = buildConfigLookup(hierarchy, _class, config, options?.lookup)

  $: q.query(
    _class,
    query,
    (result) => {
      objects = result
    },
    {
      ...options,
      sort: {
        ...(options != null ? options.sort : {}),
        ...(orderBy != null ? { [orderBy[0]]: orderBy[1] } : {})
      },
      lookup
    }
  )

  $: folders = objects.filter(isFolder)
  $: files = objects.filter((it) => !isFolder(it))
  $: ordered = [...folders, ...files]

  $: listProvider.update(ordered)
  $: selection = listProvider.current($focusStore)
</script>

<ActionContext context={{ mode: 'browser' }} />

{#if folders.length > 0}
  <div class="grid-container folders">
    {#each folders as object, i (object._id)}
      <GridItem
        {object}
        selected={byKeys && selection === i}
        on:obj-focus={(evt) => {
          byKeys = false
          listProvider.updateFocus(evt.detail)
        }}
      />
    {/each}
  </div>
{/if}
{#if files.length > 0}
  <div class="grid-container">
    {#each files as object, i (object._id)}
      <GridItem
        {object}
        selected={byKeys && selection === folders.length + i}
        on:obj-focus={(evt) => {
          byKeys = false
          listProvider.updateFocus(evt.detail)
        }}
      />
    {/each}
  </div>
{/if}

<style lang="scss">
  .grid-container {
    display: grid;
    margin: 0.5rem 1rem;
    padding-bottom: 0.5rem;
    grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
    gap: 0.875rem;

    &.folders {
      gap: 0.5rem 0.875rem;
      margin-bottom: 0.75rem;
    }
  }
</style>
