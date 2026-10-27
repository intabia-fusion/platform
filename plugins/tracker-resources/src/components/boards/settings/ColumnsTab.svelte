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
  import { generateId, type Data, type Ref, type Status } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { getClient, isDisabled } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { statusesWithoutColumn, type Board, type BoardColumn, type Issue } from '@hcengineering/tracker'
  import ui, { getEventPositionElement, Icon, Label, Menu, showPopup } from '@hcengineering/ui'
  import { Button, Callout, IconButton, Toggle } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { statusStore } from '@hcengineering/view-resources'
  import tracker from '../../../plugin'
  import IssueStatusIcon from '../../issues/IssueStatusIcon.svelte'
  import ProjectSettingsSection from '../../projects/settings/ProjectSettingsSection.svelte'

  // Reads only the columns and the projects, so a wizard may pass a draft
  export let board: Pick<Board, 'columns' | 'projects'>
  // Statuses of the board projects
  export let statuses: Status[]
  export let onChange: (patch: Partial<Data<Board>>) => Promise<void>
  // For a dialog: no section head, no limits and summaries
  export let compact: boolean = false

  const client = getClient()
  const boardNext = !isDisabled('tracker-board-next')
  const issueStats = !isDisabled('tracker-issue-stats')
  // Display only: nothing stores the switch
  let daysInColumn = false

  // All statuses, not only the projects' ones: a column may keep a status of a removed project
  $: byId = $statusStore.byId
  $: placed = new Set(board.columns.flatMap((c) => c.statuses))
  $: unplaced = statuses.filter((s) => !placed.has(s._id))
  $: open = new Set(statusesWithoutColumn(board.columns, statuses).map((s) => s._id))

  // Issues of the board projects per status, the board filter aside
  let counts = new Map<Ref<Status>, number>()
  let countSeq = 0
  async function countIssues (projects: Board['projects'], ids: Array<Ref<Status>>): Promise<void> {
    const seq = ++countSeq
    const totals = await Promise.all(
      ids.map(
        async (status) =>
          await client.findAll<Issue>(
            tracker.class.Issue,
            { space: { $in: projects }, status },
            { limit: 1, total: true }
          )
      )
    )
    if (seq === countSeq) counts = new Map(ids.map((id, i) => [id, totals[i].total]))
  }
  $: void countIssues(board.projects, [...new Set([...statuses.map((s) => s._id), ...placed])])

  $: hiddenIssues = [...open].reduce((sum, id) => sum + (counts.get(id) ?? 0), 0)

  // Turning the limits off clears them: a hidden limit would still paint columns red
  let wip = board.columns.some((c) => c.limit !== undefined)
  function setWip (on: boolean): void {
    wip = on
    if (!on && board.columns.some((c) => c.limit !== undefined)) {
      save(board.columns.map(({ limit, ...c }) => c))
    }
  }

  function save (columns: BoardColumn[]): void {
    void onChange({ columns })
  }

  async function addColumn (): Promise<void> {
    const title = await translate(tracker.string.NewColumn, {})
    save([...board.columns, { id: generateId(), title, category: task.statusCategory.UnStarted, statuses: [] }])
  }

  function patchColumn (id: string, patch: Partial<BoardColumn>): void {
    save(board.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  function removeColumn (id: string): void {
    save(board.columns.filter((c) => c.id !== id))
  }

  function move (from: number, to: number): void {
    if (from === to || to < 0 || to >= board.columns.length) return
    const columns = [...board.columns]
    const [column] = columns.splice(from, 1)
    columns.splice(to, 0, column)
    save(columns)
  }

  // A column takes the category of its first status
  function withCategory (column: BoardColumn): BoardColumn {
    const first = byId.get(column.statuses[0])
    return first?.category !== undefined ? { ...column, category: first.category } : column
  }

  function placeStatus (id: Ref<Status>, target: string | undefined): void {
    const columns = board.columns.map((c) => {
      const statuses = c.statuses.filter((s) => s !== id)
      return withCategory({ ...c, statuses: c.id === target ? [...statuses, id] : statuses })
    })
    save(columns)
  }

  function setLimit (column: BoardColumn, value: string): void {
    const limit = Number(value)
    patchColumn(column.id, { limit: value.trim() !== '' && limit > 0 ? Math.floor(limit) : undefined })
  }

  function setTitle (column: BoardColumn, value: string): void {
    if (value.trim() !== '' && value.trim() !== column.title) patchColumn(column.id, { title: value.trim() })
  }

  function showColumnMenu (e: MouseEvent, index: number): void {
    const column = board.columns[index]
    showPopup(
      Menu,
      {
        actions: [
          ...(index > 0
            ? [
                {
                  label: tracker.string.ColumnMoveLeft,
                  action: async () => {
                    move(index, index - 1)
                  }
                }
              ]
            : []),
          ...(index < board.columns.length - 1
            ? [
                {
                  label: tracker.string.ColumnMoveRight,
                  action: async () => {
                    move(index, index + 1)
                  }
                }
              ]
            : []),
          {
            label: tracker.string.Delete,
            icon: view.icon.Delete,
            action: async () => {
              removeColumn(column.id)
            }
          }
        ]
      },
      getEventPositionElement(e)
    )
  }

  // What is being dragged: a status chip or a column by its handle
  let dragged: { kind: 'status', id: Ref<Status> } | { kind: 'column', index: number } | undefined
  // Column under the pointer, `null` - the list of statuses without a column
  let over: string | null | undefined

  function endDrag (): void {
    dragged = undefined
    over = undefined
  }

  function drop (target: string | undefined, index?: number): void {
    if (dragged?.kind === 'status') placeStatus(dragged.id, target)
    else if (dragged?.kind === 'column' && index !== undefined) move(dragged.index, index)
    endDrag()
  }
</script>

<ProjectSettingsSection
  title={compact ? undefined : tracker.string.BoardTabColumns}
  description={tracker.string.BoardColumnsHint}
  wide
>
  <div class="tab" class:compact data-id="boardSettingsColumns">
    <div class="options">
      {#if !compact}
        <Toggle
          kind="brand"
          checked={wip}
          label={tracker.string.WipLimits}
          data-id="boardWipLimits"
          on:change={(e) => {
            setWip(e.detail)
          }}
        />
        <!-- tracker-issue-stats: an issue keeps no time of entering a status -->
        {#if issueStats}
          <Toggle
            kind="brand"
            checked={daysInColumn}
            label={tracker.string.DaysInColumnToggle}
            data-id="boardDaysInColumn"
            on:change={(e) => {
              daysInColumn = e.detail
            }}
          />
        {/if}
      {/if}
      <Button
        kind="secondary"
        size="small"
        icon={ui.icon.Plus}
        label={tracker.string.AddColumn}
        data-id="boardAddColumn"
        on:click={addColumn}
      />
    </div>

    <div class="editor">
      <div
        class="column unplaced"
        class:over={over === null && dragged?.kind === 'status'}
        data-id="boardUnplacedStatuses"
        role="list"
        on:dragover|preventDefault={() => {
          over = null
        }}
        on:drop|preventDefault={() => {
          drop(undefined)
        }}
      >
        <span class="unplaced-title"><Label label={tracker.string.StatusesWithoutColumnTitle} /></span>
        {#if hiddenIssues > 0}
          <Callout tone="warning" label={tracker.string.BoardHiddenIssues} labelParams={{ count: hiddenIssues }} />
        {/if}
        <div class="statuses">
          {#each unplaced as status (status._id)}
            <div
              class="status"
              draggable="true"
              role="listitem"
              data-id="boardStatus"
              on:dragstart={(e) => {
                e.dataTransfer?.setData('text/plain', status._id)
                dragged = { kind: 'status', id: status._id }
              }}
              on:dragend={endDrag}
            >
              <span class="grip"><Icon icon={ui.icon.GripVertical} size="small" /></span>
              <IssueStatusIcon value={status} size="x-small" />
              <span class="status-name">{status.name}</span>
              <span class="count">{counts.get(status._id) ?? ''}</span>
            </div>
          {/each}
        </div>
        <div class="drop-zone"><Label label={tracker.string.DropStatusToRemove} /></div>
      </div>

      {#each board.columns as column, i (column.id)}
        {@const first = byId.get(column.statuses[0])}
        {@const issues = column.statuses.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0)}
        <div
          class="column"
          class:over={over === column.id && dragged !== undefined}
          data-id="boardColumn"
          role="list"
          on:dragover|preventDefault={() => {
            over = column.id
          }}
          on:drop|preventDefault={() => {
            drop(column.id, i)
          }}
        >
          <div class="head">
            <span
              class="grip handle"
              draggable="true"
              role="button"
              tabindex="-1"
              on:dragstart={(e) => {
                e.dataTransfer?.setData('text/plain', column.id)
                dragged = { kind: 'column', index: i }
              }}
              on:dragend={endDrag}
            >
              <Icon icon={ui.icon.GripVertical} size="small" />
            </span>
            {#if first !== undefined}
              <IssueStatusIcon value={first} size="small" />
            {/if}
            <input
              class="name"
              value={column.title}
              placeholder={column.title}
              on:change={(e) => {
                setTitle(column, e.currentTarget.value)
              }}
            />
            <IconButton
              icon={ui.icon.DotsHorizontal}
              kind="ghost"
              size="extra-small"
              tooltip={{ label: ui.string.MoreOptions }}
              data-id="boardColumnMenu"
              on:click={(e) => {
                showColumnMenu(e, i)
              }}
            />
          </div>
          {#if wip && !compact}
            <div class="wips">
              <!-- tracker-board-next: BoardColumn has no min limit field -->
              {#if boardNext}
                <label class="wip">
                  <span class="wip-label"><Label label={tracker.string.WipMin} /></span>
                  <input type="number" min="1" placeholder="—" data-id="boardWipMin" />
                </label>
              {/if}
              <label class="wip">
                <span class="wip-label"><Label label={tracker.string.WipMax} /></span>
                <input
                  type="number"
                  min="1"
                  placeholder="—"
                  value={column.limit ?? ''}
                  on:change={(e) => {
                    setLimit(column, e.currentTarget.value)
                  }}
                />
              </label>
            </div>
          {/if}
          {#if !compact}
            <span class="summary">
              <Label label={tracker.string.BoardColumnSummary} params={{ statuses: column.statuses.length, issues }} />
            </span>
          {/if}
          <div class="statuses">
            {#each column.statuses as id (id)}
              {@const status = byId.get(id)}
              {#if status !== undefined}
                <div
                  class="status"
                  draggable="true"
                  role="listitem"
                  data-id="boardStatus"
                  on:dragstart={(e) => {
                    e.dataTransfer?.setData('text/plain', status._id)
                    dragged = { kind: 'status', id: status._id }
                  }}
                  on:dragend={endDrag}
                >
                  <span class="grip"><Icon icon={ui.icon.GripVertical} size="small" /></span>
                  <IssueStatusIcon value={status} size="x-small" />
                  <span class="status-name">{status.name}</span>
                  <span class="count">{counts.get(id) ?? ''}</span>
                </div>
              {/if}
            {/each}
          </div>
          {#if over === column.id && dragged?.kind === 'status' && !column.statuses.includes(dragged.id)}
            <div class="drop-target" />
          {/if}
        </div>
      {/each}
    </div>
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .tab {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }
  .options {
    display: flex;
    align-items: center;
    gap: 2rem;
    min-height: 2rem;
  }
  .editor {
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
    min-height: 35rem;
    padding: 0.75rem;
    overflow-x: auto;
    background-color: var(--theme-list-row-color);
    border-radius: 0.5rem;
  }
  .column {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 0.5rem;
    box-sizing: border-box;
    width: 14.125rem;
    padding: 0.625rem;
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;

    &.unplaced {
      width: 13.75rem;
      padding: 0.75rem;
      border-color: var(--theme-warning-color);
    }
    &.over {
      border-color: var(--primary-button-default);
    }
  }
  .unplaced-title {
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 2rem;
  }
  .statuses {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .grip {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--theme-darker-color);
    cursor: grab;
  }
  .name {
    flex: 1;
    min-width: 0;
    height: 2rem;
    padding: 0 0.5rem;
    font: inherit;
    font-weight: 600;
    color: var(--theme-caption-color);
    background: none;
    border: none;
    border-radius: 0.375rem;
    outline: none;

    &:hover,
    &:focus {
      background-color: var(--input-BackgroundColor);
    }
  }
  .wips {
    display: flex;
    gap: 0.25rem;
  }
  .wip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    box-sizing: border-box;
    width: 6.25rem;
    height: 1.75rem;
    padding: 0 0.5rem;
    background-color: var(--input-BackgroundColor);
    border-radius: 0.375rem;

    input {
      width: 100%;
      min-width: 0;
      font-size: 0.8125rem;
      color: var(--theme-caption-color);
      background: none;
      border: none;
      outline: none;
      appearance: textfield;

      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        appearance: none;
      }
      &::placeholder {
        color: var(--theme-darker-color);
      }
    }
  }
  .wip-label {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
  .summary {
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 2rem;
    padding: 0 0.375rem 0 0.25rem;
    font-size: 0.8125rem;
    color: var(--theme-content-color);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.25rem;
    cursor: grab;

    .grip :global(svg) {
      width: 0.875rem;
      height: 0.875rem;
    }
  }
  .status-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .count {
    margin-left: 0.25rem;
    color: var(--theme-darker-color);
  }
  .drop-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-height: 4rem;
    padding: 0 0.75rem;
    font-size: 0.75rem;
    text-align: center;
    color: var(--theme-darker-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
  }
  .compact {
    // Fits the wizard step: the statuses scroll inside their column, not the step
    .editor {
      box-sizing: border-box;
      height: 24rem;
      min-height: 0;
      padding: 0.5rem;
    }
    .column,
    .column.unplaced {
      width: 12rem;
      min-height: 0;
      padding: 0.5rem;
    }
    .statuses {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }
    .status {
      flex-shrink: 0;
    }
    .drop-zone {
      min-height: 2.5rem;
    }
  }
  .drop-target {
    flex-shrink: 0;
    height: 2rem;
    background-color: color-mix(in srgb, var(--primary-button-default) 6%, transparent);
    border: 2px solid var(--primary-button-default);
    border-radius: 0.25rem;
  }
</style>
