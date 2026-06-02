<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import tags, { TagReference, TagElement } from '@hcengineering/tags'
  import TagReferencePresenter from './TagReferencePresenter.svelte'
  import TagItem from './TagItem.svelte'
  import { createQuery } from '@hcengineering/presentation'
  import { IdMap, toIdMap } from '@hcengineering/core'

  export let value: TagReference[] | TagReference
  export let kind: 'tag' | 'list' | 'link' = 'tag'

  $: values = Array.isArray(value) ? value : [value]

  const query = createQuery()

  let elements: IdMap<TagElement> = new Map()

  $: query.query(tags.class.TagElement, { _id: { $in: values.map((it) => it.tag) } }, (result) => {
    elements = toIdMap(result)
  })
</script>

{#if kind === 'list' || kind === 'link'}
  <div class="flex-center flex-wrap">
    {#each values as v}
      <div class="m-0-5">
        <TagReferencePresenter attr={undefined} value={v} {kind} element={elements.get(v.tag)} />
      </div>
    {/each}
  </div>
{:else}
  {#each values as v}
    <TagItem tag={v} />
  {/each}
{/if}
