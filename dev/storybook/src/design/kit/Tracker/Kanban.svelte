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
  // Board of columns, the content of a kanban view
  import { Scroller } from '@hcengineering/ui'
  import KanbanColumn from './KanbanColumn.svelte'
  import type { Column } from '../types'

  export let columns: Column[] = []
</script>

<div class="kit-kanban">
  <Scroller horizontal contentDirection="horizontal" align="stretch" noStretch={false}>
    <div class="content">
      {#each columns as column (column.name)}
        <KanbanColumn {column} />
      {/each}
    </div>
  </Scroller>
</div>

<style>
  .kit-kanban {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .content {
    display: flex;
    padding: 1.5rem 1.5rem 0.5rem;
    min-width: 0;
    height: 100%;
    box-sizing: border-box;
  }
</style>
