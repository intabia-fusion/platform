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
    removePostFunctionConfig,
    Workflow,
    WorkflowPostFunction,
    WorkflowPostFunctionConfig,
    WorkflowTransition
  } from '@hcengineering/workflow'

  import plugin from '../../plugin'
  import AddRulesPopup from '../rules/AddRulesPopup.svelte'
  import EditRulePopup from '../rules/EditRulePopup.svelte'
  import PostFunctionConfigPresenter from './PostFunctionConfigPresenter.svelte'

  export let workflow: Workflow
  export let taskType: TaskType
  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let transition: WorkflowTransition

  const client = getClient()
  const postFunctions: WorkflowPostFunction[] = client.getModel().findAllSync(plugin.class.WorkflowPostFunction, {})

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

  $: postFunctionCount = transition.postFunctions?.length ?? 0

  async function handleAdd (): Promise<void> {
    showPopup(
      AddRulesPopup,
      { workflow, transitions, statuses, transition, _class: plugin.class.WorkflowPostFunction, taskType },
      'center'
    )
  }

  function handleEdit (config: WorkflowPostFunctionConfig): void {
    showPopup(EditRulePopup, { workflow, transitions, statuses, transition, taskType, config }, 'center')
  }

  async function removePostFunction (configId: string): Promise<void> {
    await removePostFunctionConfig(client, workflow._id, transition._id, configId)
  }

  async function handleAction (actionId: string, config: WorkflowPostFunctionConfig): Promise<void> {
    if (actionId === 'edit') {
      handleEdit(config)
    } else if (actionId === 'delete') {
      await removePostFunction(config.id)
    }
  }

  function getPostFunction (pfId: string): WorkflowPostFunction | undefined {
    return postFunctions.find((p) => p._id === pfId)
  }
</script>

<div class="post-functions-nav-group">
  <NavGroup
    _id="postFunctions"
    label={plugin.string.PostFunctions}
    categoryName="postFunctions"
    isFold
    defaultOpen={false}
    empty={postFunctionCount === 0}
    noDivider
    noPadding
    headerClickType="toggle"
  >
    <svelte:fragment slot="afterTitle">
      {#if postFunctionCount > 0}
        <div class="antiHSpacer" />
        <div class="post-functions-nav-group__counter">
          {postFunctionCount}
        </div>
        <div class="antiHSpacer" />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="after">
      <button
        type="button"
        class="post-functions-nav-group__action"
        data-testid="action-add-post-functions"
        on:click|preventDefault|stopPropagation={handleAdd}
      >
        <Icon icon={IconAdd} size="small" />
      </button>
    </svelte:fragment>

    <div class="post-functions-nav-group__list">
      {#each transition.postFunctions ?? [] as config, idx (config.id ?? idx)}
        {@const pf = getPostFunction(config.postFunction)}
        <div class="post-function-card">
          <div class="post-function-card__header">
            <div class="post-function-card__title">
              {#if pf?.icon}
                <div class="post-function-card__icon">
                  <Icon icon={pf.icon} size="small" />
                </div>
              {/if}
              {#if pf?.label}
                <span class="post-function-card__name"><Label label={pf.label} /></span>
              {/if}
            </div>
            <div class="post-function-card__actions" on:click|stopPropagation>
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

          <div class="post-function-card__body">
            <PostFunctionConfigPresenter {config} {taskType} postFunction={pf} />
          </div>
        </div>
      {/each}
    </div>
  </NavGroup>
</div>

<style lang="scss">
  .post-functions-nav-group {
    &__action {
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

    &__counter {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      background: var(--global-ui-active-BackgroundColor);
      color: var(--global-primary-TextColor);
    }

    &__list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      padding: 0.25rem 0.5rem;
    }
  }

  .post-function-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    border-radius: var(--medium-BorderRadius);
    border: 1px solid var(--global-subtle-ui-BorderColor);
    background-color: var(--global-ui-highlight-BackgroundColor);
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;

    &:hover {
      border-color: var(--global-subtle-ui-BorderColor);
      background-color: var(--global-ui-active-BackgroundColor);
    }

    &__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    &__title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      flex: 1;
      color: var(--global-primary-TextColor);
    }

    &__icon {
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

    &__name {
      font-size: 0.8125rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    &__body {
      padding-left: 2rem;
    }
  }
</style>
