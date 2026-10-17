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
  import type { IntlString } from '@hcengineering/platform'
  import type { TaskType } from '@hcengineering/task'
  import presentation from '@hcengineering/presentation'
  import { IconClose, Label } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import TaskTypeIcon from './TaskTypeIcon.svelte'

  // Undefined type renders a label-only chip
  export let value: TaskType | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let kind: 'normal' | 'muted' | 'current' = 'normal'
  export let removable: boolean = false
  export let clickable: boolean = false
  // Small "this type" marker
  export let mark: IntlString | undefined = undefined

  const dispatch = createEventDispatcher()
</script>

<div class="chip {kind}" class:clickable>
  <button type="button" class="body" disabled={!clickable} on:click={() => dispatch('open')}>
    {#if value !== undefined}
      <TaskTypeIcon {value} size="small" />
      <span class="name">{value.name}</span>
    {:else if label !== undefined}
      <span class="name"><Label {label} /></span>
    {/if}
    {#if mark !== undefined}
      <span class="mark"><Label label={mark} /></span>
    {/if}
  </button>
  {#if removable}
    <IconButton
      kind="tertiary"
      size="min"
      icon={IconClose}
      inheritColor
      tooltip={{ label: presentation.string.Remove }}
      on:click={() => dispatch('remove')}
    />
  {/if}
</div>

<style lang="scss">
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 999px;
    background: var(--theme-button-default);
    color: var(--global-primary-TextColor);
    max-width: 16rem;

    &.muted {
      background: transparent;
      color: var(--global-secondary-TextColor);
    }
    &.current {
      border-color: var(--global-accent-BorderColor);
      background: var(--global-ui-highlight-BackgroundColor);
      font-weight: 500;
    }
  }

  .body {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: default;

    .clickable & {
      cursor: pointer;
    }
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mark {
    flex-shrink: 0;
    font-size: 0.6875rem;
    color: var(--global-secondary-TextColor);
  }
</style>
