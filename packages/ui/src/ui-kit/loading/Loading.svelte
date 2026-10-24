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
  import { onMount } from 'svelte'

  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import Spinner from '../spinner/Spinner.svelte'
  import type { SpinnerSize } from '../spinner/types'
  import type { LoadingProps } from './types'

  type $$Props = LoadingProps

  export let size: SpinnerSize | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let delay: boolean = true

  // A polite live region inserted together with its text is often not read: the text follows the region.
  let settled = false
  onMount(() => {
    const timer = setTimeout(() => {
      settled = true
    }, 0)
    return () => {
      clearTimeout(timer)
    }
  })
</script>

<div class="loading" class:loading--delay={delay}>
  <div class="loading__row">
    <span class="loading__indicator">
      <!-- The one live region is here: a labelled spinner would add a second. -->
      <Spinner size={size ?? 'medium'} />
      <!-- Without a visible label the place still tells a screen reader it is loading. -->
      <span class="loading__status" class:loading__status--hidden={label === undefined} role="status">
        {#if settled}
          {#if label !== undefined}<Label {label} params={labelParams} />{:else}<Label label={ui.string.Loading} />{/if}
        {/if}
      </span>
    </span>
    <slot />
  </div>
  {#if $$slots.actions}
    <div class="loading__actions"><slot name="actions" /></div>
  {/if}
</div>

<style lang="scss">
  .loading {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-1);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;

    &__row {
      display: flex;
      align-items: center;
      // The slot text (a percent) continues the label, as after a space; the label keeps the colour of the place.
      gap: var(--spacing-0_5);
      min-width: 0;
    }
    &__indicator {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-0_75);
      min-width: 0;
    }
    &__status {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    &__status--hidden {
      position: absolute;
      overflow: hidden;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    &__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--spacing-1);
    }

    &--delay {
      opacity: 0;
      animation: appear 0.25s ease 0.25s forwards;
    }
  }

  @keyframes appear {
    to {
      opacity: 1;
    }
  }
</style>
