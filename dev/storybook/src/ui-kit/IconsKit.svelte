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
  import type { Asset } from '@hcengineering/platform'
  import ui, { Icon } from '@hcengineering/ui'

  import Group from '../attachments/Group.svelte'
  import Board from './Board.svelte'
  import { iconGroups } from './iconGroups'

  const all: Record<string, Asset> = ui.icon
  const grouped = new Set(iconGroups.flatMap((group) => group.keys))
  // A new icon of the sprite shows up under Other until it gets a group.
  const other = Object.keys(all)
    .filter((key) => !grouped.has(key))
    .sort((a, b) => a.localeCompare(b))
  const groups = [...iconGroups, ...(other.length > 0 ? [{ title: 'Other', keys: other }] : [])].map(
    ({ title, keys }) => ({
      title,
      icons: keys.filter((key) => all[key] != null).map((name) => ({ name, icon: all[name] }))
    })
  )

  // Long names wrap between their words, not inside them.
  function words (name: string): string[] {
    return name.split(/(?=[A-Z])/)
  }
</script>

<Board>
  {#each groups as { title, icons } (title)}
    <Group title="{title} · {icons.length}">
      <div class="grid">
        {#each icons as { name, icon } (name)}
          <figure>
            <span class="tile"><Icon {icon} size="large" /></span>
            <figcaption>
              {#each words(name) as word, i}{#if i > 0}<wbr />{/if}{word}{/each}
            </figcaption>
          </figure>
        {/each}
      </div>
    </Group>
  {/each}
</Board>

<style lang="scss">
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 5.5rem);
    gap: 0.75rem 0.25rem;
    width: 100%;
  }

  .tile {
    display: flex;
    padding: 0.75rem;
    border-radius: var(--small-BorderRadius);
    color: var(--theme-caption-color);
    background-color: color-mix(in srgb, var(--theme-caption-color) 4%, transparent);
  }

  figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    margin: 0;
  }

  figcaption {
    font-size: 0.6875rem;
    text-align: center;
    line-height: 0.875rem;
    overflow-wrap: anywhere;
    color: var(--theme-dark-color);
  }
</style>
