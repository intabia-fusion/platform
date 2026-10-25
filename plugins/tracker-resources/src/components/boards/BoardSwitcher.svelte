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
  import type { Ref } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import type { Board, Project } from '@hcengineering/tracker'
  import { Icon, IconAdd, IconChevronDown, showPopup } from '@hcengineering/ui'
  import { Button, Menu, type MenuItem } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { boardLocation } from '../../boards'
  import tracker from '../../plugin'
  import { activeProjects } from '../../utils'
  import BoardMenuRow from './BoardMenuRow.svelte'
  import { boardMenuItems } from './boardMenu'
  import { newBoard } from './actions'

  export let board: Board
  export let boards: Board[]
  export let pinned: ReadonlySet<Ref<Board>>
  export let canEdit: boolean

  const client = getClient()

  const CREATE = 'create'
  const SETTINGS = 'settings'

  let opened = false

  function items (projects: Map<Ref<Project>, Project>): MenuItem[] {
    const result = boardMenuItems(boards, pinned, projects)
    result.push({
      id: CREATE,
      label: tracker.string.CreateBoard,
      icon: IconAdd,
      divider: result.length > 0 ? true : undefined,
      component: BoardMenuRow,
      componentProps: { label: tracker.string.CreateBoard, accent: true }
    })
    if (canEdit) result.push({ id: SETTINGS, label: tracker.string.BoardSettings, icon: view.icon.Setting })
    return result
  }

  function open (ev: MouseEvent): void {
    if (opened) return
    opened = true
    showPopup(
      Menu,
      { items: items($activeProjects), selected: board._id, minWidth: '20rem' },
      ev.currentTarget as HTMLElement,
      (id: string | undefined | null) => {
        opened = false
        if (id === undefined || id === null) return
        if (id === CREATE) void newBoard(client, board.projects[0])
        else if (id === SETTINGS) boardLocation(board._id, true)
        else boardLocation(id as Ref<Board>)
      }
    )
  }
</script>

<span class="switcher">
  <Button
    kind="ghost"
    size="small"
    icon={task.icon.Kanban}
    label={getEmbeddedLabel(board.title)}
    hasMenu
    pressed={opened}
    inheritColor
    data-id="boardSwitcher"
    on:click={open}
  >
    <span class="chevron"><Icon icon={IconChevronDown} size="small" /></span>
  </Button>
</span>

<style lang="scss">
  .switcher {
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
