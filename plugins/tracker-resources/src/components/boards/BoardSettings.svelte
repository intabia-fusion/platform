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
  import contact from '@hcengineering/contact'
  import { getCurrentAccount, type Data, type Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, type Asset, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, isDisabled, MessageBox } from '@hcengineering/presentation'
  import task, { getStates } from '@hcengineering/task'
  import { typeStore } from '@hcengineering/task-resources'
  import type { Board, Project } from '@hcengineering/tracker'
  import ui, {
    BlankView,
    Header,
    Label,
    NavItem,
    Scroller,
    getCurrentResolvedLocation,
    showPopup
  } from '@hcengineering/ui'
  import { Button, Dropdown, IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { statusStore } from '@hcengineering/view-resources'
  import {
    BoardEditor,
    boardLocation,
    canDeleteBoard,
    reportBoardError,
    setBoardInNavigation,
    shareBoard
  } from '../../boards'
  import tracker from '../../plugin'
  import CardTab from './settings/CardTab.svelte'
  import ColumnsTab from './settings/ColumnsTab.svelte'
  import GeneralTab from './settings/GeneralTab.svelte'
  import MembersTab from './settings/MembersTab.svelte'
  import RulesTab from './settings/RulesTab.svelte'

  export let board: Board
  export let boards: Board[]
  export let canEdit: boolean
  export let inNavigation: boolean
  export let navigationReady: boolean

  let sharing = false
  let updatingNavigation = false

  const client = getClient()

  type Tab = 'general' | 'members' | 'columns' | 'swimlanes' | 'quickFilters' | 'colorRules' | 'card'
  const tabs: Array<{ id: Tab, label: IntlString, icon: Asset }> = [
    { id: 'general', label: tracker.string.BoardTabGeneral, icon: view.icon.Setting },
    { id: 'members', label: tracker.string.ProjectSettingsAccess, icon: contact.icon.Contacts },
    { id: 'columns', label: tracker.string.BoardTabColumns, icon: task.icon.Kanban },
    { id: 'swimlanes', label: tracker.string.BoardTabSwimlanes, icon: tracker.icon.MyIssues },
    { id: 'quickFilters', label: tracker.string.BoardTabQuickFilters, icon: view.icon.Star },
    { id: 'colorRules', label: tracker.string.BoardTabColorRules, icon: tracker.icon.Milestone },
    // tracker-board-next: the card fields and the density are not ready for users yet
    ...(!isDisabled('tracker-board-next')
      ? [{ id: 'card' as const, label: tracker.string.BoardTabCard, icon: tracker.icon.Issues }]
      : [])
  ]
  const tabFromQuery = getCurrentResolvedLocation().query?.tab
  let tab: Tab = tabs.find((t) => t.id === tabFromQuery)?.id ?? 'general'

  // The prop is the server version; `current` also holds the edits not saved yet
  let current: Board = board
  const editor = new BoardEditor(
    board,
    client,
    (b) => {
      current = b
    },
    reportBoardError
  )
  $: editor.receive(board)

  async function onChange (patch: Partial<Data<Board>>): Promise<void> {
    await editor.edit(patch)
  }

  // Archived projects stay on the board; the store of active projects drops them
  let projects: Project[] = []
  const projectsQuery = createQuery()
  $: projectsQuery.query(
    tracker.class.Project,
    { _id: { $in: current.projects } },
    (res) => {
      projects = res
    },
    { showArchived: true }
  )

  $: statuses = projects
    .flatMap((p) => getStates(p, $typeStore, $statusStore.byId))
    .filter((s, i, all) => all.findIndex((o) => o._id === s._id) === i)

  $: boardItems = boards.map((b) => ({ id: b._id, label: getEmbeddedLabel(b.title), icon: task.icon.Kanban }))

  function switchBoard (id: Ref<Board>): void {
    if (id !== current._id) boardLocation(id, true)
  }

  function back (): void {
    boardLocation(current._id)
  }
</script>

<div class="hulyComponent board-settings" data-id="boardSettings">
  <Header adaptive="disabled">
    <Button
      data-id="boardSettingsBack"
      kind="ghost"
      size="small"
      icon={ui.icon.ChevronLeftLarge}
      iconSize="small"
      label={tracker.string.BackToBoard}
      on:click={back}
    />
    <div class="hulyHeader-divider" />
    <Dropdown
      data-id="boardSettingsSwitcher"
      kind="ghost"
      size="small"
      icon={task.icon.Kanban}
      items={boardItems}
      selected={current._id}
      on:selected={(e) => {
        switchBoard(e.detail)
      }}
    />
    <span class="title"><Label label={tracker.string.BoardSettings} /></span>
    <svelte:fragment slot="actions">
      {#if !inNavigation}
        <Button
          data-id="boardAddToNavigation"
          kind="secondary"
          size="small"
          disabled={!navigationReady}
          loading={updatingNavigation}
          label={tracker.string.AddBoardToNavigation}
          on:click={() => {
            if (updatingNavigation) return
            updatingNavigation = true
            void setBoardInNavigation(client, board._id, true)
              .catch(reportBoardError)
              .finally(() => {
                updatingNavigation = false
              })
          }}
        />
      {/if}
      <Button
        data-id="boardShare"
        kind="ghost"
        size="small"
        label={tracker.string.ShareBoard}
        loading={sharing}
        on:click={() => {
          if (sharing) return
          sharing = true
          void shareBoard(board)
            .catch(reportBoardError)
            .finally(() => {
              sharing = false
            })
        }}
      />
      {#if canDeleteBoard(board, getCurrentAccount().uuid)}
        <IconButton
          data-id="boardSettingsDelete"
          kind="ghost"
          size="small"
          icon={ui.icon.Trash}
          tooltip={{ label: tracker.string.DeleteBoard }}
          on:click={() => {
            showPopup(MessageBox, {
              label: tracker.string.DeleteBoard,
              message: tracker.string.DeleteBoardConfirm,
              action: async () => {
                await client.remove(board)
              }
            })
          }}
        />
      {/if}
      <IconButton
        data-id="boardSettingsClose"
        kind="ghost"
        size="small"
        icon={ui.icon.Cross}
        tooltip={{ label: tracker.string.BackToBoard }}
        on:click={back}
      />
    </svelte:fragment>
  </Header>
  {#if !canEdit}
    <div class="flex-col-center flex-grow">
      <BlankView icon={tracker.icon.Issues} header={tracker.string.BoardNoRights} />
    </div>
  {:else}
    <div class="hulyComponent-content__container columns">
      <div class="hulyComponent-content__column nav">
        {#each tabs as t (t.id)}
          <div class="navItem" data-id="boardSettingsTab-{t.id}">
            <NavItem
              label={t.label}
              icon={t.icon}
              selected={tab === t.id}
              on:click={() => {
                tab = t.id
              }}
            />
          </div>
        {/each}
      </div>
      <div class="hulyComponent-content__column content">
        <Scroller padding="var(--board-settings-padding, 1.5rem 2rem)">
          {#if tab === 'general'}
            <GeneralTab board={current} {projects} {onChange} />
          {:else if tab === 'members'}
            <MembersTab board={current} {onChange} />
          {:else if tab === 'columns'}
            <ColumnsTab board={current} {statuses} {onChange} />
          {:else if tab === 'card'}
            <CardTab board={current} {onChange} />
          {:else}
            {#key tab}
              <RulesTab board={current} kind={tab} {onChange} />
            {/key}
          {/if}
        </Scroller>
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  // The mockup keeps the back link, the line and the title 8px apart
  .board-settings :global(.hulyHeader-divider) {
    margin: 0 0.25rem;
  }
  .title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  // NavItem has side margins and no width: a column flex wrapper stretches it over the whole column
  .navItem {
    display: flex;
    flex-direction: column;
  }
  .nav {
    flex-shrink: 0;
    width: 14.5rem;
    padding-top: var(--spacing-1);
    border-right: 1px solid var(--theme-divider-color);
  }

  .content {
    min-width: 0;
    flex: 1;
  }
  .board-settings {
    min-width: 0;
    container-type: inline-size;
  }
  .columns {
    min-height: 0;
  }
  @container (max-width: 42rem) {
    .columns {
      flex-direction: column;
    }
    .nav {
      flex-direction: row;
      height: auto;
      width: 100%;
      overflow-x: scroll;
      scrollbar-width: auto;
      scrollbar-gutter: stable;
      border-right: 0;
      border-bottom: 1px solid var(--theme-divider-color);
    }
    .navItem {
      flex-shrink: 0;
    }
    .content {
      --board-settings-padding: 1rem;
      min-height: 0;
      height: auto;
    }
    .board-settings .content :global(.setting-row--column .setting-row__main) {
      flex-direction: column;
      align-items: stretch;
    }
    .board-settings .content :global(.setting-row--column .setting-row__caption),
    .board-settings .content :global(.setting-row--column .setting-row__control) {
      width: 100%;
    }
    .board-settings :global(.hulyHeader-container) {
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: var(--spacing-1);
      padding-block: var(--spacing-1);
      overflow: visible;
    }
    .board-settings :global(.hulyHeader-titleGroup),
    .board-settings :global(.hulyHeader-buttonsGroup.actions) {
      flex-wrap: wrap;
      flex-basis: 100%;
    }
    .board-settings :global(.hulyHeader-titleGroup > *),
    .board-settings :global(.hulyHeader-buttonsGroup.actions > *) {
      max-width: 100%;
    }
    .title {
      overflow-wrap: anywhere;
    }
  }
  .content :global(.section),
  .content :global(.rows),
  .content :global(.setting-row) {
    min-width: 0;
    max-width: 100%;
  }
  .content :global(.setting-row__label),
  .content :global(.description) {
    overflow-wrap: anywhere;
  }
</style>
