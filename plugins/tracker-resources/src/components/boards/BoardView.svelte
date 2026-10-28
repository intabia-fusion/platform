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
  import type { DocumentQuery, Ref, Status } from '@hcengineering/core'
  import { mergeQueries } from '@hcengineering/core'
  import { createQuery, getClient, isDisabled } from '@hcengineering/presentation'
  import { getStates } from '@hcengineering/task'
  import { typeStore } from '@hcengineering/task-resources'
  import type { Board, Issue, Project } from '@hcengineering/tracker'
  import { statusesWithoutColumn } from '@hcengineering/tracker'
  import { translate } from '@hcengineering/platform'
  import ui, { Label, getCurrentResolvedLocation, navigate, showPopup, themeStore, tooltip } from '@hcengineering/ui'
  import { Button, Slider } from '@hcengineering/ui/kit'
  import view, { type SliderViewOption, type ViewOptions, type Viewlet } from '@hcengineering/view'
  import {
    buildFilterKey,
    isSliderType,
    parseFilters,
    setFilters,
    setViewOptions,
    statusStore
  } from '@hcengineering/view-resources'
  import { fullscreenStore } from '@hcengineering/workbench-resources'
  import { onDestroy } from 'svelte'
  import { boardLocation, boardQuery } from '../../boards'
  import tracker from '../../plugin'
  import IssuesView from '../issues/IssuesView.svelte'
  import BoardQuickFilters from './BoardQuickFilters.svelte'
  import BoardUncoveredPopup from './BoardUncoveredPopup.svelte'

  // Board issues with the board header: no title, the navigator shows the board; its settings are in the header menu
  export let board: Board
  export let canEdit: boolean

  const client = getClient()
  // tracker-board-next: the density slider is not ready for users yet
  const boardNext = !isDisabled('tracker-board-next')

  let activeQuickFilters = new Set<string>()
  $: {
    const known = new Set(board.quickFilters.map((q) => q.id))
    activeQuickFilters = new Set([...activeQuickFilters].filter((id) => known.has(id)))
  }

  function toggleQuickFilter (id: string): void {
    const next = new Set(activeQuickFilters)
    if (!next.delete(id)) next.add(id)
    activeQuickFilters = next
  }

  let query: DocumentQuery<Issue> | undefined
  let querySeq = 0
  async function buildQuery (board: Board, active: ReadonlySet<string>): Promise<void> {
    const seq = ++querySeq
    const result = await boardQuery(client, board, active, () => {
      void buildQuery(board, active)
    })
    if (seq === querySeq) query = result
  }
  $: void buildQuery(board, activeQuickFilters)

  // Project of each status of the board projects, for the status icon color
  // Archived projects stay on the board; the store of active projects drops them
  let boardProjects: Project[] = []
  let projectsAnsweredFor = ''
  const projectsQuery = createQuery()
  $: projectsQuery.query(
    tracker.class.Project,
    { _id: { $in: board.projects } },
    (res) => {
      boardProjects = res
      projectsAnsweredFor = board.projects.join()
    },
    { showArchived: true }
  )

  // A project the board stores but the query does not return is hidden from the user; an archived one is returned
  let unavailableNames: string[] = []
  $: unavailableCount =
    projectsAnsweredFor === board.projects.join()
      ? board.projects.filter((id) => boardProjects.find((p) => p._id === id)?.archived !== false).length
      : 0
  $: void unavailableLabels(board.projects, boardProjects, projectsAnsweredFor, $themeStore.language).then((res) => {
    unavailableNames = res
  })

  async function unavailableLabels (
    ids: Array<Ref<Project>>,
    found: Project[],
    answered: string,
    lang: string
  ): Promise<string[]> {
    if (answered !== ids.join()) return []
    const names: string[] = []
    for (const id of ids) {
      const project = found.find((p) => p._id === id)
      if (project === undefined) names.push(await translate(tracker.string.ProjectHidden, {}, lang))
      else if (project.archived) {
        names.push(await translate(tracker.string.ProjectArchived, { identifier: project.identifier }, lang))
      }
    }
    return names
  }

  let statusProjects = new Map<Ref<Status>, Ref<Project>>()
  $: {
    const result = new Map<Ref<Status>, Ref<Project>>()
    for (const id of board.projects) {
      const project = boardProjects.find((p) => p._id === id)
      for (const s of getStates(project, $typeStore, $statusStore.byId)) {
        if (!result.has(s._id)) result.set(s._id, id)
      }
    }
    statusProjects = result
  }

  // Open statuses of the board projects that no column lists: their issues are not on the board
  $: uncovered = statusesWithoutColumn(
    board.columns,
    [...statusProjects.keys()].map((id) => $statusStore.byId.get(id)).filter((s): s is Status => s !== undefined)
  )

  const uncoveredQuery = createQuery()
  let hiddenByStatus = new Map<Ref<Status>, number>()
  $: if (query !== undefined && uncovered.length > 0) {
    uncoveredQuery.query(
      tracker.class.Issue,
      mergeQueries(query, { status: { $in: uncovered.map((s) => s._id) } }),
      (res) => {
        const counts = new Map<Ref<Status>, number>()
        for (const issue of res) counts.set(issue.status, (counts.get(issue.status) ?? 0) + 1)
        hiddenByStatus = counts
      },
      { projection: { _id: 1, status: 1 } }
    )
  } else {
    uncoveredQuery.unsubscribe()
    hiddenByStatus = new Map()
  }
  $: hiddenCount = [...hiddenByStatus.values()].reduce((sum, n) => sum + n, 0)

  // The board scope narrowed to the statuses without a column, in the list of all issues
  function showUncoveredIssues (board: Board, statuses: Status[]): void {
    const hierarchy = client.getHierarchy()
    const filters = parseFilters(board.filter)
    const spaceKey = buildFilterKey(
      hierarchy,
      tracker.class.Issue,
      'space',
      hierarchy.getAttribute(tracker.class.Issue, 'space')
    )
    // Project and status filters store their values the way ValueFilter and StatusFilter write them
    if (spaceKey !== undefined) {
      filters.push({
        key: spaceKey,
        value: board.projects.map((id) => [id, [id]]),
        index: 1,
        modes: [view.filter.FilterValueIn, view.filter.FilterValueNin],
        mode: view.filter.FilterValueIn
      })
    }
    const statusKey = buildFilterKey(
      hierarchy,
      tracker.class.Issue,
      'status',
      hierarchy.getAttribute(tracker.class.Issue, 'status')
    )
    if (statusKey !== undefined) {
      filters.push({
        key: statusKey,
        value: statuses.map((s) => s._id),
        index: 2,
        modes: [view.filter.FilterObjectIn, view.filter.FilterObjectNin],
        mode: view.filter.FilterObjectIn
      })
    }
    const loc = getCurrentResolvedLocation()
    loc.path[3] = 'all-issues'
    loc.path.length = 4
    loc.query = undefined
    loc.fragment = undefined
    navigate(loc)
    setFilters(filters)
  }

  function openUncovered (ev: MouseEvent): void {
    const current = board
    const statuses = uncovered
    showPopup(
      BoardUncoveredPopup,
      {
        statuses: statuses.map((status) => ({
          status,
          project: statusProjects.get(status._id),
          projectType: boardProjects.find((p) => p._id === statusProjects.get(status._id))?.type,
          count: hiddenByStatus.get(status._id) ?? 0
        })),
        canEdit
      },
      ev.currentTarget as HTMLElement,
      (action: 'show' | 'add' | undefined) => {
        if (action === 'show') showUncoveredIssues(current, statuses)
        else if (action === 'add') boardLocation(current._id, true, 'columns')
      }
    )
  }

  // Other sections know nothing of the board mode: leaving the board brings the panels back
  onDestroy(() => {
    fullscreenStore.set(false)
  })

  // The density option of the kanban view options, shown in the board header as a slider
  function densityOf (viewlet: Viewlet | undefined): SliderViewOption | undefined {
    const option = viewlet?.viewOptions?.other.find((o) => o.key === 'density')
    return option !== undefined && isSliderType(option) ? option : undefined
  }

  function setDensity (viewlet: Viewlet, viewOptions: ViewOptions, id: string): void {
    setViewOptions(viewlet, { ...viewOptions, density: id })
  }
