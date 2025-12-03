//
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
//
import { type Card } from '@hcengineering/card'
import {
  type ActivityAttributeUpdate,
  type ActivityMessage,
  type ActivityUpdate,
  ActivityUpdateType,
  type Message,
  MessageType,
  type ActivityCollectionUpdate
} from '@hcengineering/communication-types'
import core, {
  type Collection,
  type Attribute,
  type Hierarchy,
  type Class,
  type Client,
  type Doc,
  type Mixin,
  type Ref,
  type AttachedDoc
} from '@hcengineering/core'
import view, { type AttributeModel } from '@hcengineering/view'
import { buildRemovedDoc, getAttributePresenter } from '@hcengineering/view-resources'
import { groupByArray, notEmpty, SortingOrder } from '@hcengineering/core'

import { ActivityFilter, type ActivityFilterDef, type Aggregated } from './types'
import communication from './plugin'

const valueTypes: ReadonlyArray<Ref<Class<Doc>>> = [
  core.class.TypeString,
  core.class.EnumOf,
  core.class.TypeNumber,
  core.class.TypeDate,
  core.class.TypeFileSize,
  core.class.TypeMarkup,
  core.class.TypeHyperlink
]

async function getAttributePresenterSafe (
  client: Client,
  _class: Ref<Class<Doc>>,
  attrKey: string,
  mixin?: Ref<Mixin<Doc>>
): Promise<AttributeModel | undefined> {
  try {
    return await getAttributePresenter(client, _class, attrKey, { key: attrKey }, mixin)
  } catch (e) {
    console.error(e)
  }
}

export async function getAttributeModel (
  client: Client,
  update: ActivityUpdate | undefined,
  _class: Ref<Class<Card>>
): Promise<AttributeModel | undefined> {
  if (
    update == null ||
    (update.type !== ActivityUpdateType.Attribute && update.type !== ActivityUpdateType.CollaborativeChange)
  ) {
    return undefined
  }

  const { attrKey } = update

  const model = await getAttributePresenterSafe(
    client,
    (update as ActivityAttributeUpdate).mixin ?? _class,
    attrKey,
    view.mixin.ActivityAttributePresenter
  )

  if (model !== undefined) {
    return model
  }

  return await getAttributePresenterSafe(client, (update as ActivityAttributeUpdate).mixin ?? _class, attrKey)
}

export async function getAttributeValues (
  client: Client,
  value: any | any[],
  attrClass: Ref<Class<Doc>>
): Promise<any[]> {
  const values = Array.isArray(value) ? value : [value]
  if (values.some((value) => typeof value !== 'string')) {
    return values
  }

  if (valueTypes.includes(attrClass)) {
    return values
  }

  const docs = await client.findAll(attrClass, { _id: { $in: values } })
  const docIds = docs.map(({ _id }) => _id)
  const missedIds = values.filter((value) => !docIds.includes(value))
  const removedDocs = await Promise.all(missedIds.map(async (value) => await buildRemovedDoc(client, value, attrClass)))
  const allDocs = [...docs, ...removedDocs].filter((doc) => !(doc == null))

  if (allDocs.length > 0) {
    return allDocs
  }

  return values
}

export function isActivityMessage (message: Message): message is ActivityMessage {
  return message.type === MessageType.Activity
}

export const defaultEnabledFilters = [ActivityFilter.Attributes, ActivityFilter.Messages]

export const filtersDef: ActivityFilterDef[] = [{
  id: ActivityFilter.Attributes,
  label: communication.string.Attributes,
  filter: m => m.type === MessageType.Activity
}, {
  id: ActivityFilter.Messages,
  label: communication.string.Messages,
  filter: m => m.type === MessageType.Text
}]

export function filterMessages (messages: Message[], filters: ActivityFilter[]): Message[] {
  const filterDefs = filtersDef.filter(it => filters.includes(it.id))
  return messages.filter(it => filterDefs.some(def => def.filter(it)))
}

