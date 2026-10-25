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
  import { translateCB } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import ui from '../../plugin'
  import Breadcrumb from './Breadcrumb.svelte'
  import type { BreadcrumbsEvents, BreadcrumbsItem, BreadcrumbsProps } from './types'

  type $$Props = BreadcrumbsProps
  type $$Events = BreadcrumbsEvents
  interface $$Slots {
    after: Record<string, never>
  }

  export let items: BreadcrumbsItem[]

  const dispatch = createEventDispatcher<{ select: number }>()

  // Several navigation landmarks on a page need names; the place's own name wins.
  $: named = $$restProps['aria-label'] !== undefined || $$restProps['aria-labelledby'] !== undefined
  $: translateDefaultName(named, $languageStore === '' ? undefined : $languageStore)

  let defaultName: string | undefined
  let translation = 0

  function translateDefaultName (hasName: boolean, language: string | undefined): void {
    const request = ++translation
    if (hasName) {
      defaultName = undefined
      return
    }
    translateCB(ui.string.Breadcrumbs, {}, language, (text) => {
      if (request === translation) defaultName = text
    })
  }
</script>

<nav class="breadcrumbs" {...$$restProps} aria-label={$$restProps['aria-label'] ?? defaultName}>
  <ol class="breadcrumbs__list" style:--_path={items.length - 1}>
    {#each items as item, i}
      <li class="breadcrumbs__item">
        {#if i !== 0}
          <span class="breadcrumbs__separator" aria-hidden="true"
            ><Icon icon={ui.icon.ChevronRight} size="small" /></span
          >
        {/if}
        <Breadcrumb
          label={item.label}
          labelParams={item.labelParams}
          icon={item.icon}
          iconProps={item.iconProps}
          iconBox={item.iconBox ?? true}
          current={i === items.length - 1}
          on:click={() => dispatch('select', i)}
        />
      </li>
    {/each}
  </ol>
  {#if $$slots.after}
    <span class="breadcrumbs__after"><slot name="after" /></span>
  {/if}
</nav>

<style lang="scss">
  .breadcrumbs {
    // A collapsed path crumb: separator, padding and icon.
    --_crumb-min: calc(1rem + var(--spacing-1) * 2 + var(--global-extra-small-Size));

    // No gap: the crumb's own padding spaces the badge, as in the legacy breadcrumbs.
    display: flex;
    align-items: center;
    min-width: 0;

    &__list {
      display: flex;
      align-items: center;
      margin: 0;
      padding: 0;
      min-width: 0;
      list-style: none;
    }
    &__item {
      display: flex;
      align-items: center;
      min-width: 0;

      // The path gives way first, down to its icons; the current page keeps its width and truncates only then.
      &:not(:last-child) {
        overflow: hidden;
        min-width: var(--_crumb-min);
      }
      &:first-child:not(:last-child) {
        min-width: calc(var(--_crumb-min) - 1rem);
      }
      &:last-child:not(:first-child) {
        flex-shrink: 0;
        max-width: calc(100% - var(--_path) * var(--_crumb-min) + 1rem);
      }
    }
    // The clipped path item would cut an outer focus ring.
    &__item:not(:last-child) :global(.breadcrumb:focus-visible) {
      outline-offset: -2px;
    }
    &__separator {
      display: inline-flex;
      flex-shrink: 0;
      color: var(--global-tertiary-TextColor);
    }
    &__after {
      flex-shrink: 0;
      overflow: hidden;
      padding: var(--spacing-0_25) var(--spacing-0_5);
      max-width: 10rem;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1rem;
      white-space: nowrap;
      text-overflow: ellipsis;
      text-transform: uppercase;
      color: var(--global-secondary-TextColor);
      background-color: var(--global-ui-hover-BackgroundColor);
      border-radius: var(--min-BorderRadius);

      // A place hides its badge by rendering nothing into the slot.
      &:empty {
        display: none;
      }
    }
  }
</style>
