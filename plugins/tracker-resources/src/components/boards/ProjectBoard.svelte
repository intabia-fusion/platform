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
  import { getCurrentAccount } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Board, Project } from '@hcengineering/tracker'
  import { canEditBoard, isBoardAvailable } from '@hcengineering/tracker'
  import { getCurrentResolvedLocation, navigate, resolvedLocationStore } from '@hcengineering/ui'
  import type { Viewlet } from '@hcengineering/view'
  import { setActiveViewletId } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import BoardSettings from './BoardSettings.svelte'
  import BoardView from './BoardView.svelte'
  import ProjectBoardsBar from './ProjectBoardsBar.svelte'

  // A board in place of the view of the project issues: tracker/<project>/issues/<board>[/settings]
  export let project: Ref<Project>

  const client = getClient()
  const account = getCurrentAccount().uuid

  let boards: Board[] = []
  let loaded = false
  createQuery().query(tracker.class.Board, {}, (res) => {
    boards = res.filter((b) => isBoardAvailable(b, account))
    loaded = true
  })

  $: boardId = $resolvedLocationStore.path[5] as Ref<Board> | undefined
  $: settingsOpen = $resolvedLocationStore.path[6] === 'settings'
  $: board = boards.find((b) => b._id === boardId)
  $: canEdit = board !== undefined && canEditBoard(board, account)

  // A hidden board, or one without this project, gives the project its own view back.
  // Settings may show another board: their board selector leads there.
  $: if (
    loaded &&
    boardId !== undefined &&
    (board === undefined || (!settingsOpen && !board.projects.includes(project)))
  ) {
    void leaveBoard(boardId, board)
  }

  async function leaveBoard (id: Ref<Board>, current: Board | undefined): Promise<void> {
    // The first answer of the query may come before a board just created: ask the server
    const found = current ?? (await client.findOne(tracker.class.Board, { _id: id }))
    if (found !== undefined && isBoardAvailable(found, account) && (settingsOpen || found.projects.includes(project))) { return }
    const loc = getCurrentResolvedLocation()
    if (loc.path[5] !== id) return
    loc.path.length = 5
    loc.query = undefined
    loc.fragment = undefined
    navigate(loc, true)
  }

  // The viewlet switcher goes on from the boards: a viewlet closes the board
  // and becomes the view of the project issues
  function openProjectView (viewlet: Viewlet): void {
    const loc = getCurrentResolvedLocation()
    loc.path.length = 5
    loc.query = undefined
    loc.fragment = undefined
    setActiveViewletId(viewlet._id, loc, true)
    navigate(loc)
  }
</script>

{#if board !== undefined && settingsOpen}
  <BoardSettings {board} {boards} {canEdit} />
{:else if board?.projects.includes(project) === true}
  <BoardView {board} {canEdit} onViewletPick={openProjectView}>
    <svelte:fragment slot="label_selector">
      <ProjectBoardsBar {project} selected={board._id} />
    </svelte:fragment>
  </BoardView>
{/if}
