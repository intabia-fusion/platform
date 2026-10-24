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
  // Screen frames of recorded pages on one canvas at the x, y of the Penpot kit, with zoom and pan.
  // Frames render when they come near the viewport: 19 full-size workbenches at once are too heavy.
  import { onMount } from 'svelte'
  import { themeStore } from '@hcengineering/ui'
  import Frame from '../kit/Frame.svelte'
  import { paletteVars } from '../kit/palette'
  import PanZoom from '../PanZoom.svelte'
  import Render from './Render.svelte'
  import { records } from './records'
  import type { RNode, RPage } from './recorder'

  // Section title of the screen file, e.g. "Screens"
  export let group: string
  // One page, or every page of the section stacked when empty
  export let page: string | undefined = undefined
  // One frame of the page at the origin, for the frame stories
  export let frame: number | undefined = undefined

  interface Item {
    node: RNode
    page: string
    index: number
    x: number
    y: number
    w: number
    h: number
  }
  interface Heading {
    text: string
    x: number
    y: number
    w: number
  }

  const TITLE = 32
  const PAGE_GAP = 900

  let view: HTMLDivElement | undefined
  let panZoom: PanZoom
  let dragged = false
  let bounds: { x: number, y: number, w: number, h: number } | undefined
  let k = 1
  let tx = 0
  let ty = 0
  let items: Item[] = []
  let headings: Heading[] = []
  let failure: string | undefined
  let ready = false
  $: vars = paletteVars($themeStore.dark)

  function layout (pages: RPage[]): void {
    const out: Item[] = []
    const heads: Heading[] = []
    let left = 0
    for (const p of pages.filter((p) => page === undefined || p.name === page)) {
      if (page === undefined) heads.push({ text: p.name, x: left, y: -450, w: 0 })
      let right = left
      p.frames.forEach((node, index) => {
        if (frame !== undefined && index !== frame) return
        const x = frame !== undefined ? 0 : left + (node.pos?.x ?? 0)
        const y = frame !== undefined ? 0 : (node.pos?.y ?? 0)
        const item = { node, page: p.name, index, x, y, w: node.width + 2, h: node.height + TITLE + 2 }
        out.push(item)
        right = Math.max(right, x + item.w)
      })
      if (page === undefined) heads[heads.length - 1].w = right - left
      left = right + PAGE_GAP
    }
    items = out
    headings = heads
  }

  function measure (): void {
    if (items.length === 0) return
    const minX = Math.min(...items.map((i) => i.x))
    const minY = Math.min(...items.map((i) => i.y)) - (page === undefined ? 900 : 40)
    const maxX = Math.max(...items.map((i) => i.x + i.w))
    const maxY = Math.max(...items.map((i) => i.y + i.h))
    bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  // Selects the frame story of the label that was clicked; its id comes from the Storybook index
  async function open (item: Item): Promise<void> {
    if (dragged) return
    const index = await (await fetch('index.json')).json()
    const entry = Object.values<{ id: string, title: string }>(index.entries).find(
      (e) => e.title === `${group}/${item.page}` && e.id.endsWith(`--frame-${item.index + 1}`)
    )
    if (entry !== undefined) (window as any).__STORYBOOK_ADDONS_CHANNEL__?.emit('selectStory', { storyId: entry.id })
  }

  // Marks the node once it gets within a viewport of the visible area; it stays rendered after that
  function nearby (el: HTMLElement, set: () => void): { destroy: () => void } {
    const io = new IntersectionObserver(
      (list) => {
        if (list.some((e) => e.isIntersecting)) {
          set()
          io.disconnect()
        }
      },
      { root: view, rootMargin: '100%' }
    )
    io.observe(el)
    return {
      destroy: () => {
        io.disconnect()
      }
    }
  }

  let shown = new Set<string>()
  const show = (id: string) => () => {
    shown = new Set(shown).add(id)
  }

  onMount(() => {
    records()
      .then((all) => {
        layout(all.get(group) ?? [])
        measure()
        requestAnimationFrame(() => {
          void panZoom.fit()
          ready = true
        })
      })
      .catch((e) => (failure = String(e)))
  })
</script>

<PanZoom bind:this={panZoom} bind:view bind:k bind:tx bind:ty bind:dragged {bounds}>
  <svelte:fragment slot="note">
    {#if failure !== undefined}
      <pre class="note">{failure}</pre>
    {:else if !ready}
      <div class="note">Running screen scripts...</div>
    {/if}
  </svelte:fragment>
  {#each items as item (item.node.id)}
    <div
      class="item"
      style:left="{item.x}px"
      style:top="{item.y}px"
      style:width="{item.w}px"
      style:height="{item.h}px"
      use:nearby={show(item.node.id)}
    >
      <Frame title={item.node.name} width={item.w} height={item.node.height}>
        {#if shown.has(item.node.id)}<div class="fill" style={vars}>
            <Render node={{ ...item.node, pos: undefined }} />
          </div>{/if}
      </Frame>
    </div>
  {/each}
  <svelte:fragment slot="overlay">
    {#each headings as h (h.text)}
      <div class="heading" style:left="{h.x * k + tx}px" style:top="{h.y * k + ty}px" style:max-width="{h.w * k}px">
        {h.text}
      </div>
    {/each}
    <!-- Rows of frames are 120px apart, so below 20% a frame label would cover the frame above -->
    {#each k >= 0.2 ? items : [] as item (item.node.id)}
      <button
        type="button"
        class="label"
        style:left="{item.x * k + tx}px"
        style:top="{item.y * k + ty}px"
        style:max-width="{item.w * k}px"
        on:click={() => {
          void open(item)
        }}><span>{item.node.name}</span></button
      >
    {/each}
  </svelte:fragment>
</PanZoom>

<style lang="scss">
  .item {
    position: absolute;
    contain: strict;
    content-visibility: auto;
  }
  .label {
    position: absolute;
    transform: translateY(calc(-100% - 6px));
    padding: 0;
    text-align: left;
    font: inherit;
    font-size: 13px;
    color: var(--theme-dark-color);
    white-space: nowrap;
    cursor: pointer;
    background: none;
    border: none;

    span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    &:hover {
      color: var(--theme-caption-color);
      text-decoration: underline;
    }
  }
  .heading {
    position: absolute;
    transform: translateY(-100%);
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 24px;
    font-weight: 600;
    color: var(--theme-caption-color);
    white-space: nowrap;
  }
  .fill {
    width: 100%;
    height: 100%;
  }
  .note {
    position: absolute;
    padding: 1rem;
    color: var(--theme-dark-color);
  }
</style>
