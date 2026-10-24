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
  // Zoom and pan of a world of absolutely placed content: wheel, pinch, drag, fit and 100% buttons.
  // Shared by the screen canvas and the Kit catalog windows.
  import { tick } from 'svelte'

  // Region of the world that "Fit all" brings into view
  export let bounds: { x: number, y: number, w: number, h: number } | undefined = undefined
  export let view: HTMLDivElement | undefined = undefined
  export let k = 1
  export let tx = 0
  export let ty = 0
  // True after a drag: lets a click handler ignore the click that ends the pan
  export let dragged = false

  const MIN = 0.02
  const MAX = 4

  // While the view moves the world stays one bitmap layer; after a pause it re-rasters sharp
  let moving = false
  let still: ReturnType<typeof setTimeout> | undefined
  function moved (): void {
    moving = true
    clearTimeout(still)
    still = setTimeout(() => (moving = false), 200)
  }

  export async function fit (): Promise<void> {
    await tick()
    if (bounds === undefined || view === undefined) return
    const r = { width: view.clientWidth, height: view.clientHeight }
    const pad = 48
    // Never above 100%: a small frame such as the rail would come out blurry and oversized
    k = Math.min(1, Math.max(MIN, Math.min((r.width - pad * 2) / bounds.w, (r.height - pad * 2) / bounds.h)))
    tx = (r.width - bounds.w * k) / 2 - bounds.x * k
    ty = (r.height - bounds.h * k) / 2 - bounds.y * k
  }

  function zoomAt (to: number, cx: number, cy: number): void {
    const next = Math.min(MAX, Math.max(MIN, to))
    moved()
    tx = cx - ((cx - tx) * next) / k
    ty = cy - ((cy - ty) * next) / k
    k = next
  }

  function actual (): void {
    if (view !== undefined) zoomAt(1, view.clientWidth / 2, view.clientHeight / 2)
  }

  function onWheel (e: WheelEvent): void {
    if (view === undefined) return
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      // Storybook toolbar zoom scales the iframe body, so client pixels differ from canvas pixels
      const r = view.getBoundingClientRect()
      const z = view.clientWidth / r.width
      zoomAt(
        k * Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.01),
        (e.clientX - r.left) * z,
        (e.clientY - r.top) * z
      )
    } else {
      moved()
      tx -= e.deltaX
      ty -= e.deltaY
    }
  }

  function onDown (e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1) return
    dragged = false
    let lastX = e.clientX
    let lastY = e.clientY
    const move = (m: PointerEvent): void => {
      if (Math.abs(m.clientX - e.clientX) + Math.abs(m.clientY - e.clientY) > 3) dragged = true
      if (!dragged) return
      moved()
      tx += m.clientX - lastX
      ty += m.clientY - lastY
      lastX = m.clientX
      lastY = m.clientY
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
</script>

<svelte:window on:resize={fit} />

<div class="canvas" bind:this={view} on:wheel|nonpassive={onWheel} on:pointerdown={onDown} role="presentation">
  <slot name="note" />
  <div class="world" class:moving style:transform="translate({tx}px, {ty}px) scale({k})">
    <slot />
  </div>
  <!-- Labels sit in screen pixels outside the world: a scale-dependent style inside it restyles every node on zoom -->
  <slot name="overlay" {k} {tx} {ty} />
  <div class="tools">
    <button type="button" on:click={fit}>Fit all</button>
    <button type="button" on:click={actual}>100%</button>
    <span>{Math.round(k * 100)}%</span>
  </div>
</div>

<style lang="scss">
  .canvas {
    // Fills the body, which Storybook toolbar zoom resizes; 100vw/100vh would leave part of the panel empty
    position: fixed;
    inset: 0;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    background-color: color-mix(in srgb, var(--theme-bg-color) 80%, #808080);
  }
  .world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;

    &.moving {
      will-change: transform;
    }
  }
  .tools {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--small-BorderRadius);
    box-shadow: var(--popup-shadow);

    button {
      padding: 0.25rem 0.5rem;
      font: inherit;
      color: var(--theme-caption-color);
      cursor: pointer;
      background: transparent;
      border: 1px solid var(--theme-divider-color);
      border-radius: var(--extra-small-BorderRadius);
    }
  }
</style>
