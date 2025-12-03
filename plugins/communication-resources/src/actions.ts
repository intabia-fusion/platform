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

import communication, {
  type Applet,
  type MessageAction,
  type MessageActionFunction,
  type MessageActionVisibilityTester
} from '@hcengineering/communication'
import { showPopup } from '@hcengineering/ui'
import emojiPlugin from '@hcengineering/emoji'
import {
  type AppletParams,
  type AttachmentID,
  type BlobAttachment,
  type BlobParams,
  type LinkPreviewParams,
  linkPreviewType,
  type Message,
  type MessageID,
  MessageType,
  SortingOrder
} from '@hcengineering/communication-types'
import cardPlugin, { type Card, type MasterTag } from '@hcengineering/card'
import { addRefreshListener, deleteFile, getClient, getCommunicationClient } from '@hcengineering/presentation'
import {
  AccountRole,
  fillDefaults,
  generateId,
  getCurrentAccount,
  hasAccountRole,
  type MarkupBlobRef,
  type Ref,
  type Doc
} from '@hcengineering/core'
import { getMetadata, getResource } from '@hcengineering/platform'
import { employeeByPersonIdStore } from '@hcengineering/contact-resources'
import { getEmployeeBySocialId } from '@hcengineering/contact'
import { makeRank } from '@hcengineering/rank'
import { get } from 'svelte/store'
import aiBot from '@hcengineering/ai-bot'
import CreateCardFromMessagePopup from './components/CreateCardFromMessagePopup.svelte'
import { Analytics } from '@hcengineering/analytics'
import { isAppletAttachment, isBlobAttachment, isLinkPreviewAttachment } from '@hcengineering/communication-shared'

import { loadLinkPreviewParams, showForbidden, toggleReaction } from './utils'
import { messageEditingStore, threadCreateMessageStore } from './stores'
import { type AppletDraft, type BlobDraft, type LinkPreviewDraft } from './types'

export const addReaction: MessageActionFunction = async (message, doc: Doc, evt, onOpen, onClose) => {
  // if (!isCardAllowedForCommunications(doc)) {
  //   await showForbidden()
  //   return
  // }

  if (onOpen !== undefined) onOpen()

  showPopup(
    emojiPlugin.component.EmojiPopup,
    {},
    evt?.target as HTMLElement,
    async (result) => {
      if (onClose !== undefined) onClose()
      const emoji = result?.text
      if (emoji == null) return

      await toggleReaction(message, emoji)
    },
    () => {}
  )
}

export const replyInThread: MessageActionFunction = async (message: Message, doc: Doc): Promise<void> => {
  // if (!isCardAllowedForCommunications(doc)) {
  //   await showForbidden()
  //   return
  // }

  const thread = message.threads[0]
  if (thread != null) {
    const client = getClient()
    const _id = thread.threadId
    const card = await client.findOne(cardPlugin.class.Card, { _id: _id as Ref<Card> })
    if (card === undefined) return
    const r = await getResource(cardPlugin.function.OpenCardInSidebar)
    await r(_id, card)
    return
  }

  await attachCardToMessage(
    message,
    doc,
    createThreadTitle(message, doc),
    communication.type.Thread,
    `${doc._id}_${message.id}` as Ref<Card>
  )
}

export async function attachCardToMessage (
  message: Message,
  doc: Doc,
  title: string,
  type: Ref<MasterTag>,
  _id?: Ref<Card>
): Promise<void> {
  const client = getClient()
  const communicationClient = getCommunicationClient()
  const hierarchy = client.getHierarchy()

  const threadCardID = _id ?? generateId<Card>()

  const author =
    get(employeeByPersonIdStore).get(message.creator) ?? (await getEmployeeBySocialId(client, message.creator))
  const lastOne = await client.findOne(cardPlugin.class.Card, {}, { sort: { rank: SortingOrder.Descending } })
  const data = fillDefaults<Card>(
    hierarchy,
    {
      title,
      rank: makeRank(lastOne?.rank, undefined),
      content: '' as MarkupBlobRef,
      blobs: {},
      parentInfo: [
        // {
        //   _id: doc._id,
        //   _class: doc._class,
        //   title: doc.title
        // }
      ]
    },
    type
  )
  await client.createDoc(type, doc.space, data, threadCardID)
  await communicationClient.attachThread(doc._class, doc._id, message.id, threadCardID, type)
  if (author?.active === true && author?.personUuid !== undefined) {
    // TODO: FIXME
    // await communicationClient.addCollaborators(type, threadCardID, [author.personUuid])
  }
  const threadCard = await client.findOne(cardPlugin.class.Card, { _id: threadCardID })
  if (threadCard === undefined) return
  const r = await getResource(cardPlugin.function.OpenCardInSidebar)
  await r(threadCard._id, threadCard)
}

