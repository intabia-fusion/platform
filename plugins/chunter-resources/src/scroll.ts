//
// Copyright © 2024 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
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
//
import { sortActivityMessages } from '@hcengineering/activity-resources'
import { type ActivityMessage } from '@hcengineering/activity'
import { type DocNotifyContext, type ReadState } from '@hcengineering/notification'
import { type Doc, getCurrentAccount, type Ref } from '@hcengineering/core'
import { get, writable } from 'svelte/store'
import { getClient } from '@hcengineering/presentation'

export function messageInView (msgElement: Element, containerRect: DOMRect): boolean {
  const rect = msgElement.getBoundingClientRect()
  return rect.bottom > containerRect.top && rect.top < containerRect.bottom
}

const accumulatorsByChannel = new Map<string, Set<Pick<ActivityMessage, '_id' | 'createdOn' | 'modifiedOn'>>>()
const timersByChannel = new Map<string, any>()

// NOTE: Store timestamp updates to avoid unnecessary updates if the server takes a long time to respond
const lastViewTimestampStore = writable<Map<Ref<Doc>, number>>(new Map())
// // NOTE: Sometimes user can read message before notification is created and we should mark it as viewed when notification is received
// export const chatReadMessagesStore = writable<Set<Ref<ActivityMessage>>>(new Set())
//
// function getAllIds (messages: ActivityMessage[]): Array<Ref<ActivityMessage>> {
//   return messages.map((message) => message._id)
// }
//
// let toReadTimer: any

export function readViewportMessages (
  chatId: Ref<Doc>,
  messages: ActivityMessage[],
  scrollDiv?: HTMLElement | null,
  contentDiv?: HTMLElement | null,
  context?: DocNotifyContext,
  readState?: ReadState
): void {
  if (scrollDiv == null || contentDiv == null || messages.length === 0) return

  const scrollRect = scrollDiv.getBoundingClientRect()
  const messagesElements = contentDiv?.getElementsByClassName('activityMessage')

  for (const message of messages) {
    const msgElement = messagesElements?.[message._id as any]
    if (msgElement == null) continue

    if (messageInView(msgElement, scrollRect)) {
      let accumulator = accumulatorsByChannel.get(chatId)
      if (accumulator == null) {
        accumulator = new Set<ActivityMessage>()
        accumulatorsByChannel.set(chatId, accumulator)
      }
      accumulator.add({
        _id: message._id,
        createdOn: message.createdOn,
        modifiedOn: message.modifiedOn
      })
    }
  }

  const timer = timersByChannel.get(chatId)
  if (timer !== undefined) {
    clearTimeout(timer)
  }

  const newTimer = setTimeout(() => {
    timersByChannel.delete(chatId)
    const accumulator = accumulatorsByChannel.get(chatId)
    if (accumulator == null) return
    accumulatorsByChannel.delete(chatId)

    const messagesToRead = [...accumulator]
    if (messagesToRead.length === 0) return
    void readMessages(sortActivityMessages(messagesToRead), context, readState)
  }, 500)

  timersByChannel.set(chatId, newTimer)
}

export function recheckNotifications (context: DocNotifyContext): void {
  // TODO
  // const client = getClient()
  // const inboxClient = InboxNotificationsClientImpl.getClient()
  //
  // const messages = get(chatReadMessagesStore)
  //
  // if (messages.size === 0) {
  //   return
  // }
  //
  // const notifications = get(inboxClient.inboxNotificationsByContext).get(context._id) ?? []
  //
  // notifications
  //   .filter((it) => {
  //     if (it.isViewed) {
  //       return false
  //     }
  //
  //     if (isMentionNotification(it)) {
  //       return messages.has(it.mentionedIn as Ref<ActivityMessage>)
  //     }
  //
  //     if (isActivityNotification(it)) {
  //       return messages.has(it.attachedTo)
  //     }
  //
  //     return false
  //   })
  //   .forEach((n) => toRead.add(n._id))
  //
  // clearTimeout(toReadTimer)
  // toReadTimer = setTimeout(() => {
  //   const toReadData = Array.from(toRead)
  //   toRead.clear()
  //   void (async () => {
  //     const _client = client.apply(undefined, 'recheckNotifications', true)
  //     await inboxClient.readNotifications(_client, toReadData)
  //     await _client.commit()
  //   })()
  // }, 500)
}

