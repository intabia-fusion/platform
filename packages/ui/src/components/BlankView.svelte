<!--
// Copyright © 2024 Hardcore Engineering Inc.
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

  import type { IconComponent } from '../types'
  import Icon from './Icon.svelte'
  import Label from './Label.svelte'

  export let icon: IconComponent
  export let header: IntlString
  export let label: IntlString | undefined = undefined
  export let drop: (() => void) | undefined = undefined
  export let active: boolean = false
</script>

<!-- A drop area is one big button: a small one would be a second, harder target. -->
<div class="wrap" class:drop-area={drop != null}>
  <!-- svelte-ignore a11y-no-static-element-interactions : the click is bound only when the element is a button -->
  <svelte:element
    this={drop != null ? 'button' : 'div'}
    class="root"
    class:drop={drop != null}
    class:active
    type={drop != null ? 'button' : undefined}
    on:click={drop}
  >
    <span class="blank-icon"><Icon {icon} size="large" /></span>
    <span class="blank-header"><Label label={header} /></span>
    {#if label}
      <span class="blank-hint"><Label {label} /></span>
    {/if}
    {#if drop == null && $$slots.default}
      <div class="actions">
        <slot />
      </div>
    {/if}
  </svelte:element>
</div>

<style lang="scss">
  .root {
    display: flex;
    align-self: center;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.375rem;
    width: 30rem;
    max-width: 100%;
    height: 100%;
    margin-inline: auto;
    text-align: center;
    color: var(--theme-dark-color);
  }

  .blank-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 50%;
    color: var(--theme-dark-color);
    background-color: color-mix(in srgb, var(--theme-caption-color) 5%, transparent);

    :global(svg) {
      width: 1.75rem;
      height: 1.75rem;
    }
  }

  .blank-header {
    margin-top: 0.625rem;
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--theme-caption-color);
  }

  .blank-hint {
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  // Only a drop area frames its content; otherwise the wrapper is out of the layout.
  .wrap {
    display: contents;
  }

  .drop-area {
    display: flex;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 1rem;
  }

  .root.drop {
    width: 100%;
    border: 1px dashed var(--theme-divider-color);
    border-radius: var(--large-BorderRadius);
    background: none;
    font: inherit;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;

    // Only dragged files tint the fill; the pointer marks just the frame.
    &:hover {
      border-color: color-mix(in srgb, var(--button-brand-BackgroundColor) 70%, transparent);
      background-color: color-mix(in srgb, var(--theme-caption-color) 3%, transparent);
    }

    &.active {
      border-color: var(--button-brand-BackgroundColor);
      background-color: color-mix(in srgb, var(--button-brand-BackgroundColor) 5%, transparent);
    }

    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }
  }
</style>
