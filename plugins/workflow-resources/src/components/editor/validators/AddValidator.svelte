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
  import { Ref, Status } from '@hcengineering/core'
  import ui, {
    ModernDropdownLabels,
    Label,
    languageStore,
    Icon,
    IconCheck,
    type DropdownTextItem
  } from '@hcengineering/ui'
  import { StatePresenter } from '@hcengineering/task-resources'
  import { translate } from '@hcengineering/platform'
  import {
    Workflow,
    WorkflowTransition,
    WorkflowValidator,
    WorkflowValidatorConfig,
    updateTransition
  } from '@hcengineering/workflow'
  import { getClient } from '@hcengineering/presentation'

  import plugin from '../../../plugin'

  export let workflow: Workflow | undefined = undefined
  export let transition: WorkflowTransition | undefined = undefined
  export let searchQuery: string = ''
  export let statuses: Status[] = []

  const client = getClient()
  const validators: WorkflowValidator[] = client.getModel().findAllSync(plugin.class.WorkflowValidator, {})

  let selectedValidatorId: Ref<WorkflowValidator> | undefined = validators[0]?._id
  let selectedFields: string[] = []
  let selectedStatusIds: string[] = []

  interface RuleItem {
    id: Ref<WorkflowValidator>
    title: string
    description: string
    validator: WorkflowValidator
  }

  let ruleItems: RuleItem[] = []

  $: void Promise.all(
    validators.map(async (v) => {
      const title = await translate(v.label, {}, $languageStore)
      const descKey =
        v._id === plugin.validator.SubtaskStatus
          ? plugin.string.SubtaskStatusDescription
          : plugin.string.FieldRequiredDescription
      const description = await translate(descKey, {}, $languageStore)
      return {
        id: v._id,
        title,
        description,
        validator: v
      }
    })
  ).then((res) => {
    ruleItems = res
    if (selectedValidatorId === undefined && res.length > 0) {
      selectedValidatorId = res[0].id
    }
  })

  $: filteredRules = ruleItems.filter((r) => {
    return (
      searchQuery.trim() === '' ||
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  const fieldDropdownItems: DropdownTextItem[] = [
    { id: 'assignee', label: 'Assignee' },
    { id: 'description', label: 'Description' },
    { id: 'dueDate', label: 'Due Date' },
    { id: 'priority', label: 'Priority' },
    { id: 'estimation', label: 'Estimation' },
    { id: 'component', label: 'Component' },
    { id: 'milestone', label: 'Milestone' }
  ]

  $: statusDropdownItems = (statuses ?? []).map(
    (s): DropdownTextItem => ({
      id: s._id,
      label: s.name,
      icon: StatePresenter,
      iconProps: { value: s, shouldShowName: false }
    })
  )

  export async function save (): Promise<void> {
    if (selectedValidatorId == null || transition == null || workflow == null) return

    const currentValidators = transition.validators ?? []
    const isSubtask = selectedValidatorId === plugin.validator.SubtaskStatus
    const props = isSubtask ? { statuses: selectedStatusIds } : { fields: selectedFields }

    const newConfig: WorkflowValidatorConfig = {
      validator: selectedValidatorId,
      props
    }

    await updateTransition(client, workflow._id, transition._id, {
      validators: [...currentValidators, newConfig]
    })
  }
</script>

{#each filteredRules as rule (rule.id)}
  <div
    class="rule-card"
    class:selected={selectedValidatorId === rule.id}
    on:click={() => (selectedValidatorId = rule.id)}
  >
    <div class="card-icon-container">
      <div class="card-badge">
        <Icon icon={IconCheck} size="small" />
      </div>
    </div>

    <div class="card-body">
      <div class="card-title">{rule.title}</div>
      <div class="card-description">{rule.description}</div>

      {#if selectedValidatorId === rule.id}
        {#if rule.id === plugin.validator.SubtaskStatus}
          <div class="fields-selector-row" on:click|stopPropagation>
            <span class="fields-label"><Label label={plugin.string.SubtaskStatusRequired} />:</span>
            <ModernDropdownLabels
              items={statusDropdownItems}
              bind:selected={selectedStatusIds}
              multiselect={true}
              wrap={true}
              placeholder={ui.string.NotSelected}
              justify="left"
              width="100%"
            />
          </div>
        {:else}
          <div class="fields-selector-row" on:click|stopPropagation>
            <span class="fields-label"><Label label={plugin.string.FieldRequiredValidator} />:</span>
            <ModernDropdownLabels
              items={fieldDropdownItems}
              bind:selected={selectedFields}
              multiselect={true}
              wrap={true}
              placeholder={ui.string.NotSelected}
              justify="left"
              width="100%"
            />
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/each}

<style lang="scss">
  .rule-card {
    display: flex;
    gap: 1rem;
    padding: 0.875rem 1rem;
    border-radius: var(--medium-BorderRadius, 0.5rem);
    border: 1px solid var(--global-subtle-ui-BorderColor);
    background-color: var(--global-subtle-BackgroundColor, rgba(255, 255, 255, 0.02));
    cursor: pointer;

    &:hover {
      border-color: var(--global-secondary-TextColor);
      background-color: var(--global-ui-highlight-BackgroundColor);
    }

    &.selected {
      border-color: var(--accent-button-default, #2563eb);
      background-color: var(--global-primary-OptionColor, rgba(59, 130, 246, 0.05));
    }
  }

  .card-icon-container {
    display: flex;
    align-items: flex-start;
    padding-top: 0.125rem;
  }

  .card-badge {
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    background-color: var(--global-primary-OptionColor, rgba(59, 130, 246, 0.15));
    color: var(--accent-button-default, #2563eb);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .card-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--global-primary-TextColor);
  }

  .card-description {
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: var(--global-secondary-TextColor);
  }

  .fields-selector-row {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--global-subtle-ui-BorderColor);
  }

  .fields-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--global-secondary-TextColor);
  }

  .empty-rules {
    padding: 2rem;
    text-align: center;
    color: var(--global-secondary-TextColor);
    font-size: 0.875rem;
  }
</style>