export async function readMessages (
  messages: Array<Pick<ActivityMessage, '_id' | 'createdOn' | 'modifiedOn'>>,
  context?: DocNotifyContext,
  readState?: ReadState
): Promise<void> {
  // TODO
  // if (messages.length === 0) {
  //   return
  // }
  //
  // const inboxClient = InboxNotificationsClientImpl.getClient()
  // const op = getClient().apply(undefined, 'readViewportMessages', true)
  //
  // try {
  //   const allIds = getAllIds(messages)
  //   const newTimestamp = messages[messages.length - 1]?.createdOn ?? 0
  //   const contextId = readState != null ? get(inboxClient.contextByDoc)?.get(readState.attachedTo)?._id : undefined
  //
  //   const shouldReadNotification = (n: InboxNotification, isTarget: boolean, msg?: ActivityMessage): boolean => {
  //     if (n.isViewed) return false
  //     if (isTarget) return true
  //
  //     if (contextId != null && n.docNotifyContext === contextId) {
  //       const msgTs = msg != null ? msg.createdOn : (n.createdOn ?? n.modifiedOn)
  //       if ((msgTs ?? 0) > 0 && (msgTs ?? 0) <= newTimestamp) {
  //         return true
  //       }
  //     }
  //     return false
  //   }
  //
  //   const notifications = get(inboxClient.activityInboxNotifications)
  //     .filter((n) =>
  //       shouldReadNotification(n, allIds.includes(n.attachedTo), n.$lookup?.attachedTo as ActivityMessage | undefined)
  //     )
  //     .map((n) => n._id)
  //
  //   const relatedMentions = get(inboxClient.otherInboxNotifications)
  //     .filter(
  //       (n) =>
  //         isMentionNotification(n) && shouldReadNotification(n, allIds.includes(n.mentionedIn as Ref<ActivityMessage>))
  //     )
  //     .map((n) => n._id)
  //
  //   const reactionNotifications = get(inboxClient.otherInboxNotifications)
  //     .filter((n) => isReactionNotification(n) && shouldReadNotification(n, allIds.includes(n.attachedTo)))
  //     .map((n) => n._id)
  //
  //   chatReadMessagesStore.update((store) => new Set([...store, ...allIds]))
  //
  //   if (readState != null) {
  //     const storedTimestampUpdates = get(lastViewTimestampStore).get(readState.attachedTo)
  //     const newTimestamp = messages[messages.length - 1].createdOn ?? 0
  //     const position = readState[getCurrentAccount().uuid]
  //     const prevTimestamp = Math.max(storedTimestampUpdates ?? 0, position?.timestamp ?? 0)
  //     const lastMessage = messages[messages.length - 1]
  //
  //     if (prevTimestamp < newTimestamp) {
  //       lastViewTimestampStore.update((store) => {
  //         store.set(readState.attachedTo, newTimestamp)
  //         return store
  //       })
  //       readState[getCurrentAccount().uuid] = { messageId: lastMessage._id, timestamp: newTimestamp }
  //       await op.updateCollection(
  //         readState._class,
  //         readState.space,
  //         readState._id,
  //         readState.attachedTo,
  //         readState.attachedToClass,
  //         'readStates',
  //         {
  //           [getCurrentAccount().uuid]: { messageId: lastMessage._id, timestamp: newTimestamp }
  //         }
  //       )
  //     } else {
  //       const contextByDoc = get(inboxClient.contextByDoc)
  //       const context = contextByDoc?.get(readState.attachedTo)
  //       if (context != null && (context.lastView ?? 0) < prevTimestamp) {
  //         await op.update(context, { lastView: prevTimestamp })
  //       }
  //     }
  //   }
  //   await inboxClient.readNotifications(op, [...notifications, ...relatedMentions, ...reactionNotifications])
  // } finally {
  //   await op.commit()
  // }
  if (messages.length === 0) return

  const me = getCurrentAccount()
  const lastMessage = messages[messages.length - 1]
  const newTimestamp = lastMessage.createdOn ?? lastMessage.modifiedOn ?? 0

  if (newTimestamp === 0) return

  if (readState != null) {
    const storedTimestampUpdates = get(lastViewTimestampStore).get(readState.attachedTo)
    const position = readState[me.uuid]
    const prevTimestamp = Math.max(storedTimestampUpdates ?? 0, position?.timestamp ?? 0)

    if (prevTimestamp < newTimestamp) {
      lastViewTimestampStore.update((store) => {
        store.set(readState.attachedTo, newTimestamp)
        return store
      })

      const client = getClient()
      await client.update(readState, {
        [me.uuid]: {
          messageId: lastMessage._id,
          timestamp: newTimestamp
        }
      })
    }
  }
}
