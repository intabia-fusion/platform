<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { ReferenceInput } from '@hcengineering/text-editor-resources'
  import { popupstore as popups } from '@hcengineering/ui'

  export let nodeId: string | undefined
  export let popupId: string | undefined

  const dispatch = createEventDispatcher()

  async function handleMessage (event: CustomEvent<string>): Promise<void> {
    // TODO: FIXME
    // const messageId: Ref<ChatMessage> = generateId()
    // const comment = await addDocumentCommentFx({ content: event.detail, messageId, nodeId })
    //
    // dispatch('close', comment)
  }

  let popup: HTMLDivElement | undefined

  function handleClick (event: MouseEvent): void {
    if (event.target instanceof Node) {
      const top = $popups.length > 0 && $popups[$popups.length - 1].id === popupId
      if (top && popup !== undefined && !popup.contains(event.target)) {
        event.preventDefault()
        event.stopPropagation()
        dispatch('close', undefined)
      }
    }
  }
</script>

<svelte:window on:click|capture={handleClick} />

<div class="text-editor-popup w-85" bind:this={popup}>
  <!--  placeholder={chunter.string.AddCommentPlaceholder}-->
  <ReferenceInput autofocus focusable kindSend="primary" on:message={handleMessage} />
</div>
