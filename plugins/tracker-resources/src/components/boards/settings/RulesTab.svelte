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
  import { generateId, type Data, type Ref, type WithLookup } from '@hcengineering/core'
  import { translate, type IntlString } from '@hcengineering/platform'
  import { getClient, isDisabled, MessageBox } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import {
    boardSwimLaneFields,
    isCardFieldVisible,
    pickRuleSamples,
    pickSwimlane,
    type Board,
    type BoardColorRule,
    type BoardQuickFilter,
    type BoardSwimlane,
    type BoardSwimLaneField,
    type CardField,
    type Issue
  } from '@hcengineering/tracker'
  import { onDestroy } from 'svelte'
  import ui, { eventToHTMLElement, getPlatformColorDef, Icon, Label, showPopup, themeStore } from '@hcengineering/ui'
  import { Button, Dropdown, IconButton, Radio, SettingRow, Toggle } from '@hcengineering/ui/kit'
  import { ColorsPopup, FilterConditions } from '@hcengineering/view-resources'
  import { boardQuery, ConditionMatches } from '../../../boards'
  import tracker from '../../../plugin'
  import IssueKanbanCard from '../../issues/IssueKanbanCard.svelte'
  import ProjectSettingsSection from '../../projects/settings/ProjectSettingsSection.svelte'

  export let board: Board
  export let kind: 'swimlanes' | 'quickFilters' | 'colorRules'
  export let onChange: (patch: Partial<Data<Board>>) => Promise<void>

  const client = getClient()
  const boardNext = !isDisabled('tracker-board-next')

  type Rule = BoardSwimlane | BoardQuickFilter | BoardColorRule

  function isTitled (rule: Rule): rule is BoardSwimlane | BoardQuickFilter {
    return 'title' in rule
  }

  $: rules = board[kind] as Rule[]
  // The last lane takes everything the lanes above did not
  $: editable = kind === 'swimlanes' ? rules.slice(0, -1) : rules
  $: rest = kind === 'swimlanes' ? (rules[rules.length - 1] as BoardSwimlane | undefined) : undefined

  function save (next: Rule[]): void {
    const patch: Partial<Data<Board>> = {}
    Object.assign(patch, { [kind]: next })
    void onChange(patch)
  }

  async function add (): Promise<void> {
    if (kind === 'swimlanes') {
      const title = await translate(tracker.string.NewSwimlane, {})
      const restTitle = await translate(tracker.string.AllOthers, {})
      const rest = rules.length > 0 ? rules[rules.length - 1] : { id: generateId(), title: restTitle, condition: '' }
      save([...rules.slice(0, -1), { id: generateId(), title, condition: '' }, rest])
    } else if (kind === 'quickFilters') {
      save([...rules, { id: generateId(), title: await translate(tracker.string.NewQuickFilter, {}), condition: '' }])
    } else {
      save([...rules, { id: generateId(), color: 0, condition: '' }])
    }
  }

  function patch (id: string, change: Partial<Rule>): void {
    save(rules.map((r) => (r.id === id ? { ...r, ...change } : r)))
  }

  function remove (id: string): void {
    const next = rules.filter((r) => r.id !== id)
    // A lone "all others" lane is no lane at all
    save(kind === 'swimlanes' && next.length === 1 ? [] : next)
  }

  function setTitle (rule: Rule, value: string): void {
    if (isTitled(rule) && value.trim() !== '' && value.trim() !== rule.title) patch(rule.id, { title: value.trim() })
  }

  function pickColor (ev: MouseEvent, rule: BoardColorRule): void {
    showPopup(
      ColorsPopup,
      { selected: getPlatformColorDef(rule.color, $themeStore.dark).name },
      eventToHTMLElement(ev),
      (color) => {
        if (typeof color === 'number') patch(rule.id, { color })
      }
    )
  }

  // Rows are reordered by their handle; the "all others" lane stays last
  let dragged: number | undefined
  let over: number | undefined
  function drop (to: number): void {
    if (dragged !== undefined && dragged !== to) {
      const moved = [...editable]
      const [rule] = moved.splice(dragged, 1)
      moved.splice(to, 0, rule)
      save(rest !== undefined ? [...moved, rest] : moved)
    }
    dragged = undefined
    over = undefined
  }

  type LaneMode = 'none' | 'field' | 'filters'
  // The picked mode holds until the board shows it: a render with the board before the change would
  // uncheck the clicked radio, and the browser has already unchecked the one before it
  let pending: LaneMode | undefined
  let stored: LaneMode
  $: stored = board.swimLaneBy != null ? 'field' : board.swimlanes.length > 0 ? 'filters' : 'none'
  $: if (pending === stored) pending = undefined
  $: lanes = pending ?? stored

  const laneFieldLabels: Record<BoardSwimLaneField, IntlString> = {
    assignee: tracker.string.Assignee,
    priority: tracker.string.Priority,
    component: tracker.string.Component,
    milestone: tracker.string.Milestone,
    attachedTo: task.string.TaskParent,
    space: tracker.string.Project
  }
  const laneFieldItems = boardSwimLaneFields.map((id) => ({ id, label: laneFieldLabels[id] }))

  // Lanes by filters are typed by hand: dropping them asks first
  function confirmDropLanes (apply: () => void): void {
    if (board.swimlanes.length === 0) {
      apply()
      return
    }
    showPopup(
      MessageBox,
      {
        label: tracker.string.SwimlanesNone,
        message: tracker.string.SwimlanesRemoveConfirm,
        action: async () => {
          apply()
        }
      },
      undefined,
      (removed) => {
        // A cancelled removal keeps the lanes: the radio goes back to them
        if (removed !== true) pending = undefined
      }
    )
  }

  async function setLanes (mode: LaneMode): Promise<void> {
    pending = mode
    if (mode === 'none') {
      confirmDropLanes(() => {
        void onChange({ swimlanes: [], swimLaneBy: null })
      })
    } else if (mode === 'field') {
      confirmDropLanes(() => {
        void onChange({ swimlanes: [], swimLaneBy: board.swimLaneBy ?? boardSwimLaneFields[0] })
      })
    } else if (board.swimlanes.length === 0) {
      const title = await translate(tracker.string.NewSwimlane, {})
      const restTitle = await translate(tracker.string.AllOthers, {})
      void onChange({
        swimLaneBy: null,
        swimlanes: [
          { id: generateId(), title, condition: '' },
          { id: generateId(), title: restTitle, condition: '' }
        ]
      })
    }
  }

  // Quick filters shown above the board and the color source: display only until the board has fields for them
  let offBoard = new Set<string>()
  const colorByItems = [{ id: 'rules', label: tracker.string.ColorByRules }]

  const shown = (field: CardField): boolean => isCardFieldVisible(board.cardFields, field)
  const lookup = { attachedTo: tracker.class.Issue, _id: { subIssues: tracker.class.Issue } } as const

  // Live ids of the board issues that fit each condition, as the board itself matches them
  let matchesVersion = 0
  const laneMatches = new ConditionMatches(() => {
    matchesVersion++
  })
  const colorMatches = new ConditionMatches(() => {
    matchesVersion++
  })
  onDestroy(() => {
    laneMatches.destroy()
    colorMatches.destroy()
  })

  async function syncMatches (
    matches: ConditionMatches,
    rules: Array<{ id: string, condition: string }>
  ): Promise<void> {
    await matches.sync(client, rules, await boardQuery(client, board, new Set(), () => {}))
  }
  $: if (kind === 'colorRules') {
    void syncMatches(
      colorMatches,
      board.colorRules.map((r) => ({ id: r.id, condition: r.condition }))
    )
  } else if (boardNext && kind === 'swimlanes') {
    void syncMatches(
      laneMatches,
      board.swimlanes.slice(0, -1).map((l) => ({ id: l.id, condition: l.condition }))
    )
  }

  let samples = new Map<string, WithLookup<Issue> | undefined>()
  let sampleSeq = 0
  async function loadSamples (_version: number): Promise<void> {
    if (!colorMatches.ready) return
    const seq = ++sampleSeq
    const ids = pickRuleSamples(board.colorRules, (r) => colorMatches.ids.get(r))
    const found = await client.findAll(
      tracker.class.Issue,
      { _id: { $in: [...ids.values()].filter((id): id is Ref<Issue> => id !== undefined) as Array<Ref<Issue>> } },
      { lookup }
    )
    if (seq === sampleSeq) samples = new Map([...ids].map(([rule, id]) => [rule, found.find((i) => i._id === id)]))
  }
  $: if (kind === 'colorRules') void loadSamples(matchesVersion)

  // The issue the lane example walks through: one that fits the first lane, else any issue of the board
  let laneSample: WithLookup<Issue> | undefined
  let laneSeq = 0
  async function loadLaneSample (_version: number): Promise<void> {
    if (!laneMatches.ready) return
    const seq = ++laneSeq
    const first = laneMatches.ids.get(board.swimlanes[0]?.id ?? '')
    const id = first !== undefined ? [...first][0] : undefined
    const query = id !== undefined ? { _id: id as Ref<Issue> } : await boardQuery(client, board, new Set(), () => {})
    const found = await client.findOne(tracker.class.Issue, query, { lookup })
    if (seq === laneSeq) laneSample = found
  }
  $: if (boardNext && kind === 'swimlanes' && board.swimlanes.length > 0) void loadLaneSample(matchesVersion)

  function laneIndexOf (issue: Issue | undefined, matchesVersion: number): number {
    if (issue === undefined || matchesVersion < 0) return -1
    const lane = pickSwimlane(board.swimlanes, (l) => laneMatches.has(l.id, issue._id))
    return board.swimlanes.findIndex((l) => l.id === lane?.id)
  }
  $: laneFitIndex = laneIndexOf(laneSample, matchesVersion)

  $: title = {
    swimlanes: tracker.string.BoardTabSwimlanes,
    quickFilters: tracker.string.BoardTabQuickFilters,
    colorRules: tracker.string.BoardTabColorRules
  }[kind]
  $: hint = {
    swimlanes: tracker.string.BoardSwimlanesHint,
    quickFilters: tracker.string.BoardQuickFiltersHint,
    colorRules: tracker.string.BoardColorRulesHint
  }[kind]
  $: addLabel = {
    swimlanes: tracker.string.AddSwimlane,
    quickFilters: tracker.string.AddQuickFilter,
    colorRules: tracker.string.AddColorRule
  }[kind]
  $: lead = {
    swimlanes: tracker.string.Swimlane,
    quickFilters: tracker.string.RuleTitle,
    colorRules: tracker.string.RuleColor
  }[kind]
