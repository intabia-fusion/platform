<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte'
  import { Class, Doc, isOtherHour, Ref, SortingOrder } from '@hcengineering/core'
  import { createMessagesQuery } from '@hcengineering/presentation'
  import { closeTooltip, Label, resizeObserver, Spinner } from '@hcengineering/ui'
  import { DocNavLink, ObjectPresenter } from '@hcengineering/view-resources'
  import { Message, MessageType } from '@hcengineering/communication-types'
  import communication from '@hcengineering/communication'

  import { initActivityDirection } from '../stores'
  import MessageInput from './input/MessageInput.svelte'
  import MessagePresenter from './message/MessagePresenter.svelte'

  export let _id: Ref<Doc>
  export let _class: Ref<Class<Doc>>
  export let object: Doc
  export let readonly: boolean = false

  const dispatch = createEventDispatcher()
  const query = createMessagesQuery()
  const limit = 50

  let loading = true
  let messages: Message[] = []

  $: query.query(
    { docId: _id, docClass: _class, limit, order: SortingOrder.Ascending },
    (res) => {
      messages = res.getResult().filter((it) => it.type === MessageType.Text)

      if (messages.length < limit && res.hasNextPage()) {
        void res.loadNextPage()
      } else if (messages.length < limit && res.hasPrevPage()) {
        void res.loadPrevPage()
      } else {
        loading = false
      }
    },
    {
      autoExpand: true,
      attachments: true,
      reactions: true,
      threads: true
    }
  )

  let isTyping = false

  $: if (isTyping) {
    dispatch('tooltip', { kind: 'popup' })
  }

  onMount(() => {
    initActivityDirection()
  })

  function isCompactView (prev: Message | undefined, current: Message): boolean {
    if (prev == null) return false
    if (prev.creator !== current.creator) return false
    if (prev.type !== current.type) return false
    if (isOtherHour(prev.created.getTime(), current.created.getTime())) return false
    return true
  }

  let scrollDiv: HTMLDivElement | null = null
</script>

<div class="commentPopup-container">
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="flex-between header"
    use:resizeObserver={() => {
      dispatch('changeContent')
    }}
    on:keydown={(evt) => {
      if (isTyping) {
        evt.preventDefault()
        evt.stopImmediatePropagation()
        closeTooltip()
      }
    }}
  >
    <div class="fs-title mr-2">
      <Label label={communication.string.Comments} />
    </div>
    <DocNavLink {object}>
      <ObjectPresenter _class={object._class} objectId={object._id} value={object} />
    </DocNavLink>
  </div>
  <div class="messages" bind:this={scrollDiv}>
    {#if loading}
      <div class="flex-center">
        <Spinner />
      </div>
    {:else}
      {#each messages as message, index (message.id)}
        {@const previousMessage = messages[index - 1]}
        {@const compact = isCompactView(previousMessage, message)}
        <MessagePresenter {message} doc={object} {readonly} {compact} />
      {/each}
    {/if}
  </div>
  {#if !readonly && !loading}
    <div class="input">
      <MessageInput
        doc={object}
        autofocus={false}
        on:focus={() => {
          isTyping = true
        }}
        on:sent={() => {
          scrollDiv?.scrollTo({ top: scrollDiv.scrollHeight, behavior: 'instant' })
        }}
      />
    </div>
  {/if}
</div>

<style lang="scss">
  .commentPopup-container {
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0;
    min-width: 25rem;
    min-height: 0;
    max-height: 30rem;

    .header {
      flex-shrink: 0;
      margin: 0 0.25rem 0.5rem;
      padding: 0.5rem 1.25rem 1rem 0.75rem;
      border-bottom: 1px solid var(--theme-divider-color);
    }

    .messages {
      overflow: auto;
      flex: 1;
      padding: 0.75rem 0.25rem;
      min-width: 0;
      min-height: 0;
    }

    .input {
      padding: 0.5rem 0.25rem 0.25rem;
    }
  }
</style>
