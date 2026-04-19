<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import { Doc, getCurrentAccount } from '@hcengineering/core'
  import { Scroller, Label } from '@hcengineering/ui'
  import { SpecialNavModel } from '@hcengineering/workbench'
  import { NavLink } from '@hcengineering/view-resources'
  import { TreeSeparator } from '@hcengineering/workbench-resources'
  import { Chat } from '@hcengineering/chunter'
  import { createQuery } from '@hcengineering/presentation'

  import chunter from '../../../plugin'
  import ChatNavGroup from './ChatNavGroup.svelte'
  import { chatNavGroupModels, chatSpecials } from '../utils'
  import ChatSpecialElement from './ChatSpecialElement.svelte'

  export let object: Doc | undefined
  export let chat: Chat | undefined
  export let currentSpecial: SpecialNavModel | undefined

  const me = getCurrentAccount()
  const pinnedChatsQuery = createQuery()

  let pinned: Chat[] = []

  pinnedChatsQuery.query(
    chunter.class.Chat,
    {
      pinned: true,
      hidden: false,
      account: me.uuid
    },
    (res) => {
      pinned = res
    }
  )
</script>

<div class="hulyNavPanel-header header">
  <span class="overflow-label">
    <Label label={chunter.string.Chat} />
  </span>
</div>

{#each chatSpecials as special, row}
  {#if row > 0 && chatSpecials[row].position !== chatSpecials[row - 1].position}
    <TreeSeparator line />
  {/if}
  <NavLink space={special.id}>
    <ChatSpecialElement {special} {currentSpecial} on:select />
  </NavLink>
{/each}

<span class="divider" />

<Scroller shrink bottomPadding="3rem">
  {#each chatNavGroupModels as model (model.id)}
    <ChatNavGroup {object} {chat} {model} {pinned} on:select />
  {/each}
</Scroller>

<style lang="scss">
  .header {
    min-height: 0;
  }

  .divider {
    width: 100%;
    height: 1px;
    background: var(--theme-navpanel-divider);
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
  }
</style>
