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
    removeRequestConfig,
    Workflow,
    WorkflowRequest,
    WorkflowRequestConfig,
    WorkflowTransition
  } from '@hcengineering/workflow'

  import plugin from '../../plugin'
  import AddRulesPopup from '../rules/AddRulesPopup.svelte'
  import EditRulePopup from '../rules/EditRulePopup.svelte'
  import RequestConfigPresenter from './RequestConfigPresenter.svelte'

  export let workflow: Workflow
  export let taskType: TaskType
  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let transition: WorkflowTransition

  const client = getClient()
  const requests: WorkflowRequest[] = client.getModel().findAllSync(plugin.class.WorkflowRequest, {})

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

  $: requestCount = transition.requests?.length ?? 0

  async function handleAdd (): Promise<void> {
    showPopup(
      AddRulesPopup,
      { workflow, transitions, statuses, transition, _class: plugin.class.WorkflowRequest, taskType },
      'center'
    )
  }

  function handleEdit (config: WorkflowRequestConfig): void {
    showPopup(EditRulePopup, { workflow, transitions, statuses, transition, taskType, config: config as any }, 'center')
  }

  async function removeRequest (configId: string): Promise<void> {
    await removeRequestConfig(client, workflow._id, transition._id, configId)
  }

  async function handleAction (actionId: string, config: WorkflowRequestConfig): Promise<void> {
    if (actionId === 'edit') {
      handleEdit(config)
    } else if (actionId === 'delete') {
      await removeRequest(config.id)
    }
  }

  function getRequest (reqId: string): WorkflowRequest | undefined {
    return requests.find((r) => r._id === reqId)
  }
</script>

<div class="requests-nav-group">
  <NavGroup
    _id="requests"
    label={plugin.string.Requests}
    categoryName="requests"
    isFold
    defaultOpen={false}
    empty={requestCount === 0}
    noDivider
    noPadding
    headerClickType="toggle"
  >
    <svelte:fragment slot="afterTitle">
      {#if requestCount > 0}
        <div class="antiHSpacer" />
        <div class="requests-nav-group--counter">
          {requestCount}
        </div>
        <div class="antiHSpacer" />
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="after">
      <button
        type="button"
        class="requests-nav-group--action"
        data-testid="action-add-requests"
        on:click|preventDefault|stopPropagation={handleAdd}
      >
        <Icon icon={IconAdd} size="small" />
      </button>
    </svelte:fragment>

    <div class="requests-nav-group--list">
      {#each transition.requests ?? [] as config, idx (config.id ?? idx)}
        {@const request = getRequest(config.request)}
        <div class="request-card">
          <div class="request-card--header">
            <div class="request-card--title">
              {#if request?.icon}
                <div class="request-card--icon">
                  <Icon icon={request.icon} size="small" />
                </div>
              {/if}
              {#if request?.label}
                <span class="request-card--name"><Label label={request.label} /></span>
              {/if}
            </div>
            <div class="request-card--actions" on:click|stopPropagation>
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

          <div class="request-card--body">
            <RequestConfigPresenter {config} {taskType} {request} />
          </div>
        </div>
      {/each}
    </div>
  </NavGroup>
</div>

<style lang="scss">
  .requests-nav-group {
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

  .request-card {
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
    width: 100%;
    min-width: 0;
    box-sizing: border-box;

    &:hover {
      border-color: var(--global-subtle-ui-BorderColor);
      background-color: var(--global-ui-active-BackgroundColor);
    }

    &--header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      width: 100%;
      min-width: 0;
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
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--global-primary-TextColor);
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
      width: 100%;
      min-width: 0;
      overflow: hidden;
      box-sizing: border-box;
    }
  }
</style>
