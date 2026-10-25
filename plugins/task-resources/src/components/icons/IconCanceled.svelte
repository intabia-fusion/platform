<script lang="ts">
  import type { ColorDefinition, IconSize } from '@hcengineering/ui'
  import ui, { getPlatformColorDef, Icon, themeStore } from '@hcengineering/ui'
  import { createEventDispatcher, onMount } from 'svelte'

  export let size: IconSize = 'small'

  export let fill: number = -1

  const dispatch = createEventDispatcher()

  const dispatchAccentColor = (color?: ColorDefinition) => dispatch('accent-color', color)

  $: color = getPlatformColorDef(fill, $themeStore.dark)
  $: dispatchAccentColor(color)

  onMount(() => {
    dispatchAccentColor(color)
  })
</script>

<!-- Takes a palette index like the other status icons. -->
<Icon icon={ui.icon.CrossCircle} {size} fill={color?.icon ?? 'currentColor'} />