</script>

<ProjectSettingsSection {title} description={hint} wide>
  <div class="tab" data-id={`boardSettings-${kind}`}>
    {#if kind === 'swimlanes'}
      <div class="radios" role="radiogroup">
        <Radio
          value="none"
          group={lanes}
          name="board-swimlanes"
          label={tracker.string.SwimlanesNone}
          data-id="boardSwimlanesNone"
          on:change={() => {
            void setLanes('none')
          }}
        />
        <div class="radio-field">
          <Radio
            value="field"
            group={lanes}
            name="board-swimlanes"
            label={tracker.string.SwimlanesByField}
            data-id="boardSwimlanesByField"
            on:change={() => {
              void setLanes('field')
            }}
          />
          <!-- Always in its place, enabled only for lanes by a field -->
          <Dropdown
            data-id="boardSwimlanesField"
            kind="secondary"
            items={laneFieldItems}
            selected={board.swimLaneBy ?? boardSwimLaneFields[0]}
            disabled={board.swimLaneBy == null}
            on:selected={(e) => {
              if (e.detail !== board.swimLaneBy) void onChange({ swimLaneBy: e.detail })
            }}
          />
        </div>
        <!-- tracker-board-next: lanes by filters; a board that has them still shows the radio to leave them -->
        {#if boardNext || board.swimlanes.length > 0}
          <div class="radio">
            <Radio
              value="filters"
              group={lanes}
              name="board-swimlanes"
              label={tracker.string.SwimlanesByFilters}
              data-id="boardSwimlanesByFilters"
              on:change={() => {
                void setLanes('filters')
              }}
            />
            <span class="radio-hint"><Label label={tracker.string.SwimlanesByFiltersHint} /></span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- tracker-board-next: the board has no field for what its card color comes from -->
    {#if kind === 'colorRules' && boardNext}
      <SettingRow kind="column" label={tracker.string.ColorBy} hint={tracker.string.ColorByHint}>
        <Dropdown data-id="boardColorBy" kind="secondary" items={colorByItems} selected="rules" />
      </SettingRow>
    {/if}

    {#if rules.length > 0}
      <div class="table" class:lanes={kind === 'swimlanes'} class:colors={kind === 'colorRules'}>
        <div class="row head">
          <div class="cell lead"><Label label={lead} /></div>
          <div class="cell condition"><Label label={tracker.string.BoardCondition} /></div>
          <!-- tracker-board-next: BoardQuickFilter has no field for showing it above the board -->
          {#if kind === 'quickFilters' && boardNext}
            <div class="cell toggle"><Label label={tracker.string.QuickFilterOnBoard} /></div>
          {/if}
          <div class="cell action" />
        </div>
        {#each editable as rule, i (rule.id)}
          <div
            class="row"
            class:over={over === i && dragged !== undefined && dragged !== i}
            data-id="boardRule"
            role="listitem"
            on:dragover|preventDefault={() => {
              over = i
            }}
            on:drop|preventDefault={() => {
              drop(i)
            }}
          >
            <div class="cell lead">
              <span
                class="grip"
                draggable="true"
                role="button"
                tabindex="-1"
                on:dragstart={(e) => {
                  e.dataTransfer?.setData('text/plain', rule.id)
                  dragged = i
                }}
                on:dragend={() => {
                  dragged = undefined
                  over = undefined
                }}
              >
                <Icon icon={ui.icon.GripVertical} size="small" />
              </span>
              {#if isTitled(rule)}
                <input
                  id={`rule-name-${rule.id}`}
                  class="name"
                  value={rule.title}
                  placeholder={rule.title}
                  on:change={(e) => {
                    setTitle(rule, e.currentTarget.value)
                  }}
                />
              {:else}
                <button
                  class="color"
                  data-id="boardRuleColor"
                  style:background-color={getPlatformColorDef(rule.color, $themeStore.dark).color}
                  on:click={(e) => {
                    pickColor(e, rule)
                  }}
                />
              {/if}
            </div>
            <div class="cell condition">
              <FilterConditions
                _class={tracker.class.Issue}
                value={rule.condition}
                removable
                hiddenKeys={['space']}
                on:change={(e) => {
                  patch(rule.id, { condition: e.detail })
                }}
              />
            </div>
            {#if kind === 'quickFilters' && boardNext}
              <div class="cell toggle">
                <Toggle
                  kind="brand"
                  checked={!offBoard.has(rule.id)}
                  aria-labelledby={`rule-name-${rule.id}`}
                  data-id="boardQuickFilterOnBoard"
                  on:change={(e) => {
                    offBoard = new Set([...offBoard].filter((id) => id !== rule.id).concat(e.detail ? [] : [rule.id]))
                  }}
                />
              </div>
            {/if}
            <div class="cell action">
              <IconButton
                icon={ui.icon.Trash}
                kind="ghost"
                size="extra-small"
                tooltip={{ label: tracker.string.Delete }}
                data-id="boardRemoveRule"
                on:click={() => {
                  remove(rule.id)
                }}
              />
            </div>
          </div>
        {/each}
        {#if rest !== undefined}
          <div class="row" data-id="boardRestLane">
            <div class="cell lead">
              <span class="grip disabled"><Icon icon={ui.icon.GripVertical} size="small" /></span>
              <input
                class="name"
                value={rest.title}
                placeholder={rest.title}
                on:change={(e) => {
                  if (rest !== undefined) setTitle(rest, e.currentTarget.value)
                }}
              />
            </div>
            <div class="cell condition note"><Label label={tracker.string.AllOthersHint} /></div>
            <div class="cell action" />
          </div>
        {/if}
      </div>
    {/if}

    <!-- tracker-board-next: adding a lane makes lanes by filters; without the flag only a board that has them adds more -->
    <div
      class="actions"
      class:hidden={kind === 'swimlanes' && (lanes === 'field' || (!boardNext && lanes !== 'filters'))}
    >
      <Button
        kind="secondary"
        size="small"
        icon={ui.icon.Plus}
        label={addLabel}
        data-id="boardAddRule"
        on:click={add}
      />
    </div>

    {#if kind === 'swimlanes' && boardNext && laneSample !== undefined && board.swimlanes.length > 0}
      <!-- tracker-board-next: same logic as the board, shown with the lanes of the board -->
      <div class="lane-example" data-id="boardLaneExample">
        <span class="lane-example-title">
          <Label
            label={tracker.string.LaneExampleTitle}
            params={{ issue: `${laneSample.identifier} «${laneSample.title}»` }}
          />
        </span>
        {#each board.swimlanes as lane, i (lane.id)}
          <span class:dim={i > laneFitIndex}>
            <Label
              label={i < laneFitIndex
                ? tracker.string.LaneExampleMiss
                : i === laneFitIndex
                  ? i === board.swimlanes.length - 1
                    ? tracker.string.LaneExampleRest
                    : tracker.string.LaneExampleFits
                  : tracker.string.LaneExampleSkipped}
              params={{ n: i + 1, lane: lane.title }}
            />
          </span>
        {/each}
      </div>
    {/if}

    {#if kind === 'colorRules' && board.colorRules.length > 0}
      <span class="example-caption"><Label label={tracker.string.ColorExample} /></span>
      <div class="samples" data-id="boardColorExample">
        {#each board.colorRules as rule (rule.id)}
          {@const sample = samples.get(rule.id)}
          {@const accent = getPlatformColorDef(rule.color, $themeStore.dark).color}
          {#if sample !== undefined}
            <div class="sample" data-id="boardColorSample">
              <IssueKanbanCard issue={sample} density={board.density} {shown} space={sample.space} {accent} preview />
            </div>
          {:else}
            <div class="sample none" data-id="boardColorSampleNone" style:border-color={accent}>
              <Label label={tracker.string.ColorExampleNone} />
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .tab {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    width: 100%;
  }
  .radios {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .radio {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-0_25);
  }
  .radio-field {
    display: flex;
    align-items: center;
    gap: var(--spacing-1_5);
  }
  .radio-hint {
    padding-left: calc(1rem + var(--spacing-1));
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
  }
  .actions.hidden {
    display: none;
  }
  .table {
    align-self: stretch;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--theme-divider-color);

    &:first-child {
      border-top: none;
    }
    &.head {
      height: 2.25rem;
      background-color: var(--theme-list-row-color);
      border-radius: 0.5rem 0.5rem 0 0;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--theme-dark-color);
    }
    &.over {
      box-shadow: inset 0 2px 0 var(--primary-button-default);
    }
  }
  .cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-sizing: border-box;
    min-height: 2.75rem;
    padding: 0.375rem 0.75rem;

    .head & {
      min-height: 0;
    }
    &.lead {
      flex-shrink: 0;
      width: 12.5rem;
    }
    &.condition {
      flex-grow: 1;
      min-width: 0;

      // A filter chip keeps a bottom margin for the filter bar; in a table row it only adds height
      :global(.filter-section) {
        margin-bottom: 0;
      }
    }
    &.toggle {
      flex-shrink: 0;
      width: 6.875rem;
    }
    &.action {
      flex-shrink: 0;
      justify-content: center;
      width: 3.5rem;
    }
    &.note {
      font-size: 0.8125rem;
      color: var(--theme-darker-color);
    }
  }
  .lanes .cell.lead {
    width: 15rem;
  }
  .colors .cell.lead {
    width: 5.625rem;
  }
  .grip {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--theme-darker-color);
    cursor: grab;

    &.disabled {
      color: var(--theme-trans-color);
      cursor: default;
    }
  }
  .name {
    flex: 1;
    min-width: 0;
    height: 1.75rem;
    padding: 0 0.375rem;
    margin-left: -0.375rem;
    font: inherit;
    font-weight: 500;
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
  .color {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    cursor: pointer;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.25rem;
  }
  .lane-example {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    box-sizing: border-box;
    width: 45rem;
    padding: 0.875rem 1rem;
    font-size: 0.8125rem;
    background-color: var(--theme-list-row-color);
    border-radius: 0.5rem;

    .dim {
      color: var(--theme-darker-color);
    }
  }
  .lane-example-title {
    font-weight: 600;
  }
  .example-caption {
    margin-bottom: -0.5rem;
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
  .samples {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  // The frame of a board card (KanbanRow); the card inside is a sample
  .sample {
    box-sizing: border-box;
    width: 16.5rem;
    pointer-events: none;
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

    &.none {
      display: flex;
      align-items: center;
      padding: 0.75rem 0.875rem;
      font-size: 0.75rem;
      color: var(--theme-darker-color);
      border-width: 2px;
      border-style: dashed;
      box-shadow: none;
    }
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
