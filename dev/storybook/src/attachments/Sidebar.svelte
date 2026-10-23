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
  import PreviewWidget from '@hcengineering/attachment-resources/src/components/PreviewWidget.svelte'

  import Board from './Board.svelte'
  import { createFixtures, viewerSamples } from './fixtures'
  import Group from './Group.svelte'

  const f = createFixtures()
  const widget: any = {}

  function tabOf (value: any): any {
    const { file, name, type, metadata, size } = value
    return { id: file, name, data: { file, name, contentType: type, metadata, size } }
  }
</script>

<Board>
  <div class="row">
    {#each Object.entries(viewerSamples) as [key, title]}
      <Group {title} direction="column">
        <div class="frame"><PreviewWidget {widget} tab={tabOf(f[key])} /></div>
      </Group>
    {/each}
  </div>
</Board>

<style lang="scss">
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
  }

  .frame {
    display: flex;
    width: 25rem;
    height: 36rem;
    overflow: hidden;
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--large-BorderRadius);
    background-color: var(--theme-panel-color);
  }
</style>
