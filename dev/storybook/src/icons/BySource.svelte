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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { SearchInput } from '@hcengineering/ui/kit'

  import Board from '../ui-kit/Board.svelte'
  import IconTile from './IconTile.svelte'
  import PageHeader from './PageHeader.svelte'
  import { icons as all, type PlatformIcon } from './icons'

  // The kit sprite has its own page, Overview / Icons.
  const icons = all.filter((icon) => icon.source !== 'ui kit')

  let query = ''

  $: words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((it) => it !== '')
  $: shown = icons.filter((icon) => words.every((w) => `${icon.name} ${icon.file}`.toLowerCase().includes(w)))
  $: sources = bySource(shown)

  function bySource (list: PlatformIcon[]): Array<[string, PlatformIcon[]]> {
    const map = new Map<string, PlatformIcon[]>()
    for (const icon of list) map.set(icon.source, [...(map.get(icon.source) ?? []), icon])
    for (const group of map.values()) group.sort((a, b) => a.name.localeCompare(b.name))
    return [...map].sort(([a], [b]) => a.localeCompare(b))
  }
</script>

<Board>
  <PageHeader
    title="Icons"
    note="Every svg of the platform sources outside the ui kit: sprite symbols of *-assets, <svg> in .svelte, svg files, svg strings in .ts and data URIs in styles. Blocks are plugins (assets and resources together) and packages, icons by name. A tooltip shows the file and line. The kit is on Overview / Icons."
  >
    <svelte:fragment slot="stats">{shown.length} of {icons.length} icons · {sources.length} sources</svelte:fragment>
    <SearchInput
      value={query}
      delay={150}
      placeholder={getEmbeddedLabel('Name or path')}
      on:change={(e) => (query = e.detail)}
    />
  </PageHeader>

  <div class="sources">
    {#each sources as [source, list] (source)}
      <section class="source">
        <h3>{source} <span class="count">{list.length}</span></h3>
        <div class="tiles">
          {#each list as icon (icon.id)}
            <IconTile {icon} />
          {/each}
        </div>
      </section>
    {/each}
  </div>
</Board>

<style lang="scss">
  // Sources flow into columns: most hold a few icons, one per row wasted the screen.
  .sources {
    columns: 24rem;
    column-gap: 2rem;
  }

  .source {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0 1rem;
    border-top: 1px solid var(--theme-divider-color);
    break-inside: avoid;
  }

  h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }

  .count {
    font-weight: 400;
    color: var(--theme-dark-color);
  }

  .tiles {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.75rem 0.25rem;
  }
</style>
