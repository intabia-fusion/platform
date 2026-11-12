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
  import type { Ref } from '@hcengineering/core'
  import type { Folder } from '@hcengineering/drive'
  import { createQuery } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import type { ObjectPresenterType } from '@hcengineering/view'

  import drive from '../plugin'
  import FolderPresenter from './FolderPresenter.svelte'

  // Attribute presenter for RefTo<Folder> values: `parent` is a single ref, `path` is an ordered list of refs
  export let value: Ref<Folder> | Array<Ref<Folder>> | undefined
  export let type: ObjectPresenterType = 'link'

  let found: Folder[] = []
  const query = createQuery()

  $: refs = value === undefined ? [] : Array.isArray(value) ? value : [value]
  $: if (refs.length > 0) {
    void query.query(
      drive.class.Folder,
      { _id: { $in: refs } },
      (res) => {
        found = res
      },
      { limit: refs.length }
    )
  } else {
    found = []
  }
  // The drive root has no document of its own, so it is rendered by its label
  $: items = refs
    .map((ref) => ({ ref, doc: found.find((it) => it._id === ref) }))
    .filter((it) => it.doc !== undefined || it.ref === drive.ids.Root)
</script>

{#each items as item, index (item.ref)}
  {#if index > 0}<span class="separator">/</span>{/if}
  {#if item.doc !== undefined}
    <FolderPresenter value={item.doc} {type} />
  {:else}
    <Label label={drive.string.Root} />
  {/if}
{/each}

<style lang="scss">
  .separator {
    margin: 0 0.25rem;
    opacity: 0.6;
  }
</style>
