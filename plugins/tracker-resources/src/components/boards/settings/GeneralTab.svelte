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
  import contact, { type Employee } from '@hcengineering/contact'
  import {
    EmployeePresenter,
    UsersPopup,
    employeeByIdStore,
    employeeRefByAccountUuidStore
  } from '@hcengineering/contact-resources'
  import { notEmpty, type AccountUuid, type Data, type Doc, type Ref } from '@hcengineering/core'
  import { getClient, isDisabled, SpacesMultiPopup } from '@hcengineering/presentation'
  import type { Board, Issue, Project } from '@hcengineering/tracker'
  import ui, { Icon, Label, showPopup } from '@hcengineering/ui'
  import { Button, Dropdown, Radio, SettingRow, TextInput } from '@hcengineering/ui/kit'
  import { FilterConditions } from '@hcengineering/view-resources'
  import task from '@hcengineering/task'
  import { boardQuery } from '../../../boards'
  import tracker from '../../../plugin'
  import ProjectSettingsSection from '../../projects/settings/ProjectSettingsSection.svelte'

  export let board: Board
  export let projects: Project[]
  export let onChange: (patch: Partial<Data<Board>>) => Promise<void>

  const client = getClient()
  const boardNext = !isDisabled('tracker-board-next')
  // Display only until the board gets fields for them
  const hideDoneItems = [{ id: 'older', label: tracker.string.BoardHideDoneValue }]
  const cardOrderItems = [{ id: 'manual', label: tracker.string.BoardCardOrderManual }]
  const hierarchy = client.getHierarchy()

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

  $: authorRef = $employeeRefByAccountUuidStore.get(board.author)
  $: editorRefs = board.editors.map((a) => $employeeRefByAccountUuidStore.get(a)).filter(notEmpty)

  function chooseEditors (e: MouseEvent): void {
    showPopup(
      UsersPopup,
      {
        _class: contact.mixin.Employee,
        multiSelect: true,
        allowDeselect: true,
        selectedUsers: editorRefs,
        ignoreUsers: authorRef !== undefined ? [authorRef] : [],
        filter: (it: Doc) => hierarchy.as(it, contact.mixin.Employee).active
      },
      e.currentTarget as HTMLElement,
      undefined,
      (result: Array<Ref<Employee>> | undefined) => {
        if (result == null) return
        const editors = result
          .map((ref) => $employeeByIdStore.get(ref)?.personUuid as AccountUuid | undefined)
          .filter(notEmpty)
        void onChange({ editors })
      }
    )
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

    <SettingRow kind="column" label={tracker.string.BoardProjects} hint={tracker.string.BoardProjectsHint}>
      <div class="chips" data-id="boardProjects">
        {#each shown as project (project._id)}
          <span class="chip">
            <Icon icon={task.icon.Kanban} size="small" />
            {project.name} · {project.identifier}
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

    <!-- tracker-board-next: Board has no field for hiding old done issues or for the card order -->
    {#if boardNext}
      <SettingRow kind="column" label={tracker.string.BoardHideDoneOlder} hint={tracker.string.BoardHideDoneOlderHint}>
        <Dropdown data-id="boardHideDone" kind="secondary" items={hideDoneItems} selected="older" />
      </SettingRow>
      <SettingRow kind="column" label={tracker.string.BoardCardOrder}>
        <Dropdown data-id="boardCardOrder" kind="secondary" items={cardOrderItems} selected="manual" />
      </SettingRow>
    {/if}

    <div class="divider" />

    <div class="top">
      <SettingRow kind="column" label={tracker.string.BoardVisibility}>
        <div class="radios" role="radiogroup">
          <Radio
            value="all"
            group={board.visibility}
            name="board-visibility"
            label={tracker.string.BoardVisibilityAllMembers}
            data-id="boardVisibilityAll"
            on:change={() => onChange({ visibility: 'all' })}
          />
          <div class="radio">
            <Radio
              value="me"
              group={board.visibility}
              name="board-visibility"
              label={tracker.string.BoardVisibilityOnlyMe}
              data-id="boardVisibilityMe"
              on:change={() => onChange({ visibility: 'me' })}
            />
            <span class="radio-hint"><Label label={tracker.string.BoardVisibilityOnlyMeHint} /></span>
          </div>
        </div>
      </SettingRow>
    </div>

    <SettingRow kind="column" label={tracker.string.BoardAuthor} hint={tracker.string.BoardAuthorHint}>
      <div class="people" data-id="boardAuthor">
        <EmployeePresenter value={authorRef} showPopup={false} />
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.BoardEditors} hint={tracker.string.BoardEditorsHint}>
      <div class="people" data-id="boardEditors">
        {#each editorRefs as ref (ref)}
          <EmployeePresenter value={ref} showPopup={false} />
        {/each}
        <Button
          data-id="boardAddEditor"
          kind="tertiary"
          size="extra-small"
          icon={ui.icon.Plus}
          label={tracker.string.BoardAdd}
          on:click={chooseEditors}
        />
      </div>
    </SettingRow>
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
  .chips,
  .people {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  .people {
    gap: 0.75rem;
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
  .filter {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 30rem;
  }
  .note {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
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
