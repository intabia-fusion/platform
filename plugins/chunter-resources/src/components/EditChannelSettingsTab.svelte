<script lang="ts">
  import { Channel } from '@intabiafusion/chunter'
  import { Button } from '@intabiafusion/ui'
  import { createEventDispatcher } from 'svelte'
  import { ArchiveChannel } from '../index'
  import chunter from '../plugin'

  export let channel: Channel

  const dispatch = createEventDispatcher()
</script>

{#if channel}
  <Button
    label={chunter.string.ArchiveChannel}
    justify={'left'}
    size={'x-large'}
    on:click={(evt) => {
      ArchiveChannel(channel, evt, { afterArchive: () => dispatch('close') })
    }}
  />
{/if}
