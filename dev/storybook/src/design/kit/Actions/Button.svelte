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
  import Icon from '../Icon.svelte'
  import type { IconName } from '../types'

  export let kind: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'negative' | 'brand' = 'secondary'
  export let size: 'large' | 'medium' | 'small' | 'extra-small' = 'medium'
  export let icon: IconName | undefined = undefined
  export let label: string | undefined = undefined
  // Dropdown chevron after the label
  export let menu: boolean = false
  export let pressed: boolean = false
</script>

<button
  type="button"
  class="kit-button {kind} {size}"
  class:pressed
  class:icon-only={label === undefined || label === ''}
>
  {#if icon !== undefined}<Icon name={icon} size={16} />{/if}
  {#if label !== undefined && label !== ''}<span class="label">{label}</span>{/if}
  {#if menu}<Icon name="chevronD" size={14} />{/if}
</button>

<style lang="scss">
  .kit-button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-1);
    padding: 0 var(--spacing-2);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.15;
    white-space: nowrap;
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    outline: none;

    &.large {
      height: var(--global-large-Size);
      border-radius: var(--medium-BorderRadius);
    }
    &.medium {
      height: var(--global-medium-Size);
      border-radius: var(--medium-BorderRadius);
    }
    &.small {
      height: var(--global-small-Size);
      gap: var(--spacing-0_5);
      padding: 0 var(--spacing-1);
      border-radius: var(--small-BorderRadius);
    }
    &.extra-small {
      height: var(--global-extra-small-Size);
      gap: var(--spacing-0_5);
      padding: 0 var(--spacing-1);
      border-radius: var(--extra-small-BorderRadius);
    }
    &.icon-only {
      padding: 0;
      width: var(--global-medium-Size);
    }
    &.icon-only.large {
      width: var(--global-large-Size);
    }
    &.icon-only.small {
      width: var(--global-small-Size);
    }
    &.icon-only.extra-small {
      width: var(--global-extra-small-Size);
    }

    &.primary {
      color: var(--button-accent-LabelColor);
      background-color: var(--button-primary-BackgroundColor);
      border-color: var(--button-primary-BorderColor);
    }
    &.secondary {
      color: var(--button-subtle-LabelColor);
      background-color: var(--button-secondary-BackgroundColor);
      border-color: var(--button-secondary-BorderColor);
      &.pressed {
        background-color: var(--button-secondary-active-BackgroundColor);
      }
    }
    &.tertiary {
      color: var(--button-tertiary-LabelColor);
    }
    &.ghost {
      color: var(--global-primary-TextColor);
    }
    &.negative {
      color: var(--button-negative-LabelColor);
      background-color: var(--button-negative-BackgroundColor);
      border-color: var(--button-negative-BorderColor);
    }
    &.brand {
      color: #fff;
      background-color: var(--primary-button-default);
    }
  }
</style>
