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
  // Catalog story: one application window around all state matrices of the story
  import Matrix from '../../helpers/Matrix.svelte'
  import type { MatrixSection } from '../../helpers/matrix'
  import PanZoom from '../PanZoom.svelte'
  import Frame from './Frame.svelte'
  import { fixedColumns } from './Tracker/fixedColumns'

  export let sections: MatrixSection[]
  export let title: string

  // Rows of one story share fixed column widths like the rows of one list
  fixedColumns()

  let panZoom: PanZoom
  let width = 0
  let height = 0
  $: bounds = width > 0 ? { x: 0, y: 0, w: width, h: height } : undefined
  // Fit once the window has its size, and again when the content changes it
  $: if (bounds !== undefined && panZoom !== undefined) void panZoom.fit()
</script>

<PanZoom bind:this={panZoom} {bounds}>
  <div class="window" bind:clientWidth={width} bind:clientHeight={height}>
    <Frame {title}>
      <div class="sections">
        {#each sections as section}
          <section>
            <h3>{section.title}</h3>
            <Matrix component={section.component} rows={section.rows} columns={section.columns} props={section.props} />
          </section>
        {/each}
      </div>
    </Frame>
  </div>
</PanZoom>

<style>
  .window {
    position: absolute;
    width: max-content;
  }
  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }
  h3 {
    margin: 0 0 var(--spacing-1) var(--spacing-2);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
</style>
