<script lang="ts">
  import { createEventDispatcher } from 'svelte'

  import chunter, { type ChatMessage } from '@intabiafusion/chunter'
  import { Ref, generateId } from '@intabiafusion/core'
  import { ReferenceInput } from '@intabiafusion/text-editor-resources'
  import { popupstore as popups } from '@intabiafusion/ui'

  import { addDocumentCommentFx } from '../../../stores/editors/document'

  export let nodeId: string | undefined
  export let popupId: string | undefined

  const dispatch = createEventDispatcher()

  async function handleMessage (event: CustomEvent<string>): Promise<void> {
    const messageId: Ref<ChatMessage> = generateId()
    const comment = await addDocumentCommentFx({ content: event.detail, messageId, nodeId })

    dispatch('close', comment)
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
  <ReferenceInput
    autofocus
    focusable
    kindSend="primary"
    placeholder={chunter.string.AddCommentPlaceholder}
    on:message={handleMessage}
  />
</div>
