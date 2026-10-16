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
  import type { ComponentType } from 'svelte'
  import type { MatrixAxis } from './matrix'

  export let component: ComponentType
  export let rows: MatrixAxis
  export let columns: MatrixAxis
  export let props: Record<string, unknown> = {}
</script>

<table class="matrix">
  <thead>
    <tr>
      <th />
      {#each columns as column}
        <th>{column.title}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row}
      <tr>
        <th>{row.title}</th>
        {#each columns as column}
          <td><svelte:component this={component} {...props} {...row.props} {...column.props} /></td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style lang="scss">
  .matrix {
    border-collapse: separate;
    border-spacing: var(--spacing-2) var(--spacing-1_5);

    th {
      font-weight: 500;
      color: var(--theme-dark-color);
      text-align: left;
      white-space: nowrap;
    }
    td {
      vertical-align: middle;
    }
  }
</style>
