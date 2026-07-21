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
  import presentation from '@hcengineering/presentation'
  import ui, { Modal, Label, IconSearch, EditWithIcon, ModernDropdown, ListItem } from '@hcengineering/ui'
  import { getEmbeddedLabel, IntlString } from '@hcengineering/platform'
  import { Workflow, WorkflowTransition } from '@hcengineering/workflow'
  import { createEventDispatcher, ComponentType } from 'svelte'
  import { notEmpty, Status } from '@hcengineering/core'

  import plugin from '../../plugin'
  import AddValidator from './validators/AddValidator.svelte'
  import TransitionPresenter from './TransitionPresenter.svelte'
  import DumRuleCategory from './DumRuleCategory.svelte'

  type Category = 'all' | 'restrict' | 'request' | 'validate' | 'actions'

  export let workflow: Workflow
  export let transitions: WorkflowTransition[] = []
  export let statuses: Status[] = []
  export let transition: WorkflowTransition | undefined = undefined
  export let category: Category = 'all'

  const dispatch = createEventDispatcher()

  let searchQuery = ''
  let activeComponent: any = null

  $: transitionItems = (transitions ?? []).map(
    (t): ListItem => ({
      _id: t._id,
      label: t.name,
      component: TransitionPresenter,
      componentProps: { transition: t, statuses }
    })
  )

  $: selectedTransitionItem = transitionItems.find((it) => it._id === transition?._id) ?? transitionItems[0]

  function onSelectTransition (event: CustomEvent<ListItem>): void {
    const item = event.detail
    const found = (transitions ?? []).find((t) => t._id === item?._id)
    if (found) {
      transition = found
    }
  }

  async function save (): Promise<void> {
    if (activeComponent?.save) {
      await activeComponent.save()
    }
    dispatch('close')
  }

  const categories: {
    category: Category
    component: ComponentType
    label: IntlString
    icon?: string
  }[] = [
    { category: 'all', component: DumRuleCategory, label: plugin.string.AllRules },
    { category: 'restrict', component: DumRuleCategory, icon: '🔒', label: plugin.string.RestrictTransition },
    { category: 'request', component: DumRuleCategory, icon: '📑', label: plugin.string.RequestInput },
    { category: 'validate', component: AddValidator, icon: '✓', label: plugin.string.ValidateDetails },
    { category: 'actions', component: DumRuleCategory, icon: '➔', label: plugin.string.PerformActions }
  ]

  $: component = categories.find((it) => it.category === category)?.component

  function getTransitionTooltipText (item: ListItem | undefined): string | undefined {
    if (item == null) return undefined
    const transitionObj = transitions.find((it) => it._id === item?._id) ?? undefined
    if (transitionObj == null) return undefined

    const fromStatuses = (transitionObj?.from ?? [])
      .map((id) => (statuses ?? []).find((s) => s._id === id))
      .filter(notEmpty)

    const toStatus = (statuses ?? []).find((s) => s._id === transitionObj?.to)

    const fromNamesStr = fromStatuses.map((s) => s.name).join(', ') ?? '*'
    return `${transitionObj?.name ?? ''}: ${fromNamesStr} → ${toStatus?.name ?? ''}`
  }

  $: transitionTooltip = getTransitionTooltipText(selectedTransitionItem)
</script>

<Modal
  type="type-popup"
  okAction={save}
  okLabel={presentation.string.Add}
  canSave={transition != null}
  label={plugin.string.AddRule}
  maxWidth="80rem"
  padding="0"
  onCancel={() => dispatch('close')}
>
  <div class="rules-modal-layout">
    <!-- Left Sidebar -->
    <div class="rules-sidebar">
      <button class="sidebar-item" class:active={category === 'all'} on:click={() => (category = 'all')}>
        <span class="sidebar-label"><Label label={plugin.string.AllRules} /></span>
      </button>

      <div class="sidebar-group-header">
        <Label label={plugin.string.RuleTypes} />
      </div>

      {#each categories as c (c.category)}
        {#if c.category !== 'all'}
          <button class="sidebar-item" class:active={category === c.category} on:click={() => (category = c.category)}>
            {#if c.icon}
              <span class="sidebar-icon">{c.icon}</span>
            {/if}
            <span class="sidebar-label"><Label label={c.label} /></span>
          </button>
        {/if}
      {/each}
    </div>

    <!-- Right Main Content -->
    <div class="rules-content">
      <!-- Search bar -->
      <div class="search-bar">
        <EditWithIcon icon={IconSearch} placeholder={ui.string.SearchDots} bind:value={searchQuery} />
      </div>

      <!-- Select Transition -->
      <div class="hulyModal-content__settingsSet" style="padding: 0; min-width: 0; width: 100%;">
        <div
          class="hulyModal-content__settingsSet-line flex-gap-4"
          style="min-width: 0; width: 100%; overflow: hidden;"
        >
          <span class="label" style="flex-shrink: 0;"><Label label={plugin.string.Transition} /></span>
          <ModernDropdown
            items={transitionItems}
            tooltip={transitionTooltip ? { label: getEmbeddedLabel(transitionTooltip) } : undefined}
            selected={selectedTransitionItem}
            on:selected={onSelectTransition}
            placeholder={ui.string.NotSelected}
            justify="left"
            width="100%"
            showCheckmark={true}
            popupClass="wide"
            withSearch={false}
          />
        </div>
      </div>

      <!-- Rule Cards List -->
      <div class="rules-list">
        {#if component}
          <svelte:component
            this={component}
            bind:this={activeComponent}
            {transition}
            {workflow}
            {statuses}
            {searchQuery}
          />
        {/if}
      </div>
    </div>
  </div>
</Modal>

<style lang="scss">
  .rules-modal-layout {
    display: flex;
    width: 100%;
    min-height: 30rem;
    max-height: 80rem;
  }

  .rules-sidebar {
    width: 14rem;
    flex-shrink: 0;
    border-right: 1px solid var(--global-subtle-ui-BorderColor);
    padding: 1rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .sidebar-group-header {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--global-tertiary-TextColor);
    padding: 0.75rem 0.75rem 0.25rem 0.75rem;
    text-transform: uppercase;
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--small-BorderRadius, 0.375rem);
    border: none;
    background: transparent;
    color: var(--global-secondary-TextColor);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;

    &:hover {
      background-color: var(--global-ui-highlight-BackgroundColor);
      color: var(--global-primary-TextColor);
    }

    &.active {
      background-color: var(--global-primary-OptionColor, rgba(59, 130, 246, 0.1));
      color: var(--global-primary-TextColor);
      font-weight: 600;

      .sidebar-icon {
        color: var(--accent-button-default, #2563eb);
      }
    }

    .sidebar-icon {
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
    }

    .sidebar-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .rules-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    gap: 1rem;
    overflow-y: auto;
  }

  .search-bar {
    width: 100%;
  }

  .transition-select-block {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.625rem 0.875rem;
    border-radius: var(--small-BorderRadius, 0.375rem);
    background-color: var(--global-subtle-BackgroundColor);
    border: 1px solid var(--global-subtle-ui-BorderColor);

    .transition-label {
      text-transform: uppercase;
      font-weight: 600;
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
      white-space: nowrap;
      min-width: 5rem;
    }
  }

  .rules-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
</style>
