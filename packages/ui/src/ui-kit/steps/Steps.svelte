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
<script lang="ts" generics="Id extends string = string">
  import Label from '../../components/Label.svelte'
  import Checkmark from '../../components/icons/Checkmark.svelte'
  import ui from '../../plugin'
  import type { StepsItem, StepsProps } from './types'

  type $$Props = StepsProps<Id>

  export let items: ReadonlyArray<StepsItem<Id>>
  export let selected: Id | undefined = undefined

  $: selectedIndex = selected === undefined ? -1 : items.findIndex((item) => item.id === selected)
</script>

<ol class="steps" {...$$restProps}>
  {#each items as item, index (item.id)}
    {@const state = index < selectedIndex ? 'done' : index === selectedIndex ? 'current' : 'ahead'}
    <li
      class="steps__item steps__item--{state}"
      class:steps__item--reached={index <= selectedIndex}
      aria-current={state === 'current' ? 'step' : undefined}
    >
      <span class="steps__marker" aria-hidden="true">
        {#if state === 'done'}<Checkmark size="tiny" />{/if}
      </span>
      <span class="steps__label">{index + 1}. <Label label={item.label} params={item.labelParams} /></span>
      <!-- The check mark is a picture: the passed step is said in text. -->
      {#if state === 'done'}<span class="steps__passed"><Label label={ui.string.Completed} /></span>{/if}
    </li>
  {/each}
</ol>

<style lang="scss">
  .steps {
    --_done: var(--button-positive-BackgroundColor);
    // Gray of the unchecked Checkbox border: the not-visited fill is lost against the page.
    --_ahead: var(--global-tertiary-TextColor);
    --_gap: var(--spacing-3_5);

    display: flex;
    flex-direction: column;
    gap: var(--_gap);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: var(--font-family);
  }

  .steps__item {
    // The line ahead is as thin as the ring it leads to.
    --_line: 1.5px;

    position: relative;
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;

    // The connector to the previous step: colored once this step is reached.
    &:not(:first-child)::before {
      content: '';
      position: absolute;
      left: calc(var(--spacing-2) / 2 - var(--_line) / 2);
      bottom: calc(50% + var(--spacing-2) / 2);
      width: var(--_line);
      // Spans the gap plus the label overhang above and below the marker.
      height: calc(var(--_gap) + 100% - var(--spacing-2));
      border-radius: 1px;
      background-color: var(--_ahead);
    }
    &--reached {
      --_line: 2px;
    }
    &--reached:not(:first-child)::before {
      background-color: var(--_done);
    }
  }

  .steps__marker {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    box-sizing: border-box;
    width: var(--spacing-2);
    height: var(--spacing-2);
    border: 1.5px solid var(--_ahead);
    border-radius: 50%;
    background-color: transparent;
    color: var(--button-positive-IconColor);

    .steps__item--current & {
      border: 2px solid var(--_done);
    }
    .steps__item--done & {
      border-color: var(--_done);
      background-color: var(--_done);
    }
  }

  .steps__passed {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .steps__label {
    overflow: hidden;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.25rem;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--global-primary-TextColor);

    .steps__item--reached & {
      font-weight: 500;
    }
  }
</style>
