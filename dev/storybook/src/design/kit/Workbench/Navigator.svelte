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
  // Navigator panel: title, primary create button and a flat list of entries (items, dividers, groups, spaces)
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { ButtonWithDropdown, IconAdd, IconDown, IconDropdown, Scroller } from '@hcengineering/ui'
  import Button from '../Actions/Button.svelte'
  import type { IconName, NavEntry } from '../types'
  import NavGroup from './NavGroup.svelte'
  import NavItem from './NavItem.svelte'
  import NavSpace from './NavSpace.svelte'

  export let title: string
  export let newLabel: string | undefined = undefined
  // Icon buttons at the right of the title
  export let tools: IconName[] = []
  export let entries: NavEntry[] = []
  // Entries under the footer line
  export let footer: NavEntry[] = []

  // A caption owns the items that follow it, as a product NavGroup does
  type Part =
    | NavEntry
    | { caption: string, chevron?: boolean, menu?: boolean, compact?: boolean, noDivider?: boolean, items: NavEntry[] }
  function parts (list: NavEntry[]): Part[] {
    const out: Part[] = []
    let open: Extract<Part, { items: NavEntry[] }> | undefined
    for (const e of list) {
      if ('caption' in e) {
        open = {
          caption: e.caption,
          chevron: e.chevron,
          menu: e.menu,
          compact: e.compact,
          noDivider: e.noDivider,
          items: []
        }
        out.push(open)
      } else if (open !== undefined && 'item' in e) open.items.push(e)
      else {
        open = undefined
        out.push(e)
      }
    }
    return out
  }
</script>

<div class="hulyNavPanel-header" class:withButton={tools.length > 0}>
  <span class="overflow-label">{title}</span>
  {#if tools.length > 0}
    <div class="tools">
      {#each tools as icon, i}<Button kind={i === 0 ? 'ghost' : 'tertiary'} size="small" {icon} />{/each}
    </div>
  {/if}
</div>
{#if newLabel !== undefined}
  <div class="antiNav-subheader">
    <ButtonWithDropdown
      icon={IconAdd}
      justify="left"
      kind="primary"
      label={getEmbeddedLabel(newLabel)}
      dropdownItems={[]}
      dropdownIcon={IconDropdown}
    />
  </div>
{/if}
<Scroller shrink>
  <div class="entries">
    {#each parts(entries) as entry}
      {#if 'items' in entry}
        <div class="hulyNavGroup-container noIcon" class:noDivider={entry.noDivider}>
          <div
            class="hulyNavGroup-header isOpen"
            class:highlighted={entry.items.some((it) => 'selected' in it && it.selected === true)}
          >
            {#if entry.chevron === true}<div class="hulyNavGroup-header__chevron"><IconDown size="small" /></div>{/if}
            <div class="hulyNavGroup-header__label font-medium-12">
              <span class="overflow-label">{entry.caption}</span>
              {#if entry.menu === true}<IconDown size="small" />{/if}
            </div>
            <div class="flex-grow" />
          </div>
          <div class="hulyNavGroup-content" class:noPadding={entry.compact}>
            {#each entry.items as it}
              {#if 'item' in it}<NavItem
                  label={it.item}
                  icon={it.icon}
                  selected={it.selected}
                  count={it.count}
                  object={it.object}
                />{/if}
            {/each}
            {#if entry.compact === true && entry.items.length > 0}<span class="freeSpace" />{/if}
          </div>
        </div>
      {:else if 'divider' in entry}
        <div class="antiNav-divider line" style:margin-bottom={entry.tight === true ? '0.5rem' : undefined} />
      {:else if 'group' in entry}
        <div class="inset"><NavGroup label={entry.group} add={entry.add} /></div>
      {:else if 'space' in entry}
        <div class="inset"><NavSpace label={entry.space} icon={entry.icon} color={entry.color} /></div>
      {:else if 'item' in entry}
        <NavItem
          label={entry.item}
          icon={entry.icon}
          selected={entry.selected}
          indent={entry.indent}
          count={entry.count}
        />
      {/if}
    {/each}
  </div>
</Scroller>
<div class="antiNav-footer-line" />
<div class="antiNav-footer-grower" />
<div class="antiNav-footer">
  {#each footer as it}
    {#if 'item' in it}<NavItem label={it.item} icon={it.icon} />{/if}
  {/each}
</div>

<style lang="scss">
  .entries {
    display: flex;
    flex-direction: column;
  }
  .freeSpace {
    display: block;
    height: 0.25rem;
  }
  .tools {
    display: flex;
    gap: 0.25rem;
    margin-left: auto;
  }
  .inset {
    padding: 0 0.8125rem;
  }
</style>
