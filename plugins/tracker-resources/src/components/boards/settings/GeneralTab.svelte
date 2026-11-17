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
  import { DateRangeMode, notEmpty, type Data, type Ref } from '@hcengineering/core'
  import { getClient, SpacesMultiPopup } from '@hcengineering/presentation'
  import type { Board, Issue, Project } from '@hcengineering/tracker'
  import ui, { Icon, Label, showPopup } from '@hcengineering/ui'
  import {
    Button,
    DateLabel,
    DatePicker,
    Dropdown,
    IconButton,
    SettingRow,
    TextArea,
    TextInput,
    type DatePickerResult
  } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { FilterConditions, getKeyLabel } from '@hcengineering/view-resources'
  import task from '@hcengineering/task'
  import { onDestroy } from 'svelte'
  import { BoardQuery } from '../../../boards'
  import tracker from '../../../plugin'
  import ProjectSettingsSection from '../../projects/settings/ProjectSettingsSection.svelte'

  export let board: Board
  export let projects: Project[]
  export let onChange: (patch: Partial<Data<Board>>) => Promise<void>

  const client = getClient()
  const hideDoneItems = [
    { id: 'off', label: tracker.string.BoardHideDoneNever },
    { id: '1', label: tracker.string.BoardHideDoneDay },
    { id: '3', label: tracker.string.BoardHideDoneThreeDays },
    { id: '7', label: tracker.string.BoardHideDoneWeek },
    { id: '14', label: tracker.string.BoardHideDoneValue },
    { id: '30', label: tracker.string.BoardHideDoneMonth },
    { id: '90', label: tracker.string.BoardHideDoneQuarter },
    { id: '180', label: tracker.string.BoardHideDoneHalfYear },
    { id: '365', label: tracker.string.BoardHideDoneYear },
    { id: 'custom', label: tracker.string.BoardHideDoneCustom }
  ]
  let hideDoneElement: HTMLButtonElement | undefined
  let hideDoneSelection = 'off'
  let datePicker: ReturnType<typeof showPopup> | undefined
  const periodSelection = (value: Board): string =>
    value.hideCompletedBefore != null
      ? 'custom'
      : String(value.hideCompletedAfterDays === 0 ? 'off' : (value.hideCompletedAfterDays ?? 'off'))
  $: hideDoneSelection = periodSelection(board)
  onDestroy(() => {
    datePicker?.close()
  })

  function chooseCompletedDate (): void {
    if (datePicker !== undefined) return
    datePicker = showPopup(
      DatePicker,
      {
        value: board.hideCompletedBefore,
        mode: DateRangeMode.DATE,
        shifts: false,
        label: tracker.string.BoardHideDoneCustom,
        detail: tracker.string.BoardHideDoneCustomHint
      },
      hideDoneElement ?? 'top',
      (result: DatePickerResult | null | undefined) => {
        datePicker = undefined
        if (result?.value == null) {
          hideDoneSelection = periodSelection(board)
          return
        }
        const before = new Date(result.value).setHours(0, 0, 0, 0)
        void onChange({ hideCompletedAfterDays: 0, hideCompletedBefore: before })
      }
    )
  }

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
  const boardQueries = new BoardQuery(client, () => {
    void count(board)
  })
  onDestroy(() => {
    boardQueries.destroy()
  })
  let countSeq = 0
  async function count (board: Board): Promise<void> {
    const seq = ++countSeq
    if (board.projects.length === 0) {
      counts = undefined
      return
    }
    const [total, matched] = await Promise.all([
      client.findAll<Issue>(tracker.class.Issue, { space: { $in: board.projects } }, { limit: 1, total: true }),
      boardQueries
        .build(board)
        .then(async (q) => await client.findAll<Issue>(tracker.class.Issue, q, { limit: 1, total: true }))
    ])
    if (seq === countSeq) counts = { matched: matched.total, total: total.total }
  }
  $: void count(board)

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

    <SettingRow kind="column" label={tracker.string.BoardHideDoneOlder} hint={tracker.string.BoardHideDoneOlderHint}>
      <div class="completed-period">
        <Dropdown
          data-id="boardHideDone"
          kind="secondary"
          items={hideDoneItems}
          bind:element={hideDoneElement}
          bind:selected={hideDoneSelection}
          on:selected={(e) => {
            if (e.detail === 'custom') {
              chooseCompletedDate()
              return
            }
            const days = e.detail === 'off' ? 0 : Number(e.detail)
            if (
              days === 0 ||
              days === 1 ||
              days === 3 ||
              days === 7 ||
              days === 14 ||
              days === 30 ||
              days === 90 ||
              days === 180 ||
              days === 365
            ) {
              void onChange({ hideCompletedAfterDays: days, hideCompletedBefore: null })
            }
          }}
        />
        {#if board.hideCompletedBefore != null}
          <Button data-id="boardHideDoneCustomPeriod" kind="secondary" on:click={chooseCompletedDate}>
            <DateLabel value={board.hideCompletedBefore} showIcon={false} />
          </Button>
        {/if}
      </div>
    </SettingRow>
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
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .completed-period {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

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
    width: min(26.25rem, 100%);
    min-width: 0;
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
    min-height: 1.75rem;
    max-width: 100%;
    overflow-wrap: anywhere;
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
</style>
