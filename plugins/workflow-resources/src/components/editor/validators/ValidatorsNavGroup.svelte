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
  import { Icon, IconAdd, IconClose, NavGroup, showPopup, Label } from '@hcengineering/ui'
  import { Workflow, WorkflowTransition, WorkflowValidator, updateTransition } from '@hcengineering/workflow'
  import { Status } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { IntlString } from '@hcengineering/platform'

  import plugin from '../../../plugin'
  import AddRulesPopup from '../AddRulesPopup.svelte'

  export let workflow: Workflow
  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let transition: WorkflowTransition

  const client = getClient()
  const validators: WorkflowValidator[] = client.getModel().findAllSync(plugin.class.WorkflowValidator, {})

  async function handleAdd (): Promise<void> {
    showPopup(AddRulesPopup, { workflow, transitions, statuses, transition, category: 'validate' }, 'center')
  }

  async function removeValidator (index: number): Promise<void> {
    const current = transition.validators ?? []
    const updated = current.filter((_, i) => i !== index)
    await updateTransition(client, workflow._id, transition._id, {
      validators: updated
    })
  }

  function getValidatorTitle (valId: string): IntlString | undefined {
    const found = validators.find((v) => v._id === valId)
    return found?.label
  }

  function getValidatorDetails (config: any): string {
    if (config.props?.fields && config.props.fields.length > 0) {
      return config.props.fields.join(', ')
    }
    if (config.props?.statuses && config.props.statuses.length > 0) {
      const names = config.props.statuses.map((id: string) => statuses.find((s) => s._id === id)?.name).filter(Boolean)
      return names.join(', ')
    }
    return ''
  }
</script>

<NavGroup
  _id="validators"
  label={plugin.string.Validators}
  categoryName="validators"
  isFold
  empty={(transition.validators?.length ?? 0) === 0}
  noDivider
  noPadding
  headerClickType="toggle"
>
  <svelte:fragment slot="afterTitle">
    {#if (transition.validators?.length ?? 0) > 0}
      <div class="antiHSpacer" />
      <div class="counter">
        {transition.validators?.length ?? 0}
      </div>
      <div class="antiHSpacer" />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="after">
    <button class="action" data-testid="action-add-validators" on:click|preventDefault|stopPropagation={handleAdd}>
      <Icon icon={IconAdd} size="small" />
    </button>
  </svelte:fragment>

  {#each transition.validators ?? [] as config, idx}
    {@const title = getValidatorTitle(config.validator)}
    {@const details = getValidatorDetails(config)}
    <div class="validator-row">
      <div class="validator-info">
        {#if title}
          <span class="validator-title"><Label label={title} /></span>
        {/if}
        {#if details}
          <span class="validator-details">{details}</span>
        {/if}
      </div>
      <button class="remove-btn" on:click|preventDefault|stopPropagation={() => removeValidator(idx)}>
        <Icon icon={IconClose} size="small" />
      </button>
    </div>
  {/each}
</NavGroup>

<style lang="scss">
  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: var(--spacing-0_5);
    color: var(--global-tertiary-TextColor);
    border: none;
    border-radius: var(--extra-small-BorderRadius);
    outline: none;

    &:hover {
      color: var(--global-primary-TextColor);
      background-color: var(--global-ui-highlight-BackgroundColor);
    }
  }

  .counter {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    background: var(--global-subtle-BackgroundColor);
    color: var(--global-primary-TextColor);
  }

  .validator-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.75rem;
    gap: 0.5rem;
    border-radius: var(--small-BorderRadius, 0.25rem);

    &:hover {
      background-color: var(--global-ui-highlight-BackgroundColor);
    }
  }

  .validator-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .validator-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--global-primary-TextColor);
  }

  .validator-details {
    font-size: 0.75rem;
    color: var(--global-secondary-TextColor);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--global-tertiary-TextColor);
    padding: 0.25rem;
    border-radius: var(--extra-small-BorderRadius);
    cursor: pointer;

    &:hover {
      color: var(--negative-button-default, #ef4444);
      background-color: var(--global-ui-highlight-BackgroundColor);
    }
  }
</style>
