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
  import type { Asset } from '@hcengineering/platform'

  import Icon from '../../components/Icon.svelte'
  import ui from '../../plugin'
  import type { AnySvelteComponent } from '../../types'
  import type { KbdProps } from './types'

  type $$Props = KbdProps

  export let keys: string[]

  // Key names are the same in every language, so a symbol is read out by its name, not translated.
  const symbols: Record<string, { icon: Asset | AnySvelteComponent, name: string }> = {
    shift: { icon: ui.icon.ArrowFatUp, name: 'Shift' },
    option: { icon: ui.icon.Option, name: 'Option' },
    command: { icon: ui.icon.Command, name: 'Command' }
  }
</script>

<kbd class="kbd">
  {#each keys as key}
    {@const symbol = symbols[key]}
    <kbd class="kbd__key" class:kbd__key--text={symbol === undefined}>
      {#if symbol !== undefined}
        <span class="kbd__symbol" aria-hidden="true"><Icon icon={symbol.icon} size="x-small" /></span>
        <span class="kbd__name">{symbol.name}</span>
      {:else}
        {key}
      {/if}
    </kbd>
  {/each}
</kbd>

<style lang="scss">
  .kbd {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-0_5);
    font: inherit;

    &__key {
      position: relative;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-width: 1rem;
      height: 1rem;
      font-family: inherit;
      font-size: 0.6875rem;
      font-weight: 400;
      line-height: 1;
      color: inherit;
      // The legacy key plate: a blue-gray tint, the same as the breadcrumbs badge.
      background-color: var(--global-ui-hover-BackgroundColor);
      border-radius: var(--min-BorderRadius);

      &--text {
        padding: 0 var(--spacing-0_5);
      }
    }
    &__symbol {
      display: inline-flex;
    }
    // Read by screen readers, not drawn: the symbol stands for it.
    &__name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