export function getCollectionAttribute (
  hierarchy: Hierarchy,
  objectClass: Ref<Class<Doc>>,
  collection?: string
): Attribute<Collection<AttachedDoc>> | undefined {
  if (collection === undefined) {
    return undefined
  }

  const descendants = hierarchy.getDescendants(objectClass)

  for (const descendant of descendants) {
    const collectionAttribute = hierarchy.findAttribute(descendant, collection)
    if (collectionAttribute !== undefined) {
      return collectionAttribute
    }
  }

  return undefined
}

// Aggregation

// function mergeMessages(messages: Message[]): Message[] {
//   const result: Message[] = []
//   for (let i = 0; i < messages.length; i++) {
//     const currentMessage = messages[i]
//     if (
//       isActivityMessage(currentMessage) &&
//       currentMessage.extra.update?.type === ActivityUpdateType.CollaborativeChange
//     ) {
//       for (let j = i + 1; j < messages.length; j++) {
//         const nextMessage = messages[j]
//         if (
//           currentMessage.creator === nextMessage.creator &&
//           isActivityMessage(nextMessage) &&
//           nextMessage.extra.update?.type === ActivityUpdateType.CollaborativeChange &&
//           nextMessage.created.getTime() - currentMessage.created.getTime() < 1000 * 60 * 10
//         ) {
//           currentMessage.extra.update.value = nextMessage.extra.update.value
//           currentMessage.created = nextMessage.created
//           i = j
//         } else {
//           break
//         }
//       }
//     }
//     result.push(currentMessage)
//   }
//   return result
// }

// Use 5 minutes to combine similar messages
const combineThresholdMs = 5 * 60 * 1000

function aggregateMessages (
  messages: Message[],
  sortingOrder: SortingOrder = SortingOrder.Ascending
): Array<Aggregated<Message>> {
  if (sortingOrder === SortingOrder.Descending) {
    sortMessages(messages)
  }
  const result: Array<Aggregated<Message>> = []
  const groupedByAggKey: Map<string, Message[]> = groupByArray(messages, getMessageAggregateKey)

  for (const [, groupedMessages] of groupedByAggKey) {
    if (groupedMessages.length === 1) {
      result.push(...groupedMessages)
    } else {
      const forMerge = groupByTime(groupedMessages)

      forMerge.forEach((timeGroup) => {
        if (timeGroup[0]?.type !== MessageType.Activity) {
          result.push(...timeGroup)
        } else {
          const aggregated = aggregateActivityMessages(sortMessages(timeGroup) as ActivityMessage[])
          result.push(...aggregated)
        }
      })
    }
  }

  return sortMessages(
    result,
    sortingOrder
  )
}

export default aggregateMessages

function sortMessages (
  messages: Message[],
  order: SortingOrder = SortingOrder.Ascending
): Message[] {
  return messages.sort((message1, message2) =>
    order === SortingOrder.Ascending
      ? activityMessagesComparator(message1, message2)
      : activityMessagesComparator(message2, message1)
  )
}

function canAggregateMessage (message: Message): boolean {
  const hasReactions = Object.keys(message.reactions).length > 0
  const hasThreads = message.threads.length > 0

  return !hasReactions && !hasThreads
}

function groupByTime (messages: Message[]): Message[][] {
  const result: Message[][] = []

  for (const message1 of messages) {
    if (result.some((forMerge) => forMerge.includes(message1))) {
      continue
    }

    const forMerge: Message[] = [message1]

    for (const message2 of messages) {
      if (message1.id === message2.id) {
        continue
      }

      const time1 = message1.created.getTime()
      const time2 = message2.created.getTime()
      const timeDiff = time2 - time1

      if (timeDiff >= 0 && timeDiff < combineThresholdMs) {
        forMerge.push(message2)
      }
    }

    result.push(forMerge)
  }

  return result
}

function getMessageAggregateKey (message: Message): string {
  if (message.type === MessageType.Text) {
    return message.id
  }

  if (!canAggregateMessage(message)) return message.id

  const activityMessage = message as ActivityMessage
  const { extra } = activityMessage
  if (extra.update?.type === ActivityUpdateType.Attribute) {
    return [message.docId, message.creator, getAttributeAggregateKey(extra.update)].join('_')
  }

  if (extra.update?.type === ActivityUpdateType.Collection) {
    return [message.docId, message.creator, extra.update.collection].join('_')
  }

  return message.id
}

