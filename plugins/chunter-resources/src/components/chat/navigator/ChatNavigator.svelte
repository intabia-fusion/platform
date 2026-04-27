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
  import { AccountRole, Doc, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { Scroller, Label, ButtonIcon, IconEdit, showPopup, Menu, SearchInput } from '@hcengineering/ui'
  import { SpecialNavModel } from '@hcengineering/workbench'
  import { NavLink } from '@hcengineering/view-resources'
  import { TreeSeparator } from '@hcengineering/workbench-resources'
  import { Chat } from '@hcengineering/chunter'
  import { createQuery } from '@hcengineering/presentation'
  import contact, { Employee } from '@hcengineering/contact'

  import chunter from '../../../plugin'
  import ChatNavGroup from './ChatNavGroup.svelte'
  import { chatNavGroupModels, chatSpecials } from '../utils'
  import ChatSpecialElement from './ChatSpecialElement.svelte'

  export let object: Doc | undefined
  export let chat: Chat | undefined
  export let currentSpecial: SpecialNavModel | undefined

  const me = getCurrentAccount()
  const pinnedChatsQuery = createQuery()
  const employeesQuery = createQuery()

  let search: string = ''
  let searchExpanded: boolean = false

  let employees: Employee[] = []
  let pinned: Chat[] = []

  $: pinnedChatsQuery.query(
    chunter.class.Chat,
    {
      pinned: true,
      account: me.uuid,
      ...(search !== ''
        ? {
            $search: `*${search}*`,
            $searchStrict: true
          }
        : {
            hidden: false
          })
    },
    (res) => {
      pinned = res
    }
  )

  $: if (search !== '') {
    employeesQuery.query(
      contact.mixin.Employee,
      {
        $search: `*${search}*`,
        $searchStrict: true
      },
      (res) => {
        employees = res
      },
      {
        limit: 20
      }
    )
  } else {
    employeesQuery.unsubscribe()
    employees = []
  }

  const globalActions = [
    {
      label: chunter.string.NewChannel,
      icon: chunter.icon.Hashtag,
      action: async (): Promise<void> => {
        showPopup(chunter.component.CreateChannel, {}, 'top')
      }
    },
    {
      label: chunter.string.NewDirectChat,
      icon: chunter.icon.Thread,
      action: async (): Promise<void> => {
        showPopup(chunter.component.CreateDirectChat, {}, 'top')
      }
    }
  ]

  let pressed: boolean = false

  function handlePenClick (ev: Event): void {
    pressed = true
    showPopup(Menu, { actions: globalActions }, ev.target as HTMLElement, () => {
      pressed = false
    })
  }
</script>

<div class="hulyNavPanel-header header">
  {#if !searchExpanded && search === ''}
    <span class="overflow-label label">
      <Label label={chunter.string.Chat} />
    </span>
  {/if}

  {#if hasAccountRole(getCurrentAccount(), AccountRole.User)}
    <div class="header-actions">
      <SearchInput
        bind:value={search}
        collapsed
        on:focus={() => (searchExpanded = true)}
        on:blur={() => (searchExpanded = false)}
        kind="ghost"
        width="100%"
      />
      <ButtonIcon
        icon={IconEdit}
        hasMenu
        {pressed}
        size="small"
        kind="tertiary"
        inheritColor
        on:click={handlePenClick}
      />
    </div>
  {/if}
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
    <ChatNavGroup {object} {chat} {model} {pinned} {search} {employees} on:select />
  {/each}
</Scroller>

<style lang="scss">
  .header {
    min-height: 0;
    position: relative;
  }

  .label {
    min-width: fit-content;
    position: absolute;
    left: var(--spacing-2_5);
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .divider {
    width: 100%;
    height: 1px;
    background: var(--theme-navpanel-divider);
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    justify-content: end;
  }

  .searchInput-wrapper {
    display: flex;
    justify-content: stretch;
    align-items: center;
    align-self: stretch;
    padding: 0 var(--spacing-0_5) 0 0;
    height: var(--global-small-Size);
    min-width: var(--global-small-Size);
    background-color: var(--theme-button-default);
    border-radius: var(--small-BorderRadius);
    box-shadow: inset 0 0 0 1px var(--theme-button-border);
  }
</style>