</script>

{#if query !== undefined}
  <IssuesView {query} {board} space={undefined}>
    <svelte:fragment slot="board_actions" let:viewlet let:viewOptions>
      {#if uncovered.length > 0}
        <button type="button" class="uncovered" data-id="boardUncovered" on:click={openUncovered}>
          <svg class="uncovered-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5l6 10.5H2z" />
            <path d="M8 6.5v3M8 11v.3" />
          </svg>
          <Label
            label={tracker.string.StatusesWithoutColumn}
            params={{ statuses: uncovered.length, issues: hiddenCount }}
          />
        </button>
      {/if}
      {#if unavailableCount > 0}
        <span
          class="uncovered"
          data-id="boardUnavailableProjects"
          use:tooltip={{
            label: tracker.string.ProjectsUnavailableHint,
            props: { projects: unavailableNames.join(', ') }
          }}
        >
          <svg class="uncovered-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 2.5l6 10.5H2z" />
            <path d="M8 6.5v3M8 11v.3" />
          </svg>
          <Label label={tracker.string.ProjectsUnavailable} params={{ count: unavailableCount }} />
        </span>
      {/if}
      {@const density = boardNext ? densityOf(viewlet) : undefined}
      {#if density !== undefined && viewlet !== undefined && viewOptions !== undefined}
        {@const index = density.values.findIndex((v) => v.id === (viewOptions.density ?? density.defaultValue))}
        <div class="density" data-id="boardDensity">
          <span class="density-caption" id="boardDensityLabel">
            <Label label={index >= 0 ? density.values[index].label : (density.defaultLabel ?? density.label)} />
          </span>
          <Slider
            value={Math.max(index, 0)}
            min={0}
            max={density.values.length - 1}
            step={1}
            size="small"
            aria-labelledby="boardDensityLabel"
            on:change={(e) => {
              setDensity(viewlet, viewOptions, density.values[e.detail].id)
            }}
          />
        </div>
      {/if}
      <Button
        icon={$fullscreenStore ? ui.icon.ArrowsIn : ui.icon.ArrowsOut}
        iconSize="small"
        kind="ghost"
        size="medium"
        inheritColor
        tooltip={{
          label: $fullscreenStore ? tracker.string.BoardExitFullscreen : tracker.string.BoardFullscreen,
          direction: 'bottom-end',
          noArrow: true
        }}
        data-id="boardFullscreenButton"
        on:click={() => {
          fullscreenStore.update((on) => !on)
        }}
      />
    </svelte:fragment>
    <svelte:fragment slot="afterSearch">
      <BoardQuickFilters
        {board}
        active={activeQuickFilters}
        on:toggle={(e) => {
          toggleQuickFilter(e.detail)
        }}
      />
    </svelte:fragment>
  </IssuesView>
{/if}

<style lang="scss">
  // Colors of the warning notice of the accepted Storybook screens (dev/design/screens/current/tracker-boards.js)
  .uncovered {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-1);
    box-sizing: border-box;
    height: 1.875rem;
    padding: 0 0.625rem;
    font: inherit;
    font-size: 0.75rem;
    white-space: nowrap;
    color: #8a5300;
    background-color: rgba(252, 197, 0, 0.12);
    border: 1px solid rgba(252, 197, 0, 0.4);
    border-radius: 0.875rem;
    cursor: pointer;

    &:hover {
      background-color: rgba(252, 197, 0, 0.2);
    }
    &[data-id='boardUnavailableProjects'] {
      cursor: default;
    }
    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }
    // The brown text of the light theme is unreadable on a dark background
    :global(.theme-dark) & {
      color: var(--theme-warning-color);
    }
  }
  .uncovered-icon {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .density {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 12rem;
  }
  .density-caption {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
    white-space: nowrap;
  }
</style>
