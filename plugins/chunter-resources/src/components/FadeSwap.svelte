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
<script lang="ts" generics="T">
  import { onDestroy } from 'svelte'

  export let key: string
  export let item: T

  // Most loads end within it: a load just past it would flash the loading state for a moment.
  // The header outside switches at once, so the click is seen anyway.
  const waitMs = 300
  // The `.layer` opacity transition.
  const fadeMs = 100

  // Every switch gets a view of its own, as a remount gave: the one it leaves, or one it comes back to
  // while that still fades out, keeps the state of the visit (frozen, scrolled, its unread marker).
  // Two layers of one key can be on screen at once, so they go by `id`.
  interface Layer {
    id: number
    item: T
  }

  let layers: Layer[] = []
  let lastId = 0
  let lastKey: string | undefined = undefined
  let revealedId: number | undefined = undefined
  let revealTimer: ReturnType<typeof setTimeout> | undefined = undefined
  let dropFrame: number | undefined = undefined
  let dropTimer: ReturnType<typeof setTimeout> | undefined = undefined

  $: layers = place(key, item)
  $: currentId = layers[layers.length - 1]?.id

  function place (key: string, item: T): Layer[] {
    // Not a switch, an update of the current one.
    if (key === lastKey) {
      return layers.map((it, index) => (index === layers.length - 1 ? { ...it, item } : it))
    }
    lastKey = key
    const layer = { id: ++lastId, item }
    const revealed = layers.find((it) => it.id === revealedId)
    if (revealed === undefined) {
      reveal(layer.id)
      return [layer]
    }
    clearTimeout(revealTimer)
    revealTimer = setTimeout(() => {
      reveal(layer.id)
    }, waitMs)
    return [revealed, layer]
  }

  function reveal (id: number): void {
    clearTimeout(revealTimer)
    revealTimer = undefined
    if (revealedId === id) return
    revealedId = id
    cancelDrop()
    // Counted from the next frame: the fade starts there, and the long task of a mount can hold it back well
    // past the reveal. A fade that never runs still drops the previous view, which must not stay mounted.
    dropFrame = requestAnimationFrame(() => {
      dropFrame = undefined
      dropTimer = setTimeout(dropBelow, fadeMs)
    })
  }

  // Layers above the shown one are still waiting to come in, only those below go.
  function dropBelow (): void {
    dropTimer = undefined
    const index = layers.findIndex((it) => it.id === revealedId)
    if (index > 0) layers = layers.slice(index)
  }

  function cancelDrop (): void {
    if (dropFrame !== undefined) cancelAnimationFrame(dropFrame)
    clearTimeout(dropTimer)
    dropFrame = undefined
    dropTimer = undefined
  }

  onDestroy(() => {
    clearTimeout(revealTimer)
    cancelDrop()
  })
</script>

<div class="layers">
  {#each layers as layer, index (layer.id)}
    <!-- Only a layer above the shown one waits: the one below stays opaque until it is dropped. -->
    <!-- The outgoing one is inert: still on screen, it is no longer the content to act on. -->
    <div
      class="layer"
      class:waiting={index > layers.findIndex((it) => it.id === revealedId)}
      inert={layer.id !== currentId ? true : undefined}
    >
      <slot
        item={layer.item}
        current={layer.id === currentId}
        revealed={layer.id === revealedId}
        onReady={() => {
          if (layer.id === currentId) reveal(layer.id)
        }}
      />
    </div>
  {/each}
</div>

<style lang="scss">
  .layers {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  // The first layer keeps the box its size in the flow: an auto-height host (a comment thread in a
  // document) would collapse around absolute content. The next one lies over it.
  .layer {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;

    & + .layer {
      position: absolute;
      inset: 0;
      background-color: var(--theme-panel-color);
      transition: opacity 100ms ease-out;
    }

    &.waiting {
      opacity: 0;
      pointer-events: none;
    }
  }
</style>
