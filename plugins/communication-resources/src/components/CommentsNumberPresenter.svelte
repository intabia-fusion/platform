<script lang="ts">
  import type { Doc } from '@hcengineering/core'
  import { Button, ButtonKind, ButtonSize, IconThread } from '@hcengineering/ui'
  import { restrictionStore } from '@hcengineering/view-resources'

  import MessagesPopup from './MessagesPopup.svelte'

  export let value: number | undefined
  export let object: Doc | undefined
  export let kind: ButtonKind = 'link'
  export let size: ButtonSize = 'small'
  export let showCounter: boolean = true
  export let compactMode: boolean = false
  export let readonly: boolean = false

  $: disabled = $restrictionStore.disableComments
</script>

{#if object && value && value > 0}
  <Button
    {kind}
    {size}
    showTooltip={{
      component: MessagesPopup,
      props: { _id: object._id, _class: object._class, object, readonly: readonly || disabled }
    }}
  >
    <div slot="icon">
      <IconThread {size} />
    </div>
    <div slot="content" style:margin-left={showCounter && !compactMode ? '.375rem' : '0'}>
      {#if showCounter && !compactMode}{value}{/if}
    </div>
  </Button>
{/if}
