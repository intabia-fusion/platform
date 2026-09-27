<script lang="ts">
  import { Component } from '@hcengineering/ui'
  import type { CreateExtensionKind } from '../../types'
  import type { DocCreateExtensionManager } from './manager'
  import type { Space } from '@hcengineering/core'

  export let manager: DocCreateExtensionManager
  export let kind: CreateExtensionKind
  export let props: Record<string, any> = {}
  export let space: Space | undefined = undefined

  $: extensions = manager.extensions

  $: filteredExtensions = $extensions.filter((it) => it.components[kind] !== undefined)
</script>

{#if filteredExtensions.length > 0}
  {#each filteredExtensions as extension}
    {@const state = manager.getState(extension._id)}
    {@const component = extension.components[kind]}
    {#if component}
      <Component is={component} props={{ kind, state, space, ...props }} />
    {/if}
  {/each}
{:else}
  <slot />
{/if}
