<script lang="ts">
  import type { ColorDefinition, IconSize } from '@hcengineering/ui'
  import { getMetadata } from '@hcengineering/platform'
  import ui, { getPlatformColorDef, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'

  export let size: IconSize = 'small'

  export let fill: number = -1

  const dispatch = createEventDispatcher()

  const dispatchAccentColor = (color?: ColorDefinition) => dispatch('accent-color', color)

  export let count: number | undefined = undefined
  export let index: number | undefined = undefined
  // Dashed outline instead of the solid one, marks the project-wide position
  export let dashed: boolean = false

  $: color = getPlatformColorDef(fill, $themeStore.dark)
  $: dispatchAccentColor(color)

  onMount(() => {
    dispatchAccentColor(color)
  })
</script>

<svg
  class="svg-{size}"
  fill={color?.icon ?? 'currentColor'}
  style:flex-shrink={0}
  style:transform="rotate(-90deg)"
  viewBox="0 0 32 32"
  xmlns="http://www.w3.org/2000/svg"
>
  <use href={getMetadata(dashed ? ui.icon.CircleDashed : ui.icon.Circle)} width="32" height="32" />
  {#if count !== undefined && index}
    <path
      d="M 9 9 L 18 9 A 9 9 0 {index > (count - 1) / 2 ? 1 : 0} 1 {Math.cos(((2 * Math.PI) / count) * index - 0.01) *
        9 +
        9} {Math.sin(((2 * Math.PI) / count) * index - 0.01) * 9 + 9} Z"
      transform="translate(7,7)"
    />
  {:else}
    <path
      d="M 9 9 L 18 9 A 9 9 0 1 1 {Math.cos(Math.PI - 0.01) * 9 + 9} {Math.sin(Math.PI - 0.01) * 9 + 9} Z"
      transform="translate(7,7)"
    />
  {/if}
</svg>