function aggregateActivityAttributes (messages: ActivityMessage[]): Aggregated<ActivityMessage> | undefined {
  const firstMessage = messages[0]
  const lastMessage = messages[messages.length - 1]

  let mergedUpdate = firstMessage.extra.update as ActivityAttributeUpdate

  messages.forEach((message) => {
    const update = message.extra.update as ActivityAttributeUpdate
    if (message.id !== firstMessage.id && update !== undefined) {
      mergedUpdate = mergeAttributeUpdates(update, mergedUpdate)
    }
  })

  if (mergedUpdate === undefined) {
    return undefined
  }

  const hasChanges =
    (mergedUpdate.added ?? []).length > 0 ||
    (mergedUpdate.removed ?? []).length > 0 ||
    (Array.isArray(mergedUpdate.set) && mergedUpdate.set.length > 0) ||
    (!Array.isArray(mergedUpdate.set) && mergedUpdate.set !== undefined)

  if (!hasChanges) return undefined

  return {
    ...lastMessage,
    extra: {
      ...lastMessage.extra,
      update: mergedUpdate
    },
    previous: messages.slice(0, -1)
  }
}

function aggregateActivityMessages (messages: ActivityMessage[]): Array<Aggregated<ActivityMessage>> {
  if (messages.length === 0) return []
  if (messages.length === 1) return messages

  if (messages[0].extra.action === 'update' && messages[0].extra.update?.type === ActivityUpdateType.Attribute) {
    return [aggregateActivityAttributes(messages)].filter(notEmpty)
  }

  if (messages[0].extra.update?.type === ActivityUpdateType.Collection) {
    const removeMessages = messages.filter(({ extra }) => extra.action === 'remove')
    const createMessages = messages.filter(({ extra }) => extra.action === 'create')
    const removedObjectIds = removeMessages.map(({ extra }) => (extra.update as ActivityCollectionUpdate).objectId)
    const createdObjectIds = createMessages.map(({ extra }) => (extra.update as ActivityCollectionUpdate).objectId)

    const createMessagesForMerge = createMessages.filter(
      ({ extra }) => !removedObjectIds.includes((extra.update as ActivityCollectionUpdate).objectId)
    )
    const removeMessagesForMerge = removeMessages.filter(
      ({ extra }) => !createdObjectIds.includes((extra.update as ActivityCollectionUpdate).objectId)
    )

    createMessagesForMerge.sort(activityMessagesComparator)
    removeMessagesForMerge.sort(activityMessagesComparator)

    const res: Array<Aggregated<ActivityMessage>> = []

    if (createMessagesForMerge.length > 0) {
      res.push({
        ...createMessagesForMerge[createMessagesForMerge.length - 1],
        previous: createMessagesForMerge.slice(0, -1)
      })
    }

    if (removeMessagesForMerge.length > 0) {
      res.push({
        ...removeMessagesForMerge[removeMessagesForMerge.length - 1],
        previous: removeMessagesForMerge.slice(0, -1)
      })
    }

    return res
  }

  return messages
}

function mergeAttributeUpdates (
  update: ActivityAttributeUpdate,
  prevUpdate?: ActivityAttributeUpdate
): ActivityAttributeUpdate {
  if (prevUpdate === undefined) return update
  if (update.attrKey !== prevUpdate.attrKey) return update

  const added = (update.added ?? [])
    .filter((item) => !(prevUpdate.removed ?? []).includes(item))
    .concat((prevUpdate.added ?? []).filter((item) => !(update.removed ?? []).includes(item)))
  const removed = (update.removed ?? [])
    .filter((item) => !(prevUpdate.added ?? []).includes(item))
    .concat((prevUpdate.removed ?? []).filter((item) => !(update.added ?? []).includes(item)))

  return {
    ...update,
    added,
    removed
  }
}

function getAttributeAggregateKey (update: ActivityAttributeUpdate): string {
  const { attrKey, attrClass, mixin } = update

  return [attrKey, attrClass, mixin].join('-')
}

function activityMessagesComparator (message1: Message, message2: Message): number {
  const time1 = message1.created.getTime()
  const time2 = message2.created.getTime()

  return time1 - time2
}
