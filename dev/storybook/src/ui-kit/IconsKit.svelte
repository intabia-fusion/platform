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

  import Group from '../attachments/Group.svelte'
  import Specimen from '../attachments/Specimen.svelte'
  import Board from './Board.svelte'

  // Every file of the folder: a new icon shows up here without touching the story.
  const modules = import.meta.glob<{ default: ComponentType }>('../../../../packages/ui/src/ui-kit/_icons/*.svelte', {
    eager: true
  })
  const icons = Object.entries(modules)
    .map(([path, module]) => ({ name: path.split('/').pop()?.replace('.svelte', '') ?? path, icon: module.default }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const sizes = ['small', 'medium', 'large'] as const
</script>

<Board>
  <Group title="Icons" note="ui-kit/_icons: drawn in currentColor, in the sizes of the platform's icons.">
    {#each icons as { name, icon }}
      <Specimen label={name}>
        <span class="sizes">
          {#each sizes as size}
            <svelte:component this={icon} {size} />
          {/each}
        </span>
      </Specimen>
    {/each}
  </Group>
</Board>

<style lang="scss">
  .sizes {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: var(--small-BorderRadius);
    color: var(--theme-caption-color);
    background-color: color-mix(in srgb, var(--theme-caption-color) 4%, transparent);
  }
</style>
