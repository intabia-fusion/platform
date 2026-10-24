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
<script lang="ts" context="module">
  // Pictures loaded this session: a card that remounts shows them at once, without the fade.
  const known = new Set<string>()
  const KNOWN_LIMIT = 2000
  // Sizes are rounded up to a step, so near widths share one cached copy.
  const STEP = 32

  export function isKnownImage (key: string | undefined): boolean {
    return key != null && known.has(key)
  }

  // One observer for all pictures: a box that grows asks for a bigger copy, one that shrinks keeps its own.
  const growers = new Map<Element, (drawn: number) => void>()
  let resizes: ResizeObserver | undefined

  function watchGrowth (el: Element, grow: (drawn: number) => void): () => void {
    if (typeof ResizeObserver === 'undefined') return () => {}
    resizes ??= new ResizeObserver((entries) => {
      for (const it of entries) growers.get(it.target)?.(it.contentRect.width)
    })
    growers.set(el, grow)
    resizes.observe(el)
    return () => {
      resizes?.unobserve(el)
      growers.delete(el)
    }
  }
</script>

<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte'

  import { lazyObserver } from '../../lazy'
  import type { ImageSource } from './types'

  export let source: ImageSource
  /** Largest drawn size in CSS pixels, also the proportions; density comes from srcset. */
  export let width: number
  export let height: number
  export let alt: string = ''
  export let loading: 'lazy' | 'eager' = 'lazy'
  /** The same picture under one key, so a remount knows it is already loaded. */
  export let cacheKey: string | undefined = undefined

  const dispatch = createEventDispatcher<{ load: undefined, error: undefined }>()

  let node: HTMLElement | undefined
  let size: { width: number, height: number } | undefined
  let resolved: { src: string, srcset?: string } | undefined
  let request = 0
  let unwatch: (() => void) | undefined
  onDestroy(() => unwatch?.())

  // By the file when known: a parent re-rendering hands a new source of the same picture.
  $: sourceKey = cacheKey ?? source
  $: if (size != null) void resolve(sourceKey, size.width, size.height)

  function fit (drawn: number): { width: number, height: number } {
    const w = drawn > 0 ? Math.min(width, Math.ceil(drawn / STEP) * STEP) : width
    return { width: w, height: Math.round((w * height) / width) }
  }

  // The box is laid out by now: ask for its width, not the largest one.
  function start (): void {
    if (size != null || node == null) return
    size = fit(node.getBoundingClientRect().width)
    unwatch = watchGrowth(node, (drawn) => {
      const next = fit(drawn)
      if (size != null && next.width > size.width) size = next
    })
  }

  async function resolve (_key: string | ImageSource, w: number, h: number): Promise<void> {
    const current = ++request
    try {
      const result = await source(w, h)
      // A newer source may have answered first.
      if (current === request) resolved = result
    } catch {
      if (current === request) dispatch('error')
    }
  }

  function loaded (): void {
    if (cacheKey != null) {
      if (known.size >= KNOWN_LIMIT) known.clear()
      known.add(cacheKey)
    }
    dispatch('load')
  }

  function observe (el: HTMLElement): { destroy?: () => void } {
    node = el
    if (loading === 'eager' || isKnownImage(cacheKey)) {
      start()
      return {}
    }
    return lazyObserver(el, (visible) => {
      if (visible) start()
    })
  }
</script>

<span class="file-image" use:observe>
  {#if resolved != null}
    <img
      src={resolved.src}
      srcset={resolved.srcset}
      {alt}
      decoding="async"
      draggable="false"
      on:load={loaded}
      on:error={() => dispatch('error')}
    />
  {/if}
</span>

<style lang="scss">
  .file-image {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
