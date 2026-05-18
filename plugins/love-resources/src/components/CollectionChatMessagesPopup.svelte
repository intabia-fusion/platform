<!--
// Copyright © 2026 Intabia Fusion.
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
  import { createEventDispatcher } from 'svelte'
  import core, { Doc, Ref, Space, SortingOrder } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import chunter, { ChatMessage } from '@hcengineering/chunter'
  import { ChatMessageInput } from '@hcengineering/chunter-resources'
  import ChatMessagePresenter from '@hcengineering/chunter-resources/src/components/chat-message/ChatMessagePresenter.svelte'
  import { closeTooltip, Label, Lazy, Spinner, resizeObserver } from '@hcengineering/ui'
  import { ObjectPresenter, DocNavLink } from '@hcengineering/view-resources'

  import love from '../plugin'

  export let object: Doc | undefined
  export let collection: 'messages' | 'transcription'

  const dispatch = createEventDispatcher()
  const query = createQuery()

  let loading = true
  let messages: ChatMessage[] = []

  const client = getClient()
  $: channelSpace =
    object !== undefined
      ? client.getHierarchy().isDerived(object._class, core.class.Space)
        ? (object._id as Ref<Space>)
        : object.space
      : undefined

  $: if (object !== undefined && channelSpace !== undefined) {
    query.query(
      chunter.class.ChatMessage,
      {
        attachedTo: object._id,
        collection,
        space: channelSpace
      },
      (res) => {
        messages = res.sort((message) => (message?.isPinned ? -1 : 1))
        loading = false
      },
      {
        sort: { createdOn: SortingOrder.Ascending },
        showArchived: true
      }
    )
  }

  let isTextMode = false

  $: if (isTextMode) {
    dispatch('tooltip', { kind: 'popup' })
  }

  $: title = collection === 'transcription' ? love.string.Transcription : chunter.string.Comments
</script>

<div class="commentPopup-container">
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="flex-between header"
    use:resizeObserver={() => {
      dispatch('changeContent')
    }}
    on:keydown={(evt) => {
      if (isTextMode) {
        evt.preventDefault()
        evt.stopImmediatePropagation()
        closeTooltip()
      }
    }}
  >
    <div class="fs-title mr-2">
      <Label label={title} />
    </div>
    {#if object}
      <DocNavLink {object}>
        <ObjectPresenter _class={object._class} objectId={object._id} value={object} />
      </DocNavLink>
    {/if}
  </div>
  <div class="messages">
    {#if loading}
      <div class="flex-center">
        <Spinner />
      </div>
    {:else}
      {#each messages as message}
        <div class="item">
          <Lazy>
            <ChatMessagePresenter value={message} hideLink type={'default'} />
          </Lazy>
        </div>
      {/each}
    {/if}
  </div>
  {#if collection === 'messages' && object}
    <div class="input">
      <ChatMessageInput
        {object}
        {collection}
        on:focus={() => {
          isTextMode = true
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
    min-width: 0;
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

      .item {
        max-width: 30rem;
      }
    }

    .input {
      padding: 0.5rem 0.25rem 0.25rem;
    }
  }
</style>
