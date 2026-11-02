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
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { canEditBoard, type Board } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { NavLink } from '@hcengineering/view-resources'
  import { boardLocation, boardNavigationId, reportBoardError, setBoardInNavigation, shareBoard } from '../../boards'
  import tracker from '../../plugin'

  export let value: Board | string
  export let field: 'title' | 'actions' | 'visibility' = 'visibility'

  const client = getClient()
  let navigationReady = false
  let sharing = false
  let updatingNavigation = false
  let navigation = new Set<Ref<Board>>()
  if (field === 'actions') {
    createQuery().query(tracker.class.BoardNavigationPreference, { _id: boardNavigationId() }, (result) => {
      navigation = new Set(result[0]?.boards ?? [])
      navigationReady = result[0] !== undefined
    })
  }

  $: board = typeof value === 'object' ? value : undefined
</script>

{#if field === 'visibility'}
  <span data-id={value === 'me' ? 'boardPersonal' : undefined}>
    <Label label={value === 'me' ? tracker.string.BoardVisibilityMe : tracker.string.BoardVisibilityAll} />
  </span>
{:else if board !== undefined}
  <div class="flex-presenter" data-board-id={board._id}>
    {#if field === 'title'}
      <NavLink space="boards" special={board._id} noUnderline={false}>
        <span class="overflow-label">{board.title}</span>
      </NavLink>
    {:else}
      <div class="flex-row-center actions">
        {#if canEditBoard(board, getCurrentAccount().uuid)}
          <Button
            data-id="boardCatalogSettings"
            kind="ghost"
            size="small"
            label={tracker.string.BoardSettings}
            on:click={() => {
              boardLocation(board._id, true)
            }}
          />
        {/if}
        <Button
          data-id="boardShare"
          kind="ghost"
          size="small"
          loading={sharing}
          label={tracker.string.ShareBoard}
          on:click={() => {
            if (sharing) return
            sharing = true
            void shareBoard(board)
              .catch(reportBoardError)
              .finally(() => {
                sharing = false
              })
          }}
        />
        <Button
          data-id={navigation.has(board._id) ? 'boardRemoveFromNavigation' : 'boardAddToNavigation'}
          kind="secondary"
          size="small"
          disabled={!navigationReady}
          loading={updatingNavigation}
          label={navigation.has(board._id)
            ? tracker.string.RemoveBoardFromNavigation
            : tracker.string.AddBoardToNavigation}
          on:click={() => {
            if (updatingNavigation) return
            updatingNavigation = true
            void setBoardInNavigation(client, board._id, !navigation.has(board._id))
              .catch(reportBoardError)
              .finally(() => {
                updatingNavigation = false
              })
          }}
        />
      </div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .actions {
    gap: 0.75rem;
  }
</style>
