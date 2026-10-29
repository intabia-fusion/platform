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
  import type { Data, Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, type Asset, type IntlString } from '@hcengineering/platform'
  import { createQuery, getClient, isDisabled } from '@hcengineering/presentation'
  import task, { getStates } from '@hcengineering/task'
  import { typeStore } from '@hcengineering/task-resources'
  import type { Board, Project } from '@hcengineering/tracker'
  import ui, { BlankView, Header, Label, NavItem, Scroller, getCurrentResolvedLocation } from '@hcengineering/ui'
  import { Button, Dropdown, IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { statusStore } from '@hcengineering/view-resources'
  import { BoardEditor, boardLocation, reportBoardError } from '../../boards'
  import tracker from '../../plugin'
  import CardTab from './settings/CardTab.svelte'
  import ColumnsTab from './settings/ColumnsTab.svelte'
  import GeneralTab from './settings/GeneralTab.svelte'
  import MembersTab from './settings/MembersTab.svelte'
  import RulesTab from './settings/RulesTab.svelte'

  export let board: Board
  export let boards: Board[]
  export let canEdit: boolean

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
    <span class="title"><Label label={tracker.string.BoardSettings} /></span>
    <svelte:fragment slot="actions">
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
        <Scroller padding="1.5rem 2rem">
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
</style>
