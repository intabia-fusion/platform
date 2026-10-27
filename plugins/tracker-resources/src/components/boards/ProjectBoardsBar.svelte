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
  import { getCurrentAccount, type Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, translateCB } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { canEditBoard, isBoardAvailable, sortBoards, type Board, type Project } from '@hcengineering/tracker'
  import ui, {
    Icon,
    resizeObserver,
    showPopup,
    themeStore,
    type PopupResult
  } from '@hcengineering/ui'
  import {
    Button,
    IconButton,
    Menu,
    SegmentedControl,
    type MenuItem,
    type SegmentedControlItem
  } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { boardLocation, projectBoardLocation, togglePinned } from '../../boards'
  import tracker from '../../plugin'
  import { activeProjects } from '../../utils'
  import BoardMenuRow from './BoardMenuRow.svelte'
  import { boardMenuItems } from './boardMenu'
  import { newBoard } from './actions'

  // Project issues header: after the viewlet switcher, the project boards the user put on the bar
  // (pinned ones), then the menu of all project boards; boards that do not fit go to a menu
  export let project: Ref<Project>
  // The board shown in place of the project issues view
  export let selected: Ref<Board> | undefined = undefined

  const client = getClient()
  const account = getCurrentAccount().uuid

  let boards: Board[] = []
  let pinned = new Set<Ref<Board>>()
  const boardsQuery = createQuery()
  $: boardsQuery.query(tracker.class.Board, { projects: project }, (res) => {
    boards = res.filter((b) => isBoardAvailable(b, account))
  })
  createQuery().query(tracker.class.BoardPreference, {}, (res) => {
    pinned = new Set(res.map((p) => p.attachedTo))
  })

  let ariaLabel = ''
  $: translateCB(tracker.string.TaskBoards, {}, $themeStore.language, (res) => {
    ariaLabel = res
  })

  // Projects of a board shared by several projects
  function identifiers (b: Board, projects: Map<Ref<Project>, Project>): string | undefined {
    if (b.projects.length < 2) return undefined
    const ids = b.projects.map((id) => projects.get(id)?.identifier).filter((it) => it !== undefined)
    return ids.length > 0 ? ids.join(' · ') : undefined
  }

  // The open board stays in the row while it is open, even when it is not on the bar
  $: shown = sortBoards(
    boards.filter((b) => pinned.has(b._id) || b._id === selected),
    pinned
  )
  $: segments = shown.map((b) => {
    const ids = identifiers(b, $activeProjects)
    return {
      id: b._id,
      label: getEmbeddedLabel(b.title),
      icon: task.icon.Kanban,
      badge: ids !== undefined ? getEmbeddedLabel(ids) : undefined
    }
  }) satisfies SegmentedControlItem[]

  let row: HTMLElement | undefined
  let measure: HTMLElement | undefined
  let plus: HTMLButtonElement | undefined
  let visible = Number.MAX_SAFE_INTEGER

  // The hidden copy holds every segment: the widths of the first k
  // decide how many fit next to the buttons
  function fit (): void {
    if (row === undefined || measure === undefined || plus === undefined) return
    const control = measure.querySelector<HTMLElement>('.segmented-control')
    const segs = Array.from(measure.querySelectorAll<HTMLElement>('[role="radio"]'))
    if (control === null || segs.length === 0 || row.clientWidth === 0) return
    const pad = segs[0].offsetLeft - control.offsetLeft
    const controlWidth = (k: number): number =>
      segs[k - 1].offsetLeft + segs[k - 1].offsetWidth - control.offsetLeft + pad
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0
    const button = gap + plus.offsetWidth
    if (controlWidth(segs.length) + button <= row.clientWidth) {
      visible = segs.length
      return
    }
    let k = segs.length - 1
    while (k > 0 && controlWidth(k) + 2 * button > row.clientWidth) k--
    visible = k
  }

  $: shownSegments = segments.slice(0, visible)
  $: hidden = shown.slice(visible)
  // A selected board that did not fit is marked on the menu and its button
  $: hiddenSelected = hidden.some((b) => b._id === selected)

  function openBoard (id: string): void {
    if (id !== selected) projectBoardLocation(id as Ref<Board>)
  }

  let opened = false
  let chevron: HTMLButtonElement | undefined

  function openMore (): void {
    if (opened) return
    opened = true
    const items: MenuItem[] = hidden.map((b, i) => {
      const label = getEmbeddedLabel(b.title)
      const ids = identifiers(b, $activeProjects)
      return {
        id: b._id,
        label,
        icon: task.icon.Kanban,
        heading: i === 0 ? tracker.string.MoreProjectBoards : undefined,
        component: BoardMenuRow,
        componentProps: { label, hint: ids !== undefined ? getEmbeddedLabel(ids) : undefined }
      }
    })
    showPopup(Menu, { items, selected, minWidth: '18.75rem' }, chevron, (id: string | undefined | null) => {
      opened = false
      if (id !== undefined && id !== null) openBoard(id)
    })
  }

  const CREATE = 'create'
  const SETTINGS = 'settings'

  $: selectedBoard = boards.find((b) => b._id === selected)

  // Every board of the project, checked when it is on the bar; a click puts it on the bar or takes it off
  function menuItems (
    boards: Board[],
    pinned: ReadonlySet<Ref<Board>>,
    current: Board | undefined,
    projects: Map<Ref<Project>, Project>
  ): MenuItem[] {
    const result = boardMenuItems(boards, pinned, projects, (b) =>
      pinned.has(b._id) ? tracker.string.RemoveFromPanel : tracker.string.AddToPanel
    )
    result.push({
      id: CREATE,
      label: tracker.string.CreateBoard,
      icon: ui.icon.Plus,
      divider: result.length > 0 ? true : undefined,
      component: BoardMenuRow,
      componentProps: { label: tracker.string.CreateBoard, accent: true }
    })
    if (current !== undefined && canEditBoard(current, account)) {
      result.push({ id: SETTINGS, label: tracker.string.BoardSettings, icon: view.icon.Setting })
    }
    return result
  }

  let menu: PopupResult | undefined
  $: menu?.update({ items: menuItems(boards, pinned, selectedBoard, $activeProjects), selected: [...pinned] })

  function openMenu (): void {
    if (menu !== undefined || plus === undefined) return
    // `onSelect` keeps the menu open while boards go on and off the bar
    const onSelect = (id: string): void => {
      if (id === CREATE || id === SETTINGS) {
        menu?.close()
        if (id === CREATE) void newBoard(client, project, true)
        else if (selected !== undefined) boardLocation(selected, true)
        return
      }
      void togglePinned(client, id as Ref<Board>)
    }
    const items = menuItems(boards, pinned, selectedBoard, $activeProjects)
    menu = showPopup(Menu, { items, selected: [...pinned], onSelect, minWidth: '20rem' }, plus, () => {
      menu = undefined
    })
  }
