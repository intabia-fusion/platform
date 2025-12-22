<!--
// Copyright © 2025 Hardcore Engineering Inc.
//
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
  import { Doc, SortingOrder } from '@hcengineering/core'
  import { getClient, createNotificationContextsQuery, createMessagesQuery } from '@hcengineering/presentation'
  import { Section } from '@hcengineering/ui'
  import { type Message, NotificationContext, Window } from '@hcengineering/communication-types'
  import { onMount } from 'svelte'

  import communication from '../../plugin'
  import { activityDirectionStore, initActivityDirection } from '../../stores'
  import { ActivityDirection, ActivityFilter } from '../../types'
  import ActivityHeader from './ActivityHeader.svelte'
  import MessageInput from '../input/MessageInput.svelte'
  import ActivityList from './ActivityList.svelte'
  import { filterMessages } from '../../activity'
  import { groupMessagesByDay } from '../../messages'

  export let object: Doc
  export let showInput: boolean = true
  export let focusIndex: number = -1
  export let boundary: HTMLDivElement | undefined = undefined
  export let readonly: boolean = false

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const contextQuery = createNotificationContextsQuery()

  // TODO: FIX ME
  // const selectedMessageId: MessageID | undefined = undefined

  let contentDiv: HTMLDivElement | undefined = undefined
  let isAllLoaded = false
  let filters: ActivityFilter[] | null = null
  let list: ActivityList | undefined = undefined

  let context: NotificationContext | undefined = undefined

  $: contextQuery.query(
    {
      docId: object._id,
      docClass: object._class,
      limit: 1
    },
    (res) => {
      context = res.getResult()[0]
    }
  )

  onMount(() => {
    initActivityDirection()
  })
</script>

<Section label={communication.string.Activity} icon={communication.icon.Activity}>
  <svelte:fragment slot="header">
    <ActivityHeader
      on:update={(e) => {
        filters = e.detail
      }}
    />
  </svelte:fragment>

  <svelte:fragment slot="content">
    <span class="mt-2" />
    {#if showInput && $activityDirectionStore === ActivityDirection.Backward}
      <div class="message-input backward">
        <MessageInput
          doc={object}
          on:arrowDown={() => {
            list?.editLastMessage()
          }}
        />
      </div>
    {/if}
    {#if boundary && $activityDirectionStore != null && filters != null}
      <div bind:this={contentDiv}>
        {#if contentDiv}
          <ActivityList
            bind:this={list}
            bind:isAllLoaded
            doc={object}
            {readonly}
            scrollDiv={boundary}
            {contentDiv}
            direction={$activityDirectionStore}
            context={undefined}
            {filters}
          />
        {/if}
      </div>
    {/if}

    {#if showInput && $activityDirectionStore === ActivityDirection.Forward && isAllLoaded}
      <div class="message-input forward">
        <MessageInput
          doc={object}
          autofocus={false}
          on:arrowUp={() => {
            list?.editLastMessage()
          }}
          on:sent={() => {
            list?.scrollDown()
          }}
        />
      </div>
    {/if}
  </svelte:fragment>
</Section>

<style lang="scss">
  .message-input {
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    padding: 0 0.75rem;
    max-height: 20rem;

    &.backward {
      margin-top: 1rem;
    }

    &.forward {
      margin-top: 1.5rem;
    }
  }
</style>