function createThreadTitle (message: Message, doc: Doc): string {
  // const markup = toMarkup(message.content)
  // const messageText = markupToText(markup).trim()

  // return messageText.length > 0 ? messageText : `Thread from ${doc.title}`
  return ''
}

export const canReplyInThread: MessageActionVisibilityTester = (message: Message): boolean => {
  return message.type === MessageType.Text && message.extra?.threadRoot !== true
}

export const translateMessage: MessageActionFunction = async (message: Message): Promise<void> => {
  // const language = get(translateToStore) ?? get(languageStore)
  //
  // // if (isMessageManualTranslating(message.cardId, message.id)) return
  // const result = get(translateMessagesStore).find((it) => it.cardId === message.cardId && it.messageId === message.id)
  //
  // showOriginalMessagesStore.update((store) =>
  //   store.filter(([cId, mId]) => cId !== message.cardId || mId !== message.id)
  // )
  //
  // if (result != null) return
  //
  // translateMessagesStore.update((store) => {
  //   store.push({ inProgress: true, messageId: message.id, cardId: message.cardId })
  //   return store
  // })
  //
  // const markup = toMarkup(message.content)
  // const currentTranslate = message?.translates?.[language] ?? ''
  // const response = currentTranslate !== '' ? toMarkup(currentTranslate) : (await aiTranslate(markup, language))?.text
  //
  // if (response !== undefined) {
  //   translateMessagesStore.update((store) => {
  //     return store.map((it) => {
  //       if (it.cardId === message.cardId && it.messageId === message.id) {
  //         return {
  //           ...it,
  //           inProgress: false,
  //           result: response
  //         }
  //       }
  //       return it
  //     })
  //   })
  // } else {
  //   translateMessagesStore.update((store) => {
  //     return store.filter((it) => it.cardId !== message.cardId || it.messageId !== message.id)
  //   })
  // }
}

export const canTranslateMessage: MessageActionVisibilityTester = (message: Message): boolean => {
  const url = getMetadata(aiBot.metadata.EndpointURL) ?? ''
  if (url === '') return false
  return message.type === MessageType.Text
}

export const showOriginalMessage: MessageActionFunction = async (message: Message): Promise<void> => {
  // const messageId = message.id
  //
  // showOriginalMessagesStore.update((store) => {
  //   store.push([message.cardId, messageId])
  //   return store
  // })
}

export const canShowOriginalMessage: MessageActionVisibilityTester = (message: Message): boolean => {
  return canTranslateMessage(message)
}

export const editMessage: MessageActionFunction = async (message: Message): Promise<void> => {
  messageEditingStore.set(message.id)
}

export const canEditMessage: MessageActionVisibilityTester = (message: Message): boolean => {
  if (message.type !== MessageType.Text) return false
  const me = getCurrentAccount()
  return me.socialIds.includes(message.creator)
}

export const removeMessage: MessageActionFunction = async (message: Message): Promise<void> => {
  const communicationClient = getCommunicationClient()
  await communicationClient.removeMessage(message.docClass, message.docId, message.id)
}

export const canRemoveMessage: MessageActionVisibilityTester = (message: Message): boolean => {
  if (message.type !== MessageType.Text) return false
  const me = getCurrentAccount()
  return me.socialIds.includes(message.creator)
}

export const createCard: MessageActionFunction = async (message: Message, doc: Doc): Promise<void> => {
  if (!hasAccountRole(getCurrentAccount(), AccountRole.User)) {
    await showForbidden()
    return
  }
  threadCreateMessageStore.set(message)
  showPopup(CreateCardFromMessagePopup, { message, doc }, undefined, () => {
    threadCreateMessageStore.set(undefined)
  })
}

export const canCreateCard: MessageActionVisibilityTester = (message: Message): boolean => {
  return canReplyInThread(message)
}

let allMessageActions: MessageAction[] | undefined

addRefreshListener(() => {
  allMessageActions = undefined
})

export async function getMessageActions (message: Message): Promise<MessageAction[]> {
  const client = getClient()
  const actions: MessageAction[] =
    allMessageActions ?? client.getModel().findAllSync(communication.class.MessageAction, {})

  if (allMessageActions === undefined) {
    allMessageActions = actions
  }

  const filteredActions = await filterActions(message, actions)

  return filteredActions.sort((a, b) => a.order - b.order)
}

async function filterActions (message: Message, actions: MessageAction[]): Promise<MessageAction[]> {
  const result: MessageAction[] = []
  for (const action of actions) {
    if (action.visibilityTester == null) {
      result.push(action)
    } else {
      const visibilityTester = await getResource(action.visibilityTester)

      if (visibilityTester(message)) {
        result.push(action)
      }
    }
  }

  return result
}

