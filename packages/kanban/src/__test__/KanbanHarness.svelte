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
  import type { Doc } from '@hcengineering/core'
  import Kanban from '../components/Kanban.svelte'

  // Svelte 4 cannot pass slots through the constructor, so the slots are filled here and
  // expose their arguments as data-* attributes for the test to read.
  let kanban: Kanban
  // The test passes the board props loosely; $$restProps types them as an index signature.
  $: props = $$restProps as any

  export function select (offset: 1 | -1 | 0, of?: Doc, dir?: 'vertical' | 'horizontal'): void {
    kanban.select(offset, of, dir)
  }
</script>

<Kanban bind:this={kanban} {...props} on:obj-focus>
  <svelte:fragment slot="card" let:object let:dragged>
    <span data-test="card-body" data-dragged={dragged ? 'true' : 'false'}>{object._id}</span>
  </svelte:fragment>
  <svelte:fragment slot="header" let:state let:count let:collapsed let:blocked let:toggle let:members let:merge>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <span
      data-test="column-header"
      data-count={count}
      data-collapsed={collapsed ? 'true' : 'false'}
      data-blocked={blocked ? 'true' : 'false'}
      data-members={members.join(',')}
      on:click={toggle}>{typeof state === 'object' ? state.name : state}</span
    >
    <button data-test="merge" data-state={state} on:click={() => merge(prompt() ?? '')} />
  </svelte:fragment>
  <svelte:fragment slot="swimLaneHeader" let:swimLane let:count let:laneDoc let:docsLoaded let:collapsed>
    <span
      data-test="lane-header"
      data-lane={swimLane._id}
      data-count={count}
      data-lane-doc={laneDoc?._id ?? ''}
      data-docs-loaded={docsLoaded ? 'true' : 'false'}
      data-collapsed={collapsed ? 'true' : 'false'}>{swimLane.title}</span
    >
  </svelte:fragment>
</Kanban>
