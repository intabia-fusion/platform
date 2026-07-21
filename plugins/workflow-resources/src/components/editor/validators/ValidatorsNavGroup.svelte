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
  import { Icon, IconAdd, NavGroup, showPopup } from '@hcengineering/ui'
  import { Workflow, WorkflowTransition } from '@hcengineering/workflow'
  import { Status } from '@hcengineering/core'

  import plugin from '../../../plugin'
  import AddRulesPopup from '../AddRulesPopup.svelte'

  export let workflow: Workflow
  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let transition: WorkflowTransition

  async function handleAdd (): Promise<void> {
    showPopup(AddRulesPopup, { workflow, transitions, statuses, transition, category: 'validate' }, 'center')
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
</style>