export async function createMessage (
  doc: Doc,
  markdown: string,
  blobs: BlobDraft[],
  applets: AppletDraft[],
  appletModels: Applet[],
  links: LinkPreviewDraft[],
  urlsToLoad: string[],
  linksData: Map<string, LinkPreviewParams | null>
): Promise<void> {
  const communicationClient = getCommunicationClient()
  const client = getClient()

  const { messageId } = await communicationClient.createMessage(doc._class, doc._id, markdown)
  void client.update(doc, {}, false, Date.now())

  void attachApplets(doc, messageId, applets, appletModels)

  if (blobs.length > 0) {
    void communicationClient.attachmentPatch<BlobParams>(doc._class, doc._id, messageId, {
      add: blobs.map((it) => ({
        id: it.blobId as any as AttachmentID,
        mimeType: it.mimeType,
        params: it
      }))
    })
  }

  if (links.length > 0) {
    void communicationClient.attachmentPatch<LinkPreviewParams>(doc._class, doc._id, messageId, {
      add: links.map((it) => ({
        mimeType: linkPreviewType,
        params: it
      }))
    })
  }

  for (const url of urlsToLoad) {
    if (links.some((it) => it.url === url)) continue
    const fetchedData = linksData.get(url)
    if (fetchedData === null) continue
    const params = fetchedData ?? (await loadLinkPreviewParams(url))
    if (params === undefined) continue
    void communicationClient.attachmentPatch<LinkPreviewParams>(doc._class, doc._id, messageId, {
      add: [
        {
          mimeType: linkPreviewType,
          params
        }
      ]
    })
  }
}

export async function updateMessage (
  doc: Doc,
  message: Message,
  markdown: string,
  blobs: BlobDraft[],
  applets: AppletDraft[],
  appletModels: Applet[],
  links: LinkPreviewDraft[]
): Promise<void> {
  const communicationClient = getCommunicationClient()

  await communicationClient.updateMessage(doc._class, doc._id, message.id, markdown)

  const attachBlobs = blobs.filter(
    (b) => !message.attachments.some((it) => isBlobAttachment(it) && it.params.blobId === b.blobId)
  )

  void attachApplets(
    doc,
    message.id,
    applets.filter((a) => !message.attachments.some((it) => it.id === a.id)),
    appletModels
  )

  if (attachBlobs.length > 0) {
    void communicationClient.attachmentPatch<BlobParams>(doc._class, doc._id, message.id, {
      add: attachBlobs.map((it) => ({
        id: it.blobId as any as AttachmentID,
        mimeType: it.mimeType,
        params: it
      }))
    })
  }

  const detachBlobs = message.attachments.filter(
    (it) => isBlobAttachment(it) && !blobs.some((b) => b.blobId === it.params.blobId)
  ) as BlobAttachment[]
  if (detachBlobs.length > 0) {
    detachBlobs.forEach((it) => {
      void deleteFile(it.params.blobId)
    })
    void communicationClient.attachmentPatch(doc._class, doc._id, message.id, {
      remove: detachBlobs.map((it) => it.id)
    })
  }

  const detachApplets = message.attachments.filter(
    (it) => isAppletAttachment(it) && !applets.some((a) => a.id === it.id)
  )

  if (detachApplets.length > 0) {
    void communicationClient.attachmentPatch(doc._class, doc._id, message.id, {
      remove: detachApplets.map((it) => it.id)
    })
  }

  const attachLinks = links.filter(
    (l) => !message.attachments.some((it) => isLinkPreviewAttachment(it) && it.params.url === l.url)
  )

  void communicationClient.attachmentPatch(doc._class, doc._id, message.id, {
    add: attachLinks.map((it) => ({
      mimeType: linkPreviewType,
      params: it
    }))
  })
}

async function attachApplets (
  doc: Doc,
  messageId: MessageID,
  applets: AppletDraft[],
  models: Applet[]
): Promise<void> {
  if (applets.length === 0) return

  const communicationClient = getCommunicationClient()
  const toAttach: AppletDraft[] = []

  for (const appletDraft of applets) {
    try {
      const model = models.find((it) => it._id === appletDraft.appletId)
      if (model?.createFn == null) {
        toAttach.push(appletDraft)
        continue
      }
      const r = await getResource(model.createFn)
      await r(doc, messageId, appletDraft.params)
      toAttach.push(appletDraft)
    } catch (err: any) {
      Analytics.handleError(err)
    }
  }

  if (toAttach.length > 0) {
    void communicationClient.attachmentPatch<AppletParams>(doc._class, doc._id, messageId, {
      add: toAttach.map((it) => ({
        mimeType: it.mimeType,
        params: it.params
      }))
    })
  }
}
