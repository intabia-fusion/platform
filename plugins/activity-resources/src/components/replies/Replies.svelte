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
  import { Doc, Ref, WithLookup } from '@hcengineering/core'
  import activity, { ActivityMessage } from '@hcengineering/activity'
  import notification, {
    ActivityInboxNotification,
    DocNotifyContext,
    InboxNotification,
    InboxNotificationsClient
  } from '@hcengineering/notification'
  import { getResource } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'

  import RepliedPersons from './RepliedPersons.svelte'
  import LastReply from './LastReply.svelte'
  import RepliesCount from './RepliesCount.svelte'

  export let object: ActivityMessage
  export let embedded = false
  export let onReply: ((message: ActivityMessage) => void) | undefined = undefined

  const client = getClient()

  $: lastReply = object.lastReply ?? new Date().getTime()

  let inboxClient: InboxNotificationsClient | undefined = undefined

  void getResource(notification.function.GetInboxNotificationsClient).then((getClientFn) => {
    inboxClient = getClientFn()
  })

  $: contextByDocStore = inboxClient?.contextByDoc
  $: notificationsByContextStore = inboxClient?.inboxNotificationsByContext

  $: hasNew = hasNewReplies(object, $contextByDocStore, $notificationsByContextStore)

  function hasNewReplies (
    message: ActivityMessage,
    notifyContexts?: Map<Ref<Doc>, DocNotifyContext>,
    inboxNotificationsByContext?: Map<Ref<DocNotifyContext>, WithLookup<InboxNotification>[]>
  ): boolean {
    const context: DocNotifyContext | undefined = notifyContexts?.get(message._id)

    if (context === undefined) {
      return false
    }

    return (inboxNotificationsByContext?.get(context._id) ?? [])
      .filter((it) => {
        const activityNotifications = it as ActivityInboxNotification
        return (
          activityNotifications.attachedToClass !== activity.class.DocUpdateMessage &&
          it._class !== notification.class.ReactionInboxNotification
        )
      })
      .some(({ isViewed }) => !isViewed)
  }

  const replyProvider = client.getModel().findAllSync(activity.class.ReplyProvider, {})[0]

  async function handleReply (e: MouseEvent): Promise<void> {
    e.stopPropagation()
    e.preventDefault()

    if (onReply) {
      onReply(object)
    }

    if (replyProvider) {
      const fn = await getResource(replyProvider.function)
      await fn(object, e)
    }
  }
</script>

{#if !embedded && (object.replies ?? 0) > 0}
  <div class="replies-container flex-grow">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="replies" on:click={handleReply}>
      <RepliedPersons repliedPersons={object.repliedPersons} />

      {#if hasNew}
        <div class="notifyMarker" />
      {/if}

      <span class="text overflow-label">
        <RepliesCount count={object.replies ?? 0} />
        <LastReply {lastReply} />
      </span>
    </div>
  </div>
{/if}

<style lang="scss">
  .replies-container {
    display: flex;
    flex-shrink: 1;
    min-width: 0;
    min-height: 2.375rem;
    height: 2.375rem;
    margin-top: 0.5rem;
  }
  .replies {
    display: flex;
    padding: 0.5rem 0.5rem;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    min-width: 0;
    border: 1px solid var(--global-ui-BorderColor);
    min-height: 2.375rem;
    height: 2.375rem;

    &:hover {
      background-color: var(--theme-bg-color);
    }
  }

  .text {
    flex: 1 1 auto;
  }

  .notifyMarker {
    margin-right: 0.25rem;
    width: 0.425rem;
    height: 0.425rem;
    border-radius: 50%;
    background-color: var(--highlight-red);
  }
</style>
