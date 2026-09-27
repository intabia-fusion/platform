<!--
//
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
  import { onDestroy, onMount } from 'svelte'
  import type { IntlString } from '@hcengineering/platform'
  import { location } from '../location'
  import Label from './Label.svelte'

  export let target: HTMLElement
  export let hint: IntlString | undefined = undefined
  export let hintParams: Record<string, any> = {}
  export let onClose: () => void

  const pad = 6
  let rect: DOMRect = target.getBoundingClientRect()
  let raf = 0
  // One rAF loop instead of scroll/resize listeners: overlay lives a few seconds at most.
  function tick (): void {
    rect = target.getBoundingClientRect()
    raf = requestAnimationFrame(tick)
  }

  function onKeydown (e: KeyboardEvent): void {
    if (e.key === 'Escape') onClose()
  }

  let started = false
  const unsubLocation = location.subscribe(() => {
    // First call is the initial value, ignore it.
    if (started) onClose()
  })

  onMount(() => {
    raf = requestAnimationFrame(tick)
    started = true
    // Any press closes it; the backdrop lets clicks through, so the target or another widget link still works.
    window.addEventListener('pointerdown', onClose, { capture: true })
    const timeout = setTimeout(onClose, 8000)
    return () => {
      clearTimeout(timeout)
    }
  })

  onDestroy(() => {
    cancelAnimationFrame(raf)
    unsubLocation()
    window.removeEventListener('pointerdown', onClose, { capture: true })
  })

  $: top = rect.top - pad
  $: left = rect.left - pad
  $: width = rect.width + pad * 2
  $: height = rect.height + pad * 2
  $: hintBelow = rect.bottom + 96 < window.innerHeight
</script>

<svelte:window on:keydown={onKeydown} />

<div class="spotlight-backdrop" style:top="0" style:left="0" style:right="0" style:height={`${top}px`} />
<div class="spotlight-backdrop" style:top={`${top + height}px`} style:left="0" style:right="0" style:bottom="0" />
<div
  class="spotlight-backdrop"
  style:top={`${top}px`}
  style:left="0"
  style:width={`${left}px`}
  style:height={`${height}px`}
/>
<div
  class="spotlight-backdrop"
  style:top={`${top}px`}
  style:left={`${left + width}px`}
  style:right="0"
  style:height={`${height}px`}
/>

<div
  class="spotlight-ring"
  style:top={`${top}px`}
  style:left={`${left}px`}
  style:width={`${width}px`}
  style:height={`${height}px`}
/>

{#if hint}
  <div
    class="spotlight-hint"
    class:below={hintBelow}
    style:left={`${Math.max(8, rect.left)}px`}
    style:top={hintBelow ? `${top + height + 8}px` : undefined}
    style:bottom={!hintBelow ? `${window.innerHeight - top + 8}px` : undefined}
  >
    <Label label={hint} params={hintParams} />
  </div>
{/if}

<style lang="scss">
  .spotlight-backdrop {
    position: fixed;
    z-index: 10000;
    background-color: rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  .spotlight-ring {
    position: fixed;
    z-index: 10001;
    pointer-events: none;
    border: 2px solid var(--primary-button-default);
    border-radius: var(--medium-BorderRadius);
    animation: spotlight-pulse 1.4s ease-in-out infinite;
  }

  .spotlight-hint {
    position: fixed;
    z-index: 10001;
    max-width: 18rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    box-shadow: var(--theme-popup-shadow);
    color: var(--theme-caption-color);
    font-size: 0.8125rem;
    pointer-events: none;
  }

  @keyframes spotlight-pulse {
    0% {
      box-shadow: 0 0 0 0 var(--primary-button-default);
    }
    70% {
      box-shadow: 0 0 0 8px transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }
</style>
