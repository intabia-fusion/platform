<!--
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
-->
<script lang="ts">
  // AccentPreview
  // Small preview box shown on the left side of the screen when hovering an accent.
  // Shows several controls (buttons, checkboxes, list) to help choose an accent.
  import { themeStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'
  import PreviewControls from './PreviewControls.svelte'

  interface AccentOption {
    id: string
    name: string
    color: string
  }

  export let accent: AccentOption | undefined = {
    id: 'accent-default',
    name: 'Accent',
    color: '#205DC2'
  }

  // Rectangle of hovered element (optional)
  export let anchorRect: DOMRect | null = null

  export let usePopupStyle: boolean = true

  // keep the dispatcher simple (avoid inline generic which sometimes confuses parsers)
  const dispatch = createEventDispatcher()

  let previewEl: HTMLElement | null = null

  let posLeft = 12
  let posTop = 120

  function clamp (v: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, v))
  }

  // Recompute popup position when anchor or size changes (try to place it next to settings popup)
  $: if (previewEl != null && anchorRect != null) {
    const ph = previewEl.offsetHeight
    const pw = previewEl.offsetWidth
    const proposed = Math.round(anchorRect.top + anchorRect.height / 2 - ph / 2)
    posTop = clamp(proposed, 8, Math.max(8, window.innerHeight - ph - 8))

    // Try to find the nearest settings popup container ('.ap-box') around the anchor
    // and use its rect for horizontal placement so the preview appears next to the popup.
    let rectToUse = anchorRect
    const cx = anchorRect.left + anchorRect.width / 2
    const cy = anchorRect.top + anchorRect.height / 2
    const el = document.elementFromPoint(cx, cy)
    const popupEl = el?.closest('.ap-box')
    if (popupEl != null && popupEl instanceof HTMLElement) {
      rectToUse = popupEl.getBoundingClientRect()
    }

    const gap = 8
    const rightPos = Math.round(rectToUse.right + gap)
    const leftPos = Math.round(rectToUse.left - pw - gap)

    // Prefer left side of the settings popup; if not enough space, place to its right.
    if (leftPos >= 8) {
      posLeft = Math.max(8, leftPos)
    } else if (rightPos + pw + 8 <= window.innerWidth) {
      posLeft = Math.max(8, rightPos)
    } else {
      // fallback: keep inside viewport
      posLeft = Math.max(8, Math.min(leftPos, window.innerWidth - pw - 8))
    }
  } else if (previewEl != null) {
    // Center vertically if no anchor provided
    posTop = Math.round(window.innerHeight / 2 - previewEl.offsetHeight / 2)
    // Default to horizontal center if no anchor available
    posLeft = Math.max(8, Math.round(window.innerWidth / 2 - previewEl.offsetWidth / 2))
  }

  function handleMouseEnter (): void {
    dispatch('enter')
  }
  function handleMouseLeave (): void {
    dispatch('leave')
  }
</script>

<div
  bind:this={previewEl}
  class="accent-preview {accent?.id ??
    'accent-huly'} {`accent-${$themeStore.dark ? 'dark' : 'light'}-${(accent?.id ?? 'accent-huly').replace('accent-', '')}`}"
  role="dialog"
  aria-label="Accent preview"
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
  style="
     left: {posLeft}px;
     top: {posTop}px;
   "
>
  <PreviewControls {accent} />
</div>

<style lang="scss">
  .accent-preview {
    position: fixed;
    width: 450px;
    padding: 0.75rem;
    background: var(--theme-bg-color);
    border-radius: 0.5rem;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.16);
    z-index: 10000;
    pointer-events: auto;
    border: 1px solid var(--theme-divider-color);
    transition:
      transform 0.12s ease,
      opacity 0.12s ease;
    transform-origin: left center;
    color: var(--theme-content-color);
  }

  /* no extra overrides required */
</style>
