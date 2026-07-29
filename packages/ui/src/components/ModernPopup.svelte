<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import { createEventDispatcher } from 'svelte'
  import type { DropdownIntlItem } from '../types'
  import IconCheck from './icons/Check.svelte'
  import Label from './Label.svelte'
  import Scroller from './Scroller.svelte'
  import Icon from './Icon.svelte'
  import { resizeObserver } from '..'
  import { capitalizeFirstLetter, formatKey } from '../utils'

  export let items: DropdownIntlItem[]
  export let selected: DropdownIntlItem['id'] | undefined = undefined
  export let params: Record<string, any> = {}

  const dispatch = createEventDispatcher()
  const btns: HTMLButtonElement[] = []

  const keyDown = (ev: KeyboardEvent, n: number): void => {
    if (ev.key === 'ArrowDown') {
      if (n === btns.length - 1) btns[0]?.focus()
      else btns[n + 1]?.focus()
    } else if (ev.key === 'ArrowUp') {
      if (n === 0) btns[btns.length - 1]?.focus()
      else btns[n - 1]?.focus()
    }
  }
  $: withIcons = items.some((it) => it.icon !== undefined)
</script>

<div class="hulyPopup-container" use:resizeObserver={() => dispatch('changeContent')}>
  <Scroller padding={'var(--spacing-0_5)'} gap={'flex-gap-0-5'}>
    {#each items as item, i}
      {#if item.separatorBefore || item.separatorLabel}
        {#if item.separatorLabel}
          <div class="hulyPopup-category">
            <div class="hulyPopup-line" />
            <span class="hulyPopup-category-label">
              <Label label={item.separatorLabel} params={item.params ?? params} />
            </span>
            <div class="hulyPopup-line" />
          </div>
        {:else}
          <div class="hulyPopup-divider" />
        {/if}
      {/if}
      <!-- svelte-ignore a11y-mouse-events-have-key-events -->
      <button
        class="hulyPopup-row"
        class:withKeys={item.keys}
        bind:this={btns[i]}
        on:mouseover={(ev) => {
          ev.currentTarget.focus()
        }}
        on:keydown={(ev) => {
          keyDown(ev, i)
        }}
        on:click={() => {
          dispatch('close', item.id)
        }}
      >
        {#if withIcons}
          <div class="hulyPopup-row__icon">
            {#if item.icon}<Icon icon={item.icon} iconProps={item.iconProps} size={'small'} />{/if}
          </div>
        {/if}
        {#if item.description}
          <div class="hulyPopup-row__labels-wrapper">
            <div class="hulyPopup-row__label overflow-label">
              <Label label={item.label} params={item.params ?? params} />
            </div>
            <div class="hulyPopup-row__label small dark">
              <Label label={item.description} params={item.paramsDescription ?? params} />
            </div>
          </div>
        {:else}
          <div class="hulyPopup-row__label"><Label label={item.label} params={item.params ?? params} /></div>
        {/if}
        {#if item.keys}
          <div class="hulyPopup-row__keys">
            {#each item.keys as key, j}
              {#if j !== 0}
                <div class="mr-1 ml-1">/</div>
              {/if}
              {#each formatKey(key) as k}
                <div class="key">
                  {#each k as kk, j}
                    {#if j !== 0}
                      +
                    {/if}
                    {capitalizeFirstLetter(kk.trim())}
                  {/each}
                </div>
              {/each}
            {/each}
          </div>
        {/if}
        {#if item.id === selected}
          <div class="hulyPopup-row__icon">
            <IconCheck size={'small'} />
          </div>
        {/if}
      </button>
    {/each}
  </Scroller>
</div>

<style lang="scss">
  .hulyPopup-category {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-1_5) var(--spacing-1) var(--spacing-0_5) var(--spacing-1);
    min-width: 0;
    overflow: hidden;

    &-label {
      font-size: 0.625rem;
      font-weight: 500;
      color: var(--global-tertiary-TextColor);
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .hulyPopup-line {
      flex: 1;
      height: 1px;
      background-color: var(--theme-popup-divider);
      min-width: 0.5rem;
    }
  }
</style>
