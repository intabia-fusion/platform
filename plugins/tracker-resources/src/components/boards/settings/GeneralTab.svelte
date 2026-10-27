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
  import { getCurrentAccount, notEmpty, type AccountUuid, type Data, type Ref } from '@hcengineering/core'
  import { getClient, isDisabled, SpacesMultiPopup } from '@hcengineering/presentation'
  import type { Board, Issue, Project } from '@hcengineering/tracker'
  import ui, { Icon, Label, showPopup } from '@hcengineering/ui'
  import { Button, Dropdown, IconButton, Radio, SettingRow, TextArea, TextInput } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { FilterConditions, getKeyLabel } from '@hcengineering/view-resources'
  import task from '@hcengineering/task'
  import { boardQuery } from '../../../boards'
  import tracker from '../../../plugin'
  import ProjectMembersTable from '../../projects/settings/ProjectMembersTable.svelte'
  import ProjectSettingsSection from '../../projects/settings/ProjectSettingsSection.svelte'

  export let board: Board
  export let projects: Project[]
  export let onChange: (patch: Partial<Data<Board>>) => Promise<void>

  const client = getClient()
  const boardNext = !isDisabled('tracker-board-next')
  // Display only until the board gets fields for them
  const hideDoneItems = [{ id: 'older', label: tracker.string.BoardHideDoneValue }]
  // The orders of the kanban view options; the first one is the default of a board
  const cardOrders =
    client
      .getModel()
      .findAllSync(view.class.Viewlet, { attachTo: tracker.class.Issue, descriptor: tracker.viewlet.Kanban })
      .find((v) => v.variant === undefined)?.viewOptions?.orderBy ?? []
  const cardOrderItems = cardOrders.map(([key]) => ({
    id: key,
    label: key === 'rank' ? tracker.string.Manual : getKeyLabel(client, tracker.class.Issue, key, undefined)
  }))

  let title = board.title
  // An object prop is invalidated on every parent update: take the title only when it changed
  let savedTitle = board.title
  $: if (board.title !== savedTitle) {
    savedTitle = board.title
    title = board.title
  }

  function saveTitle (): void {
    const value = title.trim()
    if (value !== '' && value !== board.title) void onChange({ title: value })
  }

  let description = board.description ?? ''
  let savedDescription = board.description ?? ''
  $: if ((board.description ?? '') !== savedDescription) {
    savedDescription = board.description ?? ''
    description = savedDescription
  }

  function saveDescription (): void {
    const value = description.trim()
    if (value !== savedDescription) void onChange({ description: value })
  }

  // Board projects in the board order; a project the user cannot see is left out
  $: shown = board.projects.map((id) => projects.find((p) => p._id === id)).filter(notEmpty)

  function chooseProjects (e: MouseEvent): void {
    showPopup(
      SpacesMultiPopup,
      { _classes: [tracker.class.Project], label: tracker.string.BoardProjects, selectedSpaces: board.projects },
      e.currentTarget as HTMLElement,
      () => {},
      (result: Array<Ref<Project>> | undefined) => {
        if (result !== undefined) void onChange({ projects: result })
      }
    )
  }

  // How many issues of the board projects the board filter lets through
  let counts: { matched: number, total: number } | undefined
  let countSeq = 0
  async function count (board: Board): Promise<void> {
    const seq = ++countSeq
    if (board.projects.length === 0) {
      counts = undefined
      return
    }
    const [total, matched] = await Promise.all([
      client.findAll<Issue>(tracker.class.Issue, { space: { $in: board.projects } }, { limit: 1, total: true }),
      boardQuery(client, board, new Set(), () => {
        void count(board)
      }).then(async (q) => await client.findAll<Issue>(tracker.class.Issue, q, { limit: 1, total: true }))
    ])
    if (seq === countSeq) counts = { matched: matched.total, total: total.total }
  }
  $: void count(board)

  // The board moves to the personal space of the one who switches it: the author only
  $: isAuthor = getCurrentAccount().uuid === board.author

  function addEditor (account: AccountUuid): void {
    if (account === board.author || board.editors.includes(account)) return
    void onChange({ editors: [...board.editors, account] })
  }

  function removeEditor (account: AccountUuid): void {
    void onChange({ editors: board.editors.filter((a) => a !== account) })
  }

  function removeProject (id: Ref<Project>): void {
    void onChange({ projects: board.projects.filter((p) => p !== id) })
  }
</script>

