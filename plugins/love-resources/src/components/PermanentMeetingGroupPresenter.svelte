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
<!--
  The `group` column, the category headers of the grouped list and a mention of a group: the same
  component is both an AttributePresenter (a ref) and an ObjectPresenter (a document).
-->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import love, { type MeetingGroup } from '@hcengineering/love'
  import { createQuery } from '@hcengineering/presentation'

  // A ref from the attribute presenter, a document from the object presenter - both end up here.
  export let value: Ref<MeetingGroup> | MeetingGroup | undefined = undefined

  let name: string | undefined = undefined

  const query = createQuery()
  $: if (value === undefined) {
    name = undefined
    query.unsubscribe()
  } else if (typeof value === 'object') {
    // Already a document: no reason to look it up again.
    name = value.name
    query.unsubscribe()
  } else {
    void query.query(love.class.MeetingGroup, { _id: value }, (res) => {
      name = res[0]?.name
    })
  }
</script>

{#if name !== undefined}
  <span class="overflow-label">{name}</span>
{/if}
