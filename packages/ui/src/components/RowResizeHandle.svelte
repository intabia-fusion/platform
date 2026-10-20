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
  import { createEventDispatcher, onDestroy } from 'svelte'

  import { deviceOptionsStore } from '..'

  /** Current row height, rem. Kept a prop so the owner stays the only source of truth. */
  export let height: number
  export let min: number
  export let max: number

  const dispatch = createEventDispatcher<{ resize: number }>()

  let resizing = false
  let stopResize: (() => void) | undefined

  function startResize (event: PointerEvent): void {
    if (event.button !== 0) return
    event.preventDefault()
    stopResize?.()

    const fontSize = $deviceOptionsStore.fontSize
    const startY = event.clientY
    const startHeight = height

    const body = document.body
    body.style.userSelect = 'none'
    body.style.webkitUserSelect = 'none'
    body.style.pointerEvents = 'none'
    body.style.cursor = 'row-resize'
    resizing = true

    const move = (ev: PointerEvent): void => {
      dispatch('resize', Math.min(Math.max(startHeight + (ev.clientY - startY) / fontSize, min), max))
    }
    const up = (): void => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      body.style.userSelect = ''
      body.style.webkitUserSelect = ''
      body.style.pointerEvents = ''
      body.style.cursor = ''
      resizing = false
      stopResize = undefined
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    stopResize = up
  }

  // A drag in progress must not outlive the component: its row is gone, the handler would keep it alive.
  onDestroy(() => {
    stopResize?.()
  })
</script>

<div
  class="row-resize"
  class:resizing
  role="separator"
  aria-orientation="horizontal"
  on:pointerdown|capture={(event) => {
    event.stopPropagation()
    startResize(event)
  }}
/>

<style lang="scss">
  .row-resize {
    position: relative;
    height: 0;
    cursor: row-resize;
    touch-action: none;

    // Hit area is wider than the line, and the line itself only shows on hover/drag.
    &::before,
    &::after {
      position: absolute;
      left: 0;
      width: 100%;
      content: '';
    }

    &::before {
      top: -4px;
      height: 8px;
    }

    &::after {
      top: -1px;
      height: 2px;
      background-color: var(--primary-button-default);
      transform: scaleY(0);
      transition: transform 0.1s ease-in-out;
    }

    &.resizing::after,
    &:hover::after {
      transform: scaleY(1);
    }
  }
</style>
