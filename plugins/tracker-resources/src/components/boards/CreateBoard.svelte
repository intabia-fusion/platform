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
  import { generateId, getCurrentAccount, notEmpty, type AccountUuid, type Ref } from '@hcengineering/core'
  import { getEmbeddedLabel, translate } from '@hcengineering/platform'
  import presentation, { SpacesMultiPopup, getClient } from '@hcengineering/presentation'
  import task, { getStates } from '@hcengineering/task'
  import { typeStore } from '@hcengineering/task-resources'
  import type { Board, BoardColumn, BoardVisibility, Issue, Project } from '@hcengineering/tracker'
  import ui, { Icon, Label, Scroller, resolvedLocationStore, showPopup } from '@hcengineering/ui'
  import { Button, Chip, IconButton, Radio, SettingRow, TextArea, TextInput, WizardDialog } from '@hcengineering/ui/kit'
  import { FilterConditions, statusStore } from '@hcengineering/view-resources'
  import { createEventDispatcher, onMount } from 'svelte'
  import { boardLocation, boardQuery, createBoard } from '../../boards'
  import tracker from '../../plugin'
  import { activeProjects } from '../../utils'
  import ProjectMembersTable from '../projects/settings/ProjectMembersTable.svelte'
  import ColumnsTab from './settings/ColumnsTab.svelte'

  type Step = 'general' | 'members' | 'columns'
  // A personal board has no editors: the members step shows for a team board only
  $: steps = [
    { id: 'general' as const, label: tracker.string.BoardTabGeneral },
    ...(visibility !== 'me' ? [{ id: 'members' as const, label: tracker.string.BoardEditors }] : []),
    { id: 'columns' as const, label: tracker.string.BoardTabColumns }
  ]
  let step: Step = 'general'

  const client = getClient()
  const dispatch = createEventDispatcher()
  const me = getCurrentAccount().uuid

  let title = ''
  let description = ''
  let visibility: BoardVisibility = 'all'
  let editors: AccountUuid[] = []
  // The rest of the projects goes to a "+N" chip
  const maxShown = 5
  let filter = ''
  let isSaving = false

  // The project of the current page, otherwise the first one
  const current = $resolvedLocationStore.path[3] as Ref<Project>
  const first = $activeProjects.has(current) ? current : $activeProjects.keys().next().value
  let selected: Array<Ref<Project>> = first !== undefined ? [first] : []

  $: shown = selected.map((id) => $activeProjects.get(id)).filter(notEmpty)

  function chooseProjects (e: MouseEvent): void {
    showPopup(
      SpacesMultiPopup,
      { _classes: [tracker.class.Project], label: tracker.string.BoardProjects, selectedSpaces: selected },
      e.currentTarget as HTMLElement,
      () => {},
      (result: Array<Ref<Project>> | undefined) => {
        if (result !== undefined) selected = result
      }
    )
  }

  function addEditor (account: AccountUuid): void {
    if (account !== me && !editors.includes(account)) editors = [...editors, account]
  }

  function removeEditor (account: AccountUuid): void {
    editors = editors.filter((a) => a !== account)
  }

  function removeProject (id: Ref<Project>): void {
    selected = selected.filter((p) => p !== id)
  }

  // How many issues of the selected projects the filter lets through
  let counts: { matched: number, total: number } | undefined
  let countSeq = 0
  async function count (projects: Array<Ref<Project>>, condition: string): Promise<void> {
    const seq = ++countSeq
    if (projects.length === 0) {
      counts = undefined
      return
    }
    const [total, matched] = await Promise.all([
      client.findAll<Issue>(tracker.class.Issue, { space: { $in: projects } }, { limit: 1, total: true }),
      boardQuery(client, { projects, filter: condition, quickFilters: [] }, new Set(), () => {
        void count(projects, condition)
      }).then(async (q) => await client.findAll<Issue>(tracker.class.Issue, q, { limit: 1, total: true }))
    ])
    if (seq === countSeq) counts = { matched: matched.total, total: total.total }
  }
  $: void count(selected, filter)

  $: statuses = shown
    .flatMap((p) => getStates(p, $typeStore, $statusStore.byId))
    .filter((s, i, all) => all.findIndex((o) => o._id === s._id) === i)

  // One empty column: the user drags the statuses of the projects into it
  let columns: BoardColumn[] = []
  onMount(async () => {
    const columnTitle = await translate(tracker.string.MyColumn, {})
    columns = [{ id: generateId(), title: columnTitle, category: task.statusCategory.UnStarted, statuses: [] }]
  })
  $: draft = { projects: selected, columns }

  async function onColumns (patch: Partial<Pick<Board, 'columns'>>): Promise<void> {
    if (patch.columns === undefined) return
    columns = patch.columns
  }

  $: canProceed = title.trim() !== '' && selected.length > 0
  $: canSubmit = canProceed && !isSaving

  async function create (): Promise<void> {
    if (!canSubmit) return
    isSaving = true
    try {
      const text = description.trim()
      const id = await createBoard(client, {
        title: title.trim(),
        ...(text !== '' ? { description: text } : {}),
        projects: selected,
        visibility,
        // Editors picked before switching to a personal board would hold no rights there
        editors: visibility === 'me' ? [] : editors,
        filter,
        columns
      })
      dispatch('close')
      boardLocation(id)
    } finally {
      isSaving = false
    }
  }
</script>

