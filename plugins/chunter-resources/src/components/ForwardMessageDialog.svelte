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
  import { EditWithIcon, IconSearch, Modal, Scroller, deviceOptionsStore } from '@hcengineering/ui'
  import activity from '@hcengineering/activity'
  import presentation, { getClient } from '@hcengineering/presentation'
  import { Doc, getCurrentAccount, Markup, WithLookup } from '@hcengineering/core'
  import { EmptyMarkup } from '@hcengineering/text'
  import { getSpace } from '@hcengineering/activity-resources'
  import { ChatMessage, createAndGetDirect } from '@hcengineering/chunter'
  import contact, { Employee } from '@hcengineering/contact'

  import chunter from '../plugin'
  import { createEventDispatcher } from 'svelte'
  import ChatsList from './ChatsList.svelte'
  import ChatMessageInputLite from './chat-message/ChatMessageInputLite.svelte'
  import ReplyToMessagePresenter from './ReplyToMessagePresenter.svelte'
  import ChatModernTab from './ChatModernTab.svelte'
  import { getForwardData } from '../utils'

  export let message: WithLookup<ChatMessage>

  const dispatch = createEventDispatcher()
  const me = getCurrentAccount()

  let search: string = ''
  let selectedDocs: Doc[] = []
  let markup: Markup = EmptyMarkup

  let forwarding = false

  async function handleForward (): Promise<void> {
    try {
      forwarding = true
      const client = getClient()
      const hierarchy = client.getHierarchy()
      const op = client.apply('forward-message')
      const forwardData = await getForwardData(message)
      for (const _doc of selectedDocs) {
        const employee = hierarchy.isDerived(_doc._class, contact.mixin.Employee) ? _doc as Employee : undefined
        const account = employee?.personUuid
        const doc = account != null ? await createAndGetDirect(client, [account, me.uuid]) : _doc
        if(doc == null) continue

        await op.addCollection<Doc, ChatMessage>(
          chunter.class.ChatMessage,
          getSpace(doc),
          doc._id,
          doc._class,
          'comments',
          {
            message: markup,
            ...forwardData
          }
        )
      }
      await op.commit()
      dispatch('close')
    } finally {
      forwarding = false
    }
  }

  function handleClose (): void {
    dispatch('close')
  }

  $: canSave = selectedDocs.length > 0
</script>

<Modal
  label={chunter.string.ForwardMessage}
  type="type-popup"
  okLabel={activity.string.Forward}
  okLoading={forwarding}
  okAction={handleForward}
  {canSave}
  maxWidth="60rem"
  onCancel={handleClose}
  on:close={handleClose}
>
  <div class="forward-modal">
    <EditWithIcon
      icon={IconSearch}
      size="large"
      width="100%"
      autoFocus={!$deviceOptionsStore.isMobile}
      bind:value={search}
      on:change={() => dispatch('search', search)}
      on:input={() => dispatch('search', search)}
      placeholder={presentation.string.Search}
    />

    <div class="forward-modal__selected-chats">
      {#each selectedDocs as doc (doc._id)}
        <ChatModernTab
          {doc}
          on:close={() => {
            selectedDocs = selectedDocs.filter((it) => it._id !== doc._id)
          }}
        />
      {/each}
    </div>

    <div class="forward-modal__line" />

    <div class="forward-modal__chats">
      <Scroller padding="0">
        <ChatsList
          {search}
          limit={7}
          bind:selectedDocs
          on:select={(e) => {
            selectedDocs = e.detail ?? []
          }}
        />
      </Scroller>
    </div>

    <ReplyToMessagePresenter replyTo={message} labelIntl={activity.string.ForwardedMessageFrom} canClose={false} />

    <ChatMessageInputLite
      on:update={(e) => {
        markup = e.detail
      }}
    />
  </div>
</Modal>

<style lang="scss">
  .forward-modal {
    position: relative;
    display: flex;
    flex-direction: column;
    max-width: 60rem;
    height: 35rem;

    &__line {
      width: 100%;
      height: 1px;
      background: var(--global-subtle-ui-BorderColor);
      margin-bottom: 0.5rem;
    }

    &__chats {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 10rem;
    }

    &__selected-chats {
      display: flex;
      flex-wrap: wrap;
      column-gap: 0.25rem;
      row-gap: 0.25rem;
      min-height: 1.75rem;
      margin: 0.25rem 0;
    }
  }
</style>