</script>

<div class="bar" data-id="projectBoardsBar" bind:this={row} use:resizeObserver={fit}>
  {#if shownSegments.length > 0}
    <SegmentedControl
      items={shownSegments}
      {selected}
      aria-label={ariaLabel}
      data-id="projectBoards"
      on:select={(e) => {
        openBoard(e.detail)
      }}
    />
  {/if}
  {#if hidden.length > 0}
    <IconButton
      bind:element={chevron}
      icon={ui.icon.ChevronDown}
      kind="ghost"
      size="small"
      hasMenu
      pressed={opened}
      selected={hiddenSelected}
      tooltip={{ label: tracker.string.MoreProjectBoards }}
      data-id="projectBoardsMore"
      on:click={openMore}
    />
  {/if}
  <span class="menu">
    <Button
      bind:element={plus}
      kind="ghost"
      size="small"
      icon={task.icon.Kanban}
      hasMenu
      pressed={menu !== undefined}
      inheritColor
      tooltip={{ label: tracker.string.ProjectBoards }}
      data-id="projectBoardsMenu"
      on:click={openMenu}
    >
      <span class="chevron"><Icon icon={ui.icon.ChevronDown} size="small" /></span>
    </Button>
  </span>
  <div class="measure" aria-hidden="true">
    <div bind:this={measure} class="measure-content" use:resizeObserver={fit}>
      <SegmentedControl items={segments} {selected} />
    </div>
  </div>
</div>

<style lang="scss">
  .bar {
    position: relative;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    gap: var(--spacing-0_5);
    min-width: 0;
  }
  // Zero-size and clipped, so the copy adds nothing to the header's scroll width
  .measure {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }
  .measure-content {
    width: max-content;
  }
  .menu {
    display: contents;
    color: var(--global-primary-TextColor);
  }
  .chevron {
    display: inline-flex;

    :global(svg) {
      width: 0.875rem;
      height: 0.875rem;
    }
  }
</style>
