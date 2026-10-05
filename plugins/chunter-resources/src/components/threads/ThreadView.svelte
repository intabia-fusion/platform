<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import type { Doc, Ref } from '@hcengineering/core'
  import { ComponentExtensions, createQuery, getClient } from '@hcengineering/presentation'
  import type { BreadcrumbItem } from '@hcengineering/ui'
  import {
    Breadcrumbs,
    location as locationStore,
    Header,
    Loading,
    languageStore,
    ButtonIcon,
    IconBack
  } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import type { ActivityMessage } from '@hcengineering/activity'
  import activity from '@hcengineering/activity'
  import { messageInFocus } from '@hcengineering/activity-resources'
  import contact from '@hcengineering/contact'
  import attachment from '@hcengineering/attachment'

  import chunter from '../../plugin'
  import { getObjectIcon, getChannelName } from '../../utils'
  import { threadMessagesStore } from '../../stores'
  import ThreadContent from './ThreadContent.svelte'
  import FadeSwap from '../FadeSwap.svelte'

  export let _id: Ref<ActivityMessage>
  export let selectedMessageId: Ref<ActivityMessage> | undefined = undefined
  export let showHeader: boolean = true
  export let syncLocation = true
  export let autofocus = true
  export let readonly: boolean = false
  export let onReply: ((message: ActivityMessage) => void) | undefined = undefined
  // Mobile opens the thread in the main panel, where breadcrumbs alone are not an obvious way back.
  export let withBackButton: boolean = false

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const dispatch = createEventDispatcher()

  const messageQuery = createQuery()
  const channelQuery = createQuery()

  let channel: Doc | undefined = undefined
  let message: ActivityMessage | undefined = $threadMessagesStore?._id === _id ? $threadMessagesStore : undefined
  let isLoading = true
  let channelName: string | undefined = undefined

  $: selectedMessageId = $messageInFocus

  $: if (message && message._id !== _id) {
    message = $threadMessagesStore?._id === _id ? $threadMessagesStore : undefined
    isLoading = message === undefined
  }

  $: messageQuery.query(
    activity.class.ActivityMessage,
    { _id },
    (result: ActivityMessage[]) => {
      message = result[0]
      isLoading = false
      if (message === undefined) {
        dispatch('close')
      }
    },
    {
      lookup: {
        _id: {
          attachments: attachment.class.Attachment
        }
      }
    }
  )

  $: message &&
    channelQuery.query(message.attachedToClass, { _id: message.attachedTo }, (res) => {
      channel = res[0]
    })

  $: void (
    message &&
    getChannelName(message.attachedTo, message.attachedToClass, channel, $languageStore).then((res) => {
      channelName = res
    })
  )

  // Kept while the next thread's message is on its way: dropping it would unmount the fade between them.
  let shownMessage: ActivityMessage | undefined = message
  $: if (message !== undefined) shownMessage = message

  let breadcrumbs: BreadcrumbItem[] = []
  $: breadcrumbs = showHeader ? getBreadcrumbsItems(channel, channelName) : []

  function getBreadcrumbsItems (channel?: Doc, channelName?: string): BreadcrumbItem[] {
    if (channel === undefined) {
      return []
    }

    const isPersonAvatar =
      channel._class === chunter.class.DirectMessage || hierarchy.isDerived(channel._class, contact.class.Person)

    return [
      {
        id: 'channel',
        icon: getObjectIcon(channel._class),
        iconProps: { value: channel },
        iconWidth: isPersonAvatar ? 'auto' : undefined,
        withoutIconBackground: isPersonAvatar,
        title: channelName,
        label: channelName ? undefined : chunter.string.Channel
      },
      { id: 'thread', label: chunter.string.Thread }
    ]
  }

  function handleBreadcrumbSelect (event: CustomEvent<number>): void {
    const index = event.detail
    const breadcrumb = breadcrumbs[index]

    if (breadcrumb === undefined) return
    if (breadcrumb.id !== 'channel') return

    dispatch('channel')
  }
</script>

{#if showHeader}
  <!-- The back button replaces the aside's close cross, so the mobile header is a plain component one. -->
  <Header type={withBackButton ? 'type-component' : 'type-aside'} adaptive={'disabled'} closeOnEscape={false} on:close>
    <svelte:fragment slot="beforeTitle">
      {#if withBackButton}
        <ButtonIcon
          icon={IconBack}
          kind={'tertiary'}
          size={'small'}
          on:click={() => {
            dispatch('close')
          }}
        />
      {/if}
    </svelte:fragment>
    <Breadcrumbs items={breadcrumbs} on:select={handleBreadcrumbSelect} selected={1} />
    <svelte:fragment slot="actions">
      {#if message !== undefined}
        <ComponentExtensions
          extension={chunter.extensions.ThreadHeaderExtension}
          props={{ value: message, _id, readonly }}
        />
      {/if}
    </svelte:fragment>
  </Header>
{/if}

{#if shownMessage !== undefined}
  <FadeSwap key={shownMessage._id} item={shownMessage} let:item let:current let:revealed let:onReady>
    <!-- Only the current thread follows the selection: the outgoing one would jump to a message it lacks. -->
    <ThreadContent
      selectedMessageId={current === true ? selectedMessageId : undefined}
      message={item}
      autofocus={autofocus && current}
      {readonly}
      {onReply}
      fadeOverlay={revealed}
      {onReady}
    />
  </FadeSwap>
{:else if isLoading}
  <Loading />
{/if}
