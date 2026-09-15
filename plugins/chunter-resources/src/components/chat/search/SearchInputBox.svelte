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
  import { deviceOptionsStore, IconClose, IconSearch, ModernButton, ModernEditbox } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  export let value: string = ''
  export let label: IntlString
  export let autoFocus: boolean = false
  export let kind: 'default' | 'ghost' | 'secondary' | 'transparent' = 'ghost'

  let element: HTMLInputElement | undefined = undefined

  export function focus (): void {
    element?.focus()
  }

  const dispatch = createEventDispatcher()
</script>

<div class="search-wrapper" on:focusin={() => dispatch('focus')} on:focusout={() => dispatch('blur')}>
  <ModernEditbox
    bind:element
    bind:value
    {label}
    {kind}
    size={'medium'}
    width={'100%'}
    autoFocus={autoFocus && !$deviceOptionsStore.isMobile}
    on:keydown
  >
    <div class="search-icon"><IconSearch size={'small'} /></div>
    <svelte:fragment slot="after">
      <slot name="filter" />
      {#if value !== ''}
        <ModernButton
          icon={IconClose}
          kind={'tertiary'}
          size={'small'}
          shape={'round'}
          on:click={() => {
            value = ''
            dispatch('clear')
            element?.focus()
          }}
        />
      {/if}
    </svelte:fragment>
  </ModernEditbox>
</div>

<style lang="scss">
  .search-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .search-icon {
    display: flex;
    align-items: center;
    color: var(--theme-darker-color);
    margin-right: 0.375rem;
  }
</style>