<ProjectSettingsSection title={tracker.string.BoardTabGeneral} description={tracker.string.BoardGeneralHint}>
  <div class="rows" data-id="boardSettingsGeneral">
    <SettingRow kind="column" label={tracker.string.RuleTitle} let:labelId>
      <div class="field wide">
        <TextInput
          id="board-title"
          bind:value={title}
          placeholder={tracker.string.BoardTitle}
          aria-labelledby={labelId}
          fullWidth
          on:change={saveTitle}
        />
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.Description} let:labelId>
      <div class="field wide">
        <TextArea
          id="board-description"
          bind:value={description}
          rows={2}
          placeholder={tracker.string.IssueDescriptionPlaceholder}
          aria-labelledby={labelId}
          on:change={saveDescription}
        />
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.BoardProjects} hint={tracker.string.BoardProjectsHint}>
      <div class="chips" data-id="boardProjects">
        {#each shown as project (project._id)}
          <span class="chip">
            <Icon icon={task.icon.Kanban} size="small" />
            {project.name} · {project.identifier}
            {#if board.projects.length > 1}
              <span class="remove">
                <IconButton
                  data-id="boardRemoveProject"
                  kind="ghost"
                  size="min"
                  icon={ui.icon.Cross}
                  tooltip={{ label: ui.string.Remove }}
                  on:click={() => {
                    removeProject(project._id)
                  }}
                />
              </span>
            {/if}
          </span>
        {/each}
        <Button
          data-id="boardAddProject"
          kind="tertiary"
          size="extra-small"
          icon={ui.icon.Plus}
          label={tracker.string.BoardAdd}
          on:click={chooseProjects}
        />
      </div>
    </SettingRow>

    <div class="top">
      <div class="filter-row">
        <SettingRow kind="column" label={tracker.string.BoardFilter} hint={tracker.string.BoardFilterHint}>
          <div class="filter">
            <FilterConditions
              _class={tracker.class.Issue}
              value={board.filter}
              removable
              addLabel={tracker.string.BoardCondition}
              hiddenKeys={['space']}
              on:change={(e) => onChange({ filter: e.detail })}
            />
            {#if counts !== undefined}
              <span class="note" data-id="boardFilterCount">
                <Label label={tracker.string.BoardFilterCount} params={counts} />
              </span>
            {/if}
          </div>
        </SettingRow>
      </div>
    </div>

    <!-- tracker-board-next: Board has no field for hiding old done issues -->
    {#if boardNext}
      <SettingRow kind="column" label={tracker.string.BoardHideDoneOlder} hint={tracker.string.BoardHideDoneOlderHint}>
        <Dropdown data-id="boardHideDone" kind="secondary" items={hideDoneItems} selected="older" />
      </SettingRow>
    {/if}
    <SettingRow kind="column" label={tracker.string.BoardCardOrder}>
      <Dropdown
        data-id="boardCardOrder"
        kind="secondary"
        items={cardOrderItems}
        selected={board.orderBy?.[0] ?? cardOrders[0]?.[0]}
        on:selected={(e) => {
          const order = cardOrders.find(([key]) => key === e.detail)
          if (order !== undefined && order[0] !== board.orderBy?.[0]) void onChange({ orderBy: order })
        }}
      />
    </SettingRow>

    <div class="divider" />

    <div class="top">
      <SettingRow kind="column" label={tracker.string.BoardVisibility}>
        <div class="radios" role="radiogroup">
          <Radio
            value="all"
            group={board.visibility}
            name="board-visibility"
            label={tracker.string.BoardVisibilityAllMembers}
            disabled={!isAuthor}
            data-id="boardVisibilityAll"
            on:change={() => onChange({ visibility: 'all' })}
          />
          <div class="radio">
            <Radio
              value="me"
              group={board.visibility}
              name="board-visibility"
              label={tracker.string.BoardVisibilityOnlyMe}
              disabled={!isAuthor}
              data-id="boardVisibilityMe"
              on:change={() => onChange({ visibility: 'me' })}
            />
            <span class="radio-hint"><Label label={tracker.string.BoardVisibilityOnlyMeHint} /></span>
          </div>
        </div>
      </SettingRow>
    </div>

    <!-- A personal board sits in the author's PersonSpace: editors could not even see it -->
    {#if board.visibility !== 'me'}
      <div class="editors" data-id="boardEditors">
        <ProjectMembersTable
          members={[board.author, ...board.editors]}
          lockedAccount={board.author}
          ignoreAccounts={[board.author]}
          fixedRole={(a) => (a === board.author ? tracker.string.BoardAuthor : tracker.string.BoardEditorRole)}
          removeLabel={ui.string.Remove}
          addDataId="boardAddEditor"
          onAdd={addEditor}
          onRemove={removeEditor}
        />
      </div>
    {/if}
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .rows {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }
  // A tall control: the caption stays at its top
  .top :global(.setting-row__main) {
    align-items: flex-start;
  }
  .field.wide {
    width: 26.25rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  .remove {
    display: inline-flex;
    opacity: 0;
  }
  .chip:hover .remove,
  .chip:focus-within .remove {
    opacity: 1;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 1.75rem;
    padding: 0 0.375rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
    background-color: var(--theme-link-button-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
  }
  // The label line is as tall as the add button, so the count starts where the hint does
  .filter-row :global(.setting-row__main) {
    align-items: flex-start;
  }
  .filter-row :global(.setting-row__label) {
    display: flex;
    align-items: center;
    min-height: var(--global-extra-small-Size);
  }
  .filter {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    max-width: 30rem;
  }
  .note {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
  // A table section: apart from the rows above, as sections of the project settings
  // The last section of the page: room under the table when the page scrolls to the end
  .editors {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
    padding-bottom: 1rem;
  }
  .divider {
    width: 45rem;
    height: 1px;
    background-color: var(--theme-divider-color);
  }
  .radios {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .radio {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-0_25);
  }
  .radio-hint {
    padding-left: calc(1rem + var(--spacing-1));
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
  }
</style>
