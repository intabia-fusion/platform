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
  import type { IconSize } from '@hcengineering/ui'
  import { getPlatformColorDef, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'
  import IconStarted from './IconStarted.svelte'

  export let size: IconSize = 'small'
  export let fill: number = -1
  export let count: number
  export let index: number

  const dispatch = createEventDispatcher()
  const maxArcs = 6
  const radius = 6.5
  const gap = 1.4 / radius

  $: color = getPlatformColorDef(fill, $themeStore.dark)
  $: stroke = color?.icon ?? 'currentColor'
  $: arcs = count - 1
  $: dispatch('accent-color', color)

  onMount(() => {
    dispatch('accent-color', color)
  })

  function arc (i: number, n: number): string {
    const from = (2 * Math.PI * i) / n + gap / 2
    const to = (2 * Math.PI * (i + 1)) / n - gap / 2
    const point = (a: number): string => `${8 + Math.cos(a) * radius} ${8 + Math.sin(a) * radius}`
    return `M ${point(from)} A ${radius} ${radius} 0 0 1 ${point(to)}`
  }
</script>

{#if arcs > maxArcs}
  <IconStarted {size} {fill} {count} {index} dashed on:accent-color />
{:else}
  <svg
    class="svg-{size}"
    style:flex-shrink={0}
    style:transform="rotate(-90deg)"
    viewBox="0 0 16 16"
    xmlns="http://www.w3.org/2000/svg"
  >
    {#if arcs < 1}
      <circle cx="8" cy="8" r={radius} fill="none" {stroke} stroke-width="2" opacity="0.3" />
    {/if}
    {#each Array(Math.max(arcs, 0)) as _, i}
      {#if arcs === 1}
        <circle cx="8" cy="8" r={radius} fill="none" {stroke} stroke-width="2" opacity={index > 0 ? 1 : 0.3} />
      {:else}
        <path d={arc(i, arcs)} fill="none" {stroke} stroke-width="2" opacity={i < index ? 1 : 0.3} />
      {/if}
    {/each}
  </svg>
{/if}
