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

  interface Layer {
    key: string
    item: T
  }

  let layers: Layer[] = []
  let revealedKey: string | undefined = undefined
  let revealTimer: ReturnType<typeof setTimeout> | undefined = undefined
  let dropFrame: number | undefined = undefined
  let dropTimer: ReturnType<typeof setTimeout> | undefined = undefined

  $: layers = place(key, item)

  function place (key: string, item: T): Layer[] {
    const revealedIndex = layers.findIndex((it) => it.key === revealedKey)
    if (revealedIndex === -1) {
      reveal(key)
      return [{ key, item }]
    }
    const index = layers.findIndex((it) => it.key === key)
    if (index === -1) {
      clearTimeout(revealTimer)
      revealTimer = setTimeout(() => {
        reveal(key)
      }, waitMs)
      return [layers[revealedIndex], { key, item }]
    }
    if (index === revealedIndex) {
      // Back to the shown one, or just its update: only waiting layers above go, the one fading out below stays.
      clearTimeout(revealTimer)
      revealTimer = undefined
      return [...layers.slice(0, index), { key, item }]
    }
    return layers.map((it) => (it.key === key ? { key, item } : it))
  }

  function reveal (key: string): void {
    clearTimeout(revealTimer)
    revealTimer = undefined
    if (revealedKey === key) return
    revealedKey = key
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
    const index = layers.findIndex((it) => it.key === revealedKey)
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
  {#each layers as layer, index (layer.key)}
    <!-- Only a layer above the shown one waits: the one below stays opaque until it is dropped. -->
    <div class="layer" class:waiting={index > layers.findIndex((it) => it.key === revealedKey)}>
      <slot
        item={layer.item}
        current={layer.key === key}
        revealed={layer.key === revealedKey}
        onReady={() => {
          if (layer.key === key) reveal(layer.key)
        }}
      />
    </div>
  {/each}
</div>

<style lang="scss">
  .layers {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  // Stacked in order: the next content lies over the previous one.
  .layer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background-color: var(--theme-panel-color);
    transition: opacity 100ms ease-out;

    &.waiting {
      opacity: 0;
      pointer-events: none;
    }
  }
</style>
