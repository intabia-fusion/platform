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
  import { getCurrentAccount, type AccountUuid, type Data } from '@hcengineering/core'
  import type { Board } from '@hcengineering/tracker'
  import ui, { Label } from '@hcengineering/ui'
  import { Radio, SettingRow } from '@hcengineering/ui/kit'
  import tracker from '../../../plugin'
  import ProjectMembersTable from '../../projects/settings/ProjectMembersTable.svelte'
  import ProjectSettingsSection from '../../projects/settings/ProjectSettingsSection.svelte'

  export let board: Board
  export let onChange: (patch: Partial<Data<Board>>) => Promise<void>

  // The board moves to the personal space of the one who switches it: the author only
  $: isAuthor = getCurrentAccount().uuid === board.author

  function addEditor (account: AccountUuid): void {
    if (account === board.author || board.editors.includes(account)) return
    void onChange({ editors: [...board.editors, account] })
  }

  function removeEditor (account: AccountUuid): void {
    void onChange({ editors: board.editors.filter((a) => a !== account) })
  }
</script>

<ProjectSettingsSection title={tracker.string.ProjectSettingsAccess}>
  <div class="rows" data-id="boardSettingsMembers">
    <div class="top">
      <SettingRow kind="column" label={tracker.string.BoardVisibility}>
        <div class="radios" role="radiogroup">
          <Radio
            value="all"
            group={board.visibility}
            name="board-visibility"
            label={tracker.string.BoardVisibilityAllMembers}
            disabled={!isAuthor}
            data-id="boardVisibilityAll"
            on:change={() => onChange({ visibility: 'all' })}
          />
          <div class="radio">
            <Radio
              value="me"
              group={board.visibility}
              name="board-visibility"
              label={tracker.string.BoardVisibilityOnlyMe}
              disabled={!isAuthor}
              data-id="boardVisibilityMe"
              on:change={() => onChange({ visibility: 'me' })}
            />
            <span class="radio-hint"><Label label={tracker.string.BoardVisibilityOnlyMeHint} /></span>
          </div>
        </div>
      </SettingRow>
    </div>

    <!-- A personal board sits in the author's PersonSpace: editors could not even see it -->
    {#if board.visibility !== 'me'}
      <div class="editors" data-id="boardEditors">
        <ProjectMembersTable
          members={[board.author, ...board.editors]}
          lockedAccount={board.author}
          ignoreAccounts={[board.author]}
          fixedRole={(a) => (a === board.author ? tracker.string.BoardAuthor : tracker.string.BoardEditorRole)}
          removeLabel={ui.string.Remove}
          addDataId="boardAddEditor"
          onAdd={addEditor}
          onRemove={removeEditor}
        />
      </div>
    {/if}
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .rows {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }
  // A tall control: the caption stays at its top
  .top :global(.setting-row__main) {
    align-items: flex-start;
  }
  // A table section: apart from the rows above, as sections of the project settings
  // The last section of the page: room under the table when the page scrolls to the end
  .editors {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
    padding-bottom: 1rem;
  }
  .radios {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .radio {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-0_25);
  }
  .radio-hint {
    padding-left: calc(1rem + var(--spacing-1));
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
  }
</style>
