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
  import type { IntlString } from '@hcengineering/platform'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import type { IconComponent } from '../../types'
  import type { BreadcrumbEvents, BreadcrumbProps } from './types'

  type $$Props = BreadcrumbProps
  type $$Events = BreadcrumbEvents

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let iconBox: boolean = true
  export let current: boolean = false
</script>

{#if current}
  <span class="breadcrumb breadcrumb--current" aria-current="page">
    {#if icon !== undefined}
      <span class="breadcrumb__icon" class:breadcrumb__icon--box={iconBox} aria-hidden="true">
        <Icon {icon} {iconProps} size="small" />
      </span>
    {/if}
    <span class="breadcrumb__label"><Label {label} params={labelParams} /></span>
  </span>
{:else}
  <button class="breadcrumb" type="button" on:click>
    {#if icon !== undefined}
      <span class="breadcrumb__icon" class:breadcrumb__icon--box={iconBox} aria-hidden="true">
        <Icon {icon} {iconProps} size="small" />
      </span>
    {/if}
    <span class="breadcrumb__label"><Label {label} params={labelParams} /></span>
  </button>
{/if}

<style lang="scss">
  .breadcrumb {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-0_75);
    margin: 0;
    padding: 0 var(--spacing-1);
    min-width: 0;
    height: var(--global-small-Size);
    font: inherit;
    font-size: 1rem;
    font-weight: 700;
    color: var(--global-secondary-TextColor);
    background: none;
    border: none;
    border-radius: var(--small-BorderRadius);

    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      height: var(--global-extra-small-Size);
      color: var(--global-secondary-TextColor);

      &--box {
        width: var(--global-extra-small-Size);
        // The legacy plate: half of the hover one, which is also valid in the dark theme.
        background-color: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 50%, transparent);
        border-radius: var(--extra-small-BorderRadius);
      }
    }
    &__label {
      overflow: hidden;
      line-height: 1.25rem;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  // Weights as in the legacy crumbs: same color, the bolder current one tells where you are.
  button.breadcrumb {
    font-weight: 500;
    cursor: pointer;

    // A step darker, not the full text color or an accent: the crumb stays quiet.
    &:hover {
      color: color-mix(in srgb, var(--global-secondary-TextColor) 45%, var(--global-primary-TextColor));

      .breadcrumb__icon--box {
        background-color: var(--global-ui-hover-BackgroundColor);
      }
    }
    &:focus-visible {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
  }
</style>
