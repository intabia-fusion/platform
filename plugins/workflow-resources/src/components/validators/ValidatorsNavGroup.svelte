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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { Status } from '@hcengineering/core'
  import presentation, { getClient } from '@hcengineering/presentation'
  import { TaskType } from '@hcengineering/task'
  import {
    ButtonMenu,
    DropdownIntlItem,
    Icon,
    IconAdd,
    IconClose,
    IconEdit,
    IconMoreV,
    Label,
    NavGroup,
    showPopup
  } from '@hcengineering/ui'
  import {
    removeValidatorConfig,
    Workflow,
    WorkflowTransition,
    WorkflowValidator,
    WorkflowValidatorConfig
  } from '@hcengineering/workflow'

  import plugin from '../../plugin'
  import AddRulesPopup from '../rules/AddRulesPopup.svelte'
  import EditRulePopup from '../rules/EditRulePopup.svelte'
  import ValidatorConfigPresenter from './ValidatorConfigPresenter.svelte'

  export let workflow: Workflow
  export let taskType: TaskType
  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let transition: WorkflowTransition

  const client = getClient()
  const validators: WorkflowValidator[] = client.getModel().findAllSync(plugin.class.WorkflowValidator, {})

  const actionItems: DropdownIntlItem[] = [
    {
      id: 'edit',
      label: presentation.string.Edit,
      icon: IconEdit
    },
    {
      id: 'delete',
      label: presentation.string.Delete,
      icon: IconClose
    }
  ]

  $: validatorCount = transition.validators?.length ?? 0

  async function handleAdd (): Promise<void> {
    showPopup(
      AddRulesPopup,
      { workflow, transitions, statuses, transition, _class: plugin.class.WorkflowValidator, taskType },
      'center'
    )
  }

  function handleEdit (config: WorkflowValidatorConfig): void {
    showPopup(EditRulePopup, { workflow, transitions, statuses, transition, taskType, config }, 'center')
  }

  async function removeValidator (configId: string): Promise<void> {
    await removeValidatorConfig(client, workflow._id, transition._id, configId)
  }

  async function handleAction (actionId: string, config: WorkflowValidatorConfig): Promise<void> {
    if (actionId === 'edit') {
      handleEdit(config)
    } else if (actionId === 'delete') {
      await removeValidator(config.id)
    }
  }

  function getValidator (valId: string): WorkflowValidator | undefined {
    return validators.find((v) => v._id === valId)
  }
</script>

<div class="validators-nav-group">
  <NavGroup
    _id="validators"
    label={plugin.string.Validators}
    categoryName="validators"
    isFold
    defaultOpen={false}
    empty={validatorCount === 0}
    noDivider
    noPadding
    headerClickType="toggle"
  >
    <svelte:fragment slot="afterTitle">
      {#if validatorCount > 0}
        <div class="antiHSpacer" />
        <div class="validators-nav-group--counter">
          {validatorCount}
        </div>
        <div class="antiHSpacer" />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="after">
      <button
        type="button"
        class="validators-nav-group--action"
        data-testid="action-add-validators"
        on:click|preventDefault|stopPropagation={handleAdd}
      >
        <Icon icon={IconAdd} size="small" />
      </button>
    </svelte:fragment>

    <div class="validators-nav-group--list">
      {#each transition.validators ?? [] as config, idx (config.id ?? idx)}
        {@const validator = getValidator(config.validator)}
        <div class="validator-card">
          <div class="validator-card--header">
            <div class="validator-card--title">
              {#if validator?.icon}
                <div class="validator-card--icon">
                  <Icon icon={validator.icon} size="small" />
                </div>
              {/if}
              {#if validator?.label}
                <span class="validator-card--name"><Label label={validator.label} /></span>
              {/if}
            </div>
            <div class="validator-card--actions" on:click|stopPropagation>
              <ButtonMenu
                items={actionItems}
                icon={IconMoreV}
                kind="tertiary"
                size="extra-small"
                noSelection={true}
                on:selected={(ev) => {
                  void handleAction(ev.detail, config)
                }}
              />
            </div>
          </div>

          <div class="validator-card--body">
            <ValidatorConfigPresenter {config} {taskType} {validator} />
          </div>
        </div>
      {/each}
    </div>
  </NavGroup>
</div>

<style lang="scss">
  .validators-nav-group {
    &--action {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: var(--spacing-0_5);
      color: var(--global-tertiary-TextColor);
      border: none;
      border-radius: var(--extra-small-BorderRadius);
      outline: none;
      cursor: pointer;

      &:hover {
        color: var(--global-primary-TextColor);
        background-color: var(--global-ui-highlight-BackgroundColor);
      }
    }

    &--counter {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      background: var(--global-ui-active-BackgroundColor);
      color: var(--global-primary-TextColor);
    }

    &--list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      padding: 0.25rem 0.5rem;
    }
  }

  .validator-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    border-radius: var(--medium-BorderRadius, 0.5rem);
    border: 1px solid var(--global-subtle-ui-BorderColor);
    background-color: var(--global-ui-highlight-BackgroundColor);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;

    &:hover {
      border-color: var(--global-subtle-ui-BorderColor);
      background-color: var(--global-ui-active-BackgroundColor);
    }

    &--header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    &--title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      flex: 1;
      color: var(--global-primary-TextColor);
    }

    &--icon {
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 0.375rem;
      background-color: var(--global-subtle-ui-BorderColor);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--global-primary-TextColor);

      :global(svg) {
        width: 0.875rem !important;
        height: 0.875rem !important;
        min-width: 0.875rem !important;
        min-height: 0.875rem !important;
        max-width: 0.875rem !important;
        max-height: 0.875rem !important;
        flex-shrink: 0;
      }
    }

    &--name {
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &--actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    &--body {
      padding-left: 2rem;
    }
  }
</style>
