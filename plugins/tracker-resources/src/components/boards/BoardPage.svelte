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
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Board } from '@hcengineering/tracker'
  import { canEditBoard, isBoardAvailable } from '@hcengineering/tracker'
  import { BlankView, Component, resolvedLocationStore } from '@hcengineering/ui'
  import workbench from '@hcengineering/workbench'
  import view from '@hcengineering/view'
  import { boardNavigationId, ensureBoardNavigation, reportBoardError } from '../../boards'
  import tracker from '../../plugin'
  import BoardSettings from './BoardSettings.svelte'
  import BoardView from './BoardView.svelte'

  // Props the workbench gives to every special view
  export let currentSpace: Ref<Space> | undefined = undefined
  void currentSpace

  const client = getClient()
  let navigationReady = false
  const account = getCurrentAccount().uuid

  let boards: Board[] = []
  let loaded = false
  let navigation = new Set<Ref<Board>>()

  createQuery().query(tracker.class.Board, {}, (res) => {
    boards = res.filter((b) => isBoardAvailable(b, account))
    loaded = true
    void ensureBoardNavigation(client, boards)
      .then(() => {
        navigationReady = true
      })
      .catch(reportBoardError)
  })
  createQuery().query(tracker.class.BoardNavigationPreference, { _id: boardNavigationId() }, (res) => {
    navigation = new Set(res[0]?.boards ?? [])
  })

  $: boardId = $resolvedLocationStore.path[4] as Ref<Board> | undefined
  $: settingsOpen = $resolvedLocationStore.path[5] === 'settings'
  $: board = boards.find((b) => b._id === boardId)

  $: canEdit = board !== undefined && canEditBoard(board, account)
</script>

{#if loaded && boardId === undefined}
  <div class="hulyComponent" data-id="boardCatalog">
    <Component
      is={workbench.component.SpecialView}
      props={{
        _class: tracker.class.Board,
        label: tracker.string.AllBoards,
        icon: view.icon.List,
        descriptors: [view.viewlet.Table],
        defaultViewletDescriptor: view.viewlet.Table,
        baseQuery: { _id: { $in: boards.map((item) => item._id) } }
      }}
    />
  </div>
{:else if board !== undefined && settingsOpen}
  <BoardSettings {board} {boards} {canEdit} inNavigation={navigation.has(board._id)} {navigationReady} />
{:else if board !== undefined}
  <BoardView {board} {canEdit} inNavigation={navigation.has(board._id)} {navigationReady} />
{:else if loaded}
  <div class="flex-col-center flex-grow">
    <BlankView
      icon={tracker.icon.Issues}
      header={boardId === undefined ? tracker.string.NoBoards : tracker.string.BoardNotFound}
    />
  </div>
{/if}