<WizardDialog
  label={tracker.string.CreateBoard}
  {steps}
  bind:selected={step}
  {canProceed}
  {canSubmit}
  submitLabel={presentation.string.Create}
  earlySubmit
  loading={isSaving}
  data-id="board-create-wizard"
  on:submit={create}
  on:close={() => dispatch('close')}
>
  <div class="step-frame">
    <Scroller padding="var(--_ring)">
      <div class="step" data-id={`board-create-step-${step}`}>
        {#if step === 'general'}
          <SettingRow kind="column" label={tracker.string.RuleTitle} fullWidth let:labelId>
            <TextInput
              id="board-create-title"
              bind:value={title}
              placeholder={tracker.string.BoardTitle}
              aria-labelledby={labelId}
              fullWidth
              autofocus
            />
          </SettingRow>

          <SettingRow kind="column" label={tracker.string.Description} fullWidth let:labelId>
            <div class="field-fill">
              <TextArea
                id="board-create-description"
                bind:value={description}
                rows={2}
                placeholder={tracker.string.IssueDescriptionPlaceholder}
                aria-labelledby={labelId}
              />
            </div>
          </SettingRow>

          <SettingRow kind="column" label={tracker.string.BoardProjects} hint={tracker.string.BoardProjectsHint}>
            <div class="chips" data-id="board-create-projects">
              {#each shown.slice(0, maxShown) as project (project._id)}
                <span class="chip">
                  <Icon icon={task.icon.Kanban} size="small" />
                  {project.name} · {project.identifier}
                  {#if selected.length > 1}
                    <span class="remove">
                      <IconButton
                        data-id="board-create-remove-project"
                        kind="ghost"
                        size="min"
                        icon={ui.icon.Cross}
                        tooltip={{ label: ui.string.Remove }}
                        on:click={() => {
                          removeProject(project._id)
                        }}
                      />
                    </span>
                  {/if}
                </span>
              {/each}
              {#if shown.length > maxShown}
                <button class="more" data-id="board-create-more-projects" on:click={chooseProjects}>
                  <Chip kind="neutral" label={getEmbeddedLabel(`+${shown.length - maxShown}`)} />
                </button>
              {/if}
              <Button
                data-id="board-create-add-project"
                kind="tertiary"
                size="extra-small"
                icon={ui.icon.Plus}
                label={tracker.string.BoardAdd}
                on:click={chooseProjects}
              />
            </div>
          </SettingRow>

          <SettingRow kind="column" label={tracker.string.BoardVisibility}>
            <div class="radios" role="radiogroup">
              <Radio
                value="all"
                group={visibility}
                name="board-create-visibility"
                label={tracker.string.BoardVisibilityAllMembers}
                data-id="board-create-visibility-all"
                on:change={() => (visibility = 'all')}
              />
              <Radio
                value="me"
                group={visibility}
                name="board-create-visibility"
                label={tracker.string.BoardVisibilityOnlyMe}
                data-id="board-create-visibility-me"
                on:change={() => (visibility = 'me')}
              />
            </div>
          </SettingRow>

          <div class="filter-row">
            <SettingRow kind="column" label={tracker.string.BoardFilter} hint={tracker.string.BoardFilterHint}>
              <div class="filter">
                <FilterConditions
                  _class={tracker.class.Issue}
                  value={filter}
                  removable
                  addLabel={tracker.string.BoardCondition}
                  hiddenKeys={['space']}
                  on:change={(e) => {
                    filter = e.detail
                  }}
                />
                {#if counts !== undefined}
                  <span class="note" data-id="board-create-filter-count">
                    <Label label={tracker.string.BoardFilterCount} params={counts} />
                  </span>
                {/if}
              </div>
            </SettingRow>
          </div>
        {:else if step === 'members'}
          <div class="editors" data-id="board-create-editors">
            <ProjectMembersTable
              members={[me, ...editors]}
              lockedAccount={me}
              ignoreAccounts={[me]}
              fixedRole={(a) => (a === me ? tracker.string.BoardAuthor : tracker.string.BoardEditorRole)}
              removeLabel={ui.string.Remove}
              addDataId="board-create-add-editor"
              onAdd={addEditor}
              onRemove={removeEditor}
            />
          </div>
        {:else}
          <ColumnsTab board={draft} {statuses} onChange={onColumns} compact />
        {/if}
      </div>
    </Scroller>
  </div>
</WizardDialog>

<style lang="scss">
  // The add button of the table head stands apart from the table
  .editors {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  // Same frame as the project wizard: the height is fixed, the ring padding keeps the focus outline unclipped
  .step-frame {
    --_ring: 0.25rem;

    display: flex;
    flex-direction: column;
    height: calc(28rem + 2 * var(--_ring));
    margin: calc(-1 * var(--_ring));
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }
  .field-fill {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }
  .remove {
    display: inline-flex;
    opacity: 0;
  }
  .chip:hover .remove,
  .chip:focus-within .remove {
    opacity: 1;
  }
  .more {
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 1.75rem;
    padding: 0 0.375rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
    background-color: var(--theme-link-button-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
  }
  .radios {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  // The label line is as tall as the add button, so the count starts where the hint does
  .filter-row :global(.setting-row__main) {
    align-items: flex-start;
  }
  .filter-row :global(.setting-row__label) {
    display: flex;
    align-items: center;
    min-height: var(--global-extra-small-Size);
  }
  .filter {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .note {
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
</style>
