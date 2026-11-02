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
  import { getCurrentAccount, type Ref, type Space } from '@hcengineering/core'
  import { createQuery, getClient, MessageBox } from '@hcengineering/presentation'
  import {
    canEditBoard,
    isBoardAvailable,
    sortBoards,
    type Board,
    type BoardNavigationPreference
  } from '@hcengineering/tracker'
  import task from '@hcengineering/task'
  import ui, {
    Icon,
    getCurrentResolvedLocation,
    navigate,
    resolvedLocationStore,
    showPopup,
    type Action
  } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { TreeItem, TreeNode } from '@hcengineering/view-resources'
  import {
    boardLocation,
    boardNavigationId,
    canDeleteBoard,
    ensureBoardNavigation,
    reportBoardError,
    setBoardInNavigation,
    shareBoard,
    togglePinned
  } from '../../boards'
  import tracker from '../../plugin'
  import CreateBoard from './CreateBoard.svelte'

  // Props the workbench gives to every navigator section
  export let currentSpace: Ref<Space> | undefined = undefined
  export let currentSpecial: string | undefined = undefined
  export let currentFragment: string | undefined = undefined
  void [currentSpace, currentSpecial, currentFragment]

  const client = getClient()
  const account = getCurrentAccount().uuid

  let boards: Board[] = []
  let pinned = new Set<Ref<Board>>()
  let navigation: BoardNavigationPreference | undefined
  createQuery().query(tracker.class.Board, {}, (res) => {
    boards = res.filter((b) => isBoardAvailable(b, account))
    void ensureBoardNavigation(client, res).catch(reportBoardError)
  })
  createQuery().query(tracker.class.BoardPreference, {}, (res) => {
    pinned = new Set(res.map((p) => p.attachedTo))
  })

  createQuery().query(tracker.class.BoardNavigationPreference, { _id: boardNavigationId() }, (res) => {
    navigation = res[0]
  })

  $: shown = sortBoards(
    boards.filter((board) => navigation?.boards.includes(board._id)),
    pinned
  )
  $: selectedId =
    $resolvedLocationStore.path[3] === 'boards' ? ($resolvedLocationStore.path[4] as Ref<Board>) : undefined
  $: selected = shown.find((b) => b._id === selectedId)

  async function boardActions (board: Board): Promise<Action[]> {
    const result: Action[] = [
      {
        label: tracker.string.ShareBoard,
        icon: view.icon.CopyLink,
        action: async () => {
          await shareBoard(board)
        }
      },
      {
        label: tracker.string.RemoveBoardFromNavigation,
        icon: view.icon.Delete,
        action: async () => {
          await setBoardInNavigation(client, board._id, false)
        }
      },
      {
        label: pinned.has(board._id) ? tracker.string.UnpinBoard : tracker.string.PinBoard,
        icon: view.icon.Pin,
        action: async () => {
          await togglePinned(client, board._id)
        }
      }
    ]
    if (canEditBoard(board, account)) {
      result.push({
        label: tracker.string.BoardSettings,
        icon: ui.icon.Gear,
        action: async () => {
          boardLocation(board._id, true)
        }
      })
    }
    if (canDeleteBoard(board, account)) {
      result.push({
        label: tracker.string.DeleteBoard,
        icon: ui.icon.Trash,
        action: async () => {
          showPopup(MessageBox, {
            label: tracker.string.DeleteBoard,
            message: tracker.string.DeleteBoardConfirm,
            action: async () => {
              await client.remove(board)
            }
          })
        }
      })
    }
    return result
  }
</script>

<TreeNode
  _id="tree-boards"
  label={tracker.string.TaskBoards}
  highlighted={selected !== undefined}
  isFold
  empty={shown.length === 0}
  visible={selected !== undefined}
>
  <svelte:fragment slot="headerActions">
    <IconButton
      icon={ui.icon.Plus}
      size="extra-small"
      kind="tertiary"
      tooltip={{ label: tracker.string.CreateBoard, direction: 'top' }}
      on:click={(event) => {
        event.stopPropagation()
        showPopup(CreateBoard, {}, 'top')
      }}
    />
    <IconButton
      icon={view.icon.List}
      size="extra-small"
      kind="tertiary"
      tooltip={{ label: tracker.string.AllBoards, direction: 'top' }}
      on:click={(event) => {
        event.stopPropagation()
        const loc = getCurrentResolvedLocation()
        loc.path = [...loc.path.slice(0, 3), 'boards']
        loc.query = undefined
        loc.fragment = undefined
        navigate(loc)
      }}
    />
  </svelte:fragment>
  <div class="boards" data-id="boardsNav">
    {#each shown as board (board._id)}
      <TreeItem
        _id={board._id}
        title={board.title}
        selected={selectedId === board._id}
        icon={task.icon.Kanban}
        on:click={() => {
          boardLocation(board._id)
        }}
        actions={async () => await boardActions(board)}
      >
        <svelte:fragment slot="extra">
          {#if pinned.has(board._id)}
            <span class="pin"><Icon icon={view.icon.Pin} size="x-small" /></span>
          {/if}
        </svelte:fragment>
      </TreeItem>
    {/each}
  </div>
  <svelte:fragment slot="visible">
    {#if selected !== undefined}
      {@const item = selected}
      <TreeItem
        _id={item._id}
        title={item.title}
        icon={task.icon.Kanban}
        selected
        actions={async () => await boardActions(item)}
      />
    {/if}
  </svelte:fragment>
</TreeNode>

<style lang="scss">
  // A button-based row stretches only as a flex item of a column
  .boards {
    display: flex;
    flex-direction: column;
  }
  .pin {
    display: flex;
    margin-right: var(--spacing-0_5);
    color: var(--global-tertiary-TextColor);
  }
</style>
