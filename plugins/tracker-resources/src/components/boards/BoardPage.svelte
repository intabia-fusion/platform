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
  import type { Ref, Space } from '@hcengineering/core'
  import { getCurrentAccount } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import type { Board } from '@hcengineering/tracker'
  import { canEditBoard, isBoardAvailable, pickDefaultBoard } from '@hcengineering/tracker'
  import { BlankView, resolvedLocationStore } from '@hcengineering/ui'
  import { boardLocation } from '../../boards'
  import tracker from '../../plugin'
  import BoardSettings from './BoardSettings.svelte'
  import BoardSwitcher from './BoardSwitcher.svelte'
  import BoardView from './BoardView.svelte'

  // Props the workbench gives to every special view
  export let currentSpace: Ref<Space> | undefined = undefined
  void currentSpace

  const account = getCurrentAccount().uuid

  let boards: Board[] = []
  let loaded = false
  let pinned = new Set<Ref<Board>>()

  createQuery().query(tracker.class.Board, {}, (res) => {
    boards = res.filter((b) => isBoardAvailable(b, account))
    loaded = true
  })
  createQuery().query(tracker.class.BoardPreference, {}, (res) => {
    pinned = new Set(res.map((p) => p.attachedTo))
  })

  $: boardId = $resolvedLocationStore.path[4] as Ref<Board> | undefined
  $: settingsOpen = $resolvedLocationStore.path[5] === 'settings'
  $: board = boards.find((b) => b._id === boardId)

  // Without a board in the path the first one the user can see opens.
  // The page sees the location of the next view before it unmounts: only `boards` itself redirects.
  $: onBoards = $resolvedLocationStore.path[3] === 'boards'
  $: if (loaded && onBoards && boardId === undefined) {
    const first = pickDefaultBoard(boards, undefined, account, pinned)
    if (first !== undefined) boardLocation(first._id)
  }

  $: canEdit = board !== undefined && canEditBoard(board, account)
</script>

{#if board !== undefined && settingsOpen}
  <BoardSettings {board} {boards} {canEdit} />
{:else if board !== undefined}
  <BoardView {board} {canEdit}>
    <svelte:fragment slot="label_selector">
      <BoardSwitcher {board} {boards} {pinned} {canEdit} />
    </svelte:fragment>
  </BoardView>
{:else if loaded}
  <div class="flex-col-center flex-grow">
    <BlankView
      icon={tracker.icon.Issues}
      header={boardId === undefined ? tracker.string.NoBoards : tracker.string.BoardNotFound}
    />
  </div>
{/if}
