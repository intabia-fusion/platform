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
  import { NavItem } from '@hcengineering/ui/kit'
  import { onDestroy } from 'svelte'

  import TypingIndicatorExample from './TypingIndicatorExample.svelte'

  // Rows start and stop typing in turn, to show the way in and out.
  export let live: boolean = true
  export let width: string = '15rem'

  interface Row {
    name: string
    kind: 'channel' | 'private' | 'direct'
    typing: boolean
    // Live mode: the row types on ticks where (tick + phase) % 3 is not 0.
    phase: number
    count?: number
    selected?: boolean
    online?: boolean
    initials?: string
    color?: number
  }

  const rows: Row[] = [
    { name: 'general', kind: 'channel', typing: true, phase: 0 },
    { name: 'random', kind: 'channel', typing: true, phase: 1, count: 3 },
    { name: 'demos', kind: 'private', typing: true, phase: 2, selected: true },
    { name: 'test2', kind: 'private', typing: false, phase: 3 },
    { name: 'Зайцев Андрей', kind: 'direct', typing: true, phase: 1, online: true, initials: 'ЗА', color: 4 },
    { name: 'Лесовая Мария', kind: 'direct', typing: true, phase: 2, count: 1, initials: 'ЛМ', color: 9 },
    { name: 'Fefelova Kristina', kind: 'direct', typing: false, phase: 3, online: true, initials: 'FK', color: 12 }
  ]

  let tick = 0
  const timer = setInterval(() => {
    tick++
  }, 1800)
  onDestroy(() => {
    clearInterval(timer)
  })

  function isTyping (row: Row, live: boolean, tick: number): boolean {
    if (!live) return row.typing
    return row.phase !== 3 && (tick + row.phase) % 3 !== 0
  }
</script>

<div class="typing-navigator" style:width>
  {#each rows as row}
    <NavItem label={getEmbeddedLabel(row.name)} kind="object" count={row.count} selected={row.selected === true}>
      <svelte:fragment slot="icon">
        <TypingIndicatorExample
          kind={row.kind}
          typing={isTyping(row, live, tick)}
          online={row.online === true}
          initials={row.initials}
          color={row.color}
          framed={false}
        />
      </svelte:fragment>
    </NavItem>
  {/each}
</div>

<style lang="scss">
  .typing-navigator {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-1) var(--spacing-1_5);
    background-color: var(--theme-navpanel-color);
    border: 1px solid var(--theme-navpanel-border, transparent);
    border-radius: var(--small-BorderRadius);
  }
</style>
