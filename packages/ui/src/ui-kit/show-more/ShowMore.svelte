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
  import { createEventDispatcher, onMount } from 'svelte'

  import { resizeObserver } from '../../resize'
  import ShowMoreToggle from './ShowMoreToggle.svelte'
  import type { ShowMoreEvents, ShowMoreProps } from './types'

  type $$Props = ShowMoreProps
  type $$Events = ShowMoreEvents

  export let limit: number = 240
  export let open: boolean = false
  export let disabled: boolean = false
  export let expandable: boolean = true

  const dispatch = createEventDispatcher<{ toggle: boolean }>()
  const contentId = `show-more-${Math.random().toString(36).slice(2, 10)}`

  let height = 0
  let viewport: HTMLElement
  let content: HTMLElement

  $: overflows = !disabled && height > limit
  $: cropped = overflows && !(open && expandable)
  $: withButton = overflows && expandable

  function toggle (): void {
    open = !open
    dispatch('toggle', open)
  }

  // The observer reports a frame later: measuring right away keeps tall content from showing in full first.
  onMount(() => {
    height = content.clientHeight
  })

  // Tab can land on a link below the fold: show the rest, otherwise the focus would be invisible.
  function handleFocusIn (event: FocusEvent): void {
    if (!cropped || !withButton || !(event.target instanceof HTMLElement)) return
    if (event.target.getBoundingClientRect().bottom > viewport.getBoundingClientRect().top + limit) toggle()
  }
</script>

<div class="show-more" class:show-more--button={withButton} class:show-more--open={withButton && open}>
  <div
    id={contentId}
    bind:this={viewport}
    class="show-more__viewport"
    class:show-more__viewport--cropped={cropped}
    style:max-height={cropped ? `${limit}px` : undefined}
    on:focusin={handleFocusIn}
  >
    <div
      bind:this={content}
      class="show-more__content"
      use:resizeObserver={(element) => {
        height = element.clientHeight
      }}
    >
      <slot />
    </div>
  </div>
  {#if withButton}
    <div class="show-more__toggle">
      <ShowMoreToggle {open} controls={contentId} on:toggle={toggle} />
    </div>
  {/if}
</div>

<style lang="scss">
  .show-more {
    position: relative;
    min-width: 0;
    min-height: 0;

    &__viewport--cropped {
      // Unlike hidden, clip does not let focus scroll the cropped content out of place.
      overflow: clip;
      mask: linear-gradient(to top, transparent 0, black 5rem);
    }

    // Cropped, the pill sits in the clear strip at the bottom; open, it gets its own room under the content.
    // The strip under the pill is clear, so the pill never sits on half-faded letters; short content keeps its top.
    &--button &__viewport--cropped {
      mask: linear-gradient(to top, transparent 0, transparent 1.75rem, black min(5.5rem, 75%));
    }
    &__toggle {
      position: absolute;
      left: 50%;
      bottom: var(--spacing-0_5);
      display: flex;
      transform: translateX(-50%);
    }
    &--open {
      padding-bottom: calc(1.75rem + var(--spacing-1_5));
    }
  }
</style>
