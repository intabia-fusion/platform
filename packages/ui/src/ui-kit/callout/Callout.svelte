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

  import Label from '../../components/Label.svelte'
  import StatusIcon from '../status-icon/StatusIcon.svelte'
  import type { StatusIconTone } from '../status-icon/types'
  import type { CalloutProps, CalloutSlots, CalloutTone } from './types'

  type $$Props = CalloutProps
  type $$Slots = CalloutSlots

  export let tone: CalloutTone = 'info'
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let title: IntlString | undefined = undefined
  export let titleParams: Record<string, any> = {}

  $: iconTone = tone as StatusIconTone
</script>

<div class="callout callout--{tone}" role={tone === 'error' ? 'alert' : 'status'}>
  <span class="callout__icon"><StatusIcon tone={iconTone} kind="outline" /></span>
  <div class="callout__body">
    {#if title !== undefined}
      <div class="callout__title"><Label label={title} params={titleParams} /></div>
    {/if}
    {#if label !== undefined}<Label {label} params={labelParams} />{/if}
    <slot />
  </div>
  {#if $$slots.actions}
    <div class="callout__actions"><slot name="actions" /></div>
  {/if}
</div>

<style lang="scss">
  .callout {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-0_75);
    min-width: 0;
    padding: var(--spacing-1) var(--spacing-1_5);
    font-size: 0.75rem;
    line-height: 1.125rem;
    color: var(--_text);
    background-color: color-mix(in srgb, var(--_tone) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--_tone) 30%, transparent);
    border-radius: var(--small-BorderRadius);

    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      // Centres the 1rem icon on the first 1.125rem line.
      margin-top: 0.0625rem;
    }
    &__body {
      flex-grow: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    &__title {
      font-weight: 600;
    }
    &__actions {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-0_5);
      // The buttons are taller than a line: they keep to the panel padding instead of stretching it.
      margin: calc(-1 * var(--spacing-0_5)) 0;
    }

    &--info {
      --_tone: var(--kit-button-primary-BackgroundColor);
      --_text: var(--global-primary-TextColor);
    }
    &--positive {
      --_tone: var(--button-positive-BackgroundColor);
      --_text: var(--global-primary-TextColor);
    }
    &--warning {
      --_tone: var(--theme-warning-color);
      --_text: var(--theme-warning-color);
    }
    &--error {
      --_tone: var(--global-error-TextColor);
      --_text: var(--global-error-TextColor);
    }
  }
</style>
