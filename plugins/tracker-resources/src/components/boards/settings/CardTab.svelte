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
  import type { Data, WithLookup } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { getClient, isDisabled } from '@hcengineering/presentation'
  import {
    cardDensities,
    cardFields,
    IssuePriority,
    isCardFieldVisible,
    toggleCardField,
    type Board,
    type CardField,
    type Issue
  } from '@hcengineering/tracker'
  import { Label } from '@hcengineering/ui'
  import { Checkbox } from '@hcengineering/ui/kit'
  import { boardQuery } from '../../../boards'
  import tracker from '../../../plugin'
  import IssueKanbanCard from '../../issues/IssueKanbanCard.svelte'
  import ProjectSettingsSection from '../../projects/settings/ProjectSettingsSection.svelte'
  import { densityLabels } from '../density'

  export let board: Board
  export let onChange: (patch: Partial<Data<Board>>) => Promise<void>

  const client = getClient()
  const issueStats = !isDisabled('tracker-issue-stats')
  // Display only: nothing stores the checkbox
  let daysInColumn = false

  const fieldLabels: Record<CardField, IntlString> = {
    priority: tracker.string.Priority,
    subIssues: tracker.string.SubIssues,
    dueDate: tracker.string.DueDate,
    component: tracker.string.Component,
    milestone: tracker.string.Milestone,
    labels: tracker.string.Labels,
    estimation: tracker.string.Estimation,
    attachments: tracker.string.Attachments,
    comments: tracker.string.Comments,
    parent: tracker.string.Parent
  }

  // How many of the card fields the issue fills: the fullest one shows what the checkboxes change
  function filled (issue: Issue): number {
    return [
      issue.priority !== IssuePriority.NoPriority,
      issue.subIssues > 0,
      issue.dueDate != null,
      issue.component != null,
      issue.milestone != null,
      (issue.labels ?? 0) > 0,
      issue.estimation > 0,
      (issue.attachments ?? 0) > 0,
      (issue.comments ?? 0) > 0,
      issue.attachedTo !== tracker.ids.NoParent
    ].filter(Boolean).length
  }

  // A real issue of the board shows what each density keeps
  let sample: WithLookup<Issue> | undefined
  let sampleSeq = 0
  async function loadSample (key: string): Promise<void> {
    const seq = ++sampleSeq
    const query = await boardQuery(client, board, new Set(), () => {})
    const issues = await client.findAll(tracker.class.Issue, query, {
      limit: 50,
      lookup: { attachedTo: tracker.class.Issue, _id: { subIssues: tracker.class.Issue } }
    })
    if (seq !== sampleSeq) return
    sample = issues.reduce<WithLookup<Issue> | undefined>(
      (best, issue) => (best === undefined || filled(issue) > filled(best) ? issue : best),
      undefined
    )
  }
  // Field and density clicks do not change which issues the board takes
  $: sampleKey = JSON.stringify([board.projects, board.filter])
  $: void loadSample(sampleKey)

  $: shown = (field: CardField): boolean => isCardFieldVisible(board.cardFields, field)
</script>

<ProjectSettingsSection title={tracker.string.BoardTabCard} description={tracker.string.BoardCardHint}>
  <div class="body" data-id="boardSettingsCard">
    <div class="fields" data-id="boardCardFields">
      {#each cardFields as field (field)}
        <div class="field" data-id={`boardCardField-${field}`}>
          <Checkbox
            checked={isCardFieldVisible(board.cardFields, field)}
            label={fieldLabels[field]}
            on:change={(e) => {
              void onChange({ cardFields: toggleCardField(board.cardFields, field, e.detail) })
            }}
          />
        </div>
      {/each}
      <!-- tracker-issue-stats: an issue keeps no time of entering a status -->
      {#if issueStats}
        <div class="field" data-id="boardCardField-daysInColumn">
          <Checkbox
            checked={daysInColumn}
            label={tracker.string.DaysInColumn}
            on:change={(e) => {
              daysInColumn = e.detail
            }}
          />
        </div>
      {/if}
    </div>
    <div class="preview">
      <span class="hint"><Label label={tracker.string.CardDensityHint} /></span>
      <div class="levels">
        {#each cardDensities as density, i (density)}
          <button
            class="level"
            data-id={`boardDensity-${density}`}
            on:click={() => {
              void onChange({ density })
            }}
          >
            <span class="caption">{i + 1}. <Label label={densityLabels[density]} /></span>
            <div class="column">
              <div class="card" class:selected={board.density === density}>
                {#if sample === undefined}
                  <span class="empty"><Label label={tracker.string.BoardNoSampleIssue} /></span>
                {:else}
                  <IssueKanbanCard issue={sample} {density} {shown} space={sample.space} preview />
                {/if}
              </div>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .body {
    display: flex;
    align-items: flex-start;
    gap: 3rem;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex-shrink: 0;
  }
  // Flex: an inline checkbox in a block would add the descender gap to the 20px row
  .field {
    display: flex;
  }
  .preview {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 33.75rem;
    min-width: 0;
  }
  .hint {
    font-size: 0.75rem;
    line-height: 1.25;
    color: var(--theme-darker-color);
  }
  .levels {
    display: grid;
    grid-template-columns: repeat(2, 15.625rem);
    gap: 1rem;
    align-items: start;
  }
  .level {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    width: 100%;
    padding: 0;
    text-align: left;
    cursor: pointer;
    background: none;
    border: none;
  }
  .caption {
    text-align: left;
    font-size: 0.8125rem;
    line-height: 1.25;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .column {
    box-sizing: border-box;
    width: 100%;
    padding: 0.5rem;
    background-color: var(--theme-kanban-card-bg-color);
    border-radius: 0.5rem;
  }
  // The frame of a board card (KanbanRow); the card inside is a sample, clicks pick the density
  .card {
    pointer-events: none;
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

    &.selected {
      border: 2px solid var(--theme-toggle-on-bg-color);
    }
  }
  .empty {
    display: block;
    padding: 0.75rem 0.875rem;
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }
</style>
