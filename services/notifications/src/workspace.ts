//
// Copyright © 2026 Intabia Fusion Inc.
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

import core, {
  AccountUuid,
  Class,
  Data,
  Doc,
  Hierarchy,
  MeasureContext,
  ModelDb,
  PersonId,
  readOnlyGuestAccountUuid,
  Ref,
  Space,
  Timestamp,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxFactory,
  TxProcessor,
  TxRemoveDoc
} from '@hcengineering/core'
import activity, { ActivityMessage, Reaction } from '@hcengineering/activity'
import { RestClient } from '@hcengineering/api-client'
import notification, {
  DocNotifyContext,
  InboxNotification,
  NotificationContent,
  NotificationProvider,
  NotificationType,
  ReactionInboxNotification,
  TxNotificationType
} from '@hcengineering/notification'
import contact, { Employee } from '@hcengineering/contact'
import serverNotification, {
  getSenderName,
  normalizeTextMessage,
  Receiver,
  TypeMatch
} from '@hcengineering/server-notification'
import { StorageAdapter } from '@hcengineering/storage'
import { WorkspaceLoginInfo } from '@hcengineering/account-client'

import WsCache from './cache'
import { Client, NotifyResult } from './types'
import {
  getAllowedProviders,
  getMessage,
  getMessageNotificationContent,
  getMessageNotifyResult,
  getNotifiedUsers,
  getTxNotifyResult,
  getTypeMatchClient,
  isMatchedTxType
} from './utils'
import { createMentionsData, getMentionNotificationContent } from './mention'
import { getReactionNotificationContent } from './reaction'
import { getResource, IntlString } from '@hcengineering/platform'
import { markupToText } from '@hcengineering/text-core'
import config from './config'

class Workspace {
  private readonly cache: WsCache

  private inProgress = false
  private lastTxDate: Timestamp | undefined = undefined

  private readonly txFactory = new TxFactory(core.account.System)

  constructor (
    private readonly ctx: MeasureContext,
    private readonly ws: WorkspaceLoginInfo,
    private readonly hierarchy: Hierarchy,
    private readonly model: ModelDb,
    private readonly client: RestClient,
    private readonly storage: StorageAdapter,
    private readonly txTypes: TxNotificationType[]
  ) {
    this.cache = new WsCache(this.ctx, hierarchy, model, client)
  }

  async tx (tx: TxCUD<Doc>): Promise<void> {
    this.inProgress = true
    const domain = this.hierarchy.getDomain(tx.objectClass)

    if (domain === 'model') {
      this.model.addTxes(this.ctx, [tx], true)
      this.hierarchy.tx(tx)
    }

    this.cache.tx(tx)

    if (this.hierarchy.isDerived(tx.objectClass, notification.class.DocNotifyContext)) return
    if (this.hierarchy.isDerived(tx.objectClass, notification.class.InboxNotification)) return
    if (this.hierarchy.isDerived(tx.objectClass, notification.class.BrowserNotification)) return
    if (this.hierarchy.isDerived(tx.objectClass, activity.class.ActivityReference)) return

    const res: Tx[] = []

    res.push(...(await this.processTxNotifications(tx)))

    const notifiedUsers = getNotifiedUsers(this.hierarchy, res)

    if (this.hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
      res.push(...(await this.processMessage(tx as TxCUD<ActivityMessage>, notifiedUsers)))
    }

    if (res.length > 0) {
      this.lastTxDate = tx.createdOn ?? tx.modifiedOn
    }

    await this.applyTxes(res)

    this.inProgress = false
  }

  private async applyTxes (txes: Tx[]): Promise<void> {
    for (const resTx of txes) {
      try {
        await this.client.tx(resTx)
      } catch (e) {
        console.error(e)
        this.ctx.error('Failed to send tx', { tx: resTx })
      }
    }
  }

  private getClient (): Client {
    return {
      ctx: this.ctx,
      rest: this.client,
      txFactory: this.txFactory,
      workspace: this.ws,
      storage: this.storage,
      hierarchy: this.hierarchy,
      model: this.model
    }
  }

  async processTxNotifications (tx: TxCUD<Doc>): Promise<Tx[]> {
    if (this.hierarchy.isDerived(tx.objectClass, activity.class.Reaction)) {
      return await this.processReaction(tx as TxCUD<Reaction>)
    }

    let matched: TxNotificationType[] = []
    const client: Client = this.getClient()

    for (const type of this.txTypes) {
      if (isMatchedTxType(client, tx, type)) {
        matched.push(type)
      }
    }
    console.log('MATCHED', matched)
    if (matched.length === 0) return []

    const txAttachedToDoc =
      tx.attachedTo != null && tx.attachedToClass != null
        ? await this.cache.getDoc(tx.attachedTo, tx.attachedToClass)
        : undefined
    const txObject = await this.cache.getDoc(tx.objectId, tx.objectClass)

    if (txObject === undefined) return []

    const space = await this.cache.getDocSpace(txObject)
    if (space === undefined) return []

    const res: Tx[] = []
    const doc = txAttachedToDoc ?? txObject
    const contexts = await this.cache.getContexts(doc._id)

    res.push(...this.getUpdateContextTxes(contexts, tx.modifiedOn))

    const settings = await this.cache.getSettings()
    const sender = await this.cache.getSender(tx.modifiedBy)
    const mentionType = matched.find((it) => it._id === notification.ids.MentionNotificationType)

    if (mentionType != null) {
      const result = await createMentionsData(
        client,
        this.cache,
        tx,
        contexts,
        txAttachedToDoc,
        txObject,
        settings,
        mentionType
      )
      res.push(...result.txes)

      for (const d of result.data) {
        res.push(
          ...(await this.createNotifications(
            notification.class.MentionInboxNotification,
            d.data,
            getMentionNotificationContent(
              client.hierarchy,
              txAttachedToDoc ?? txObject,
              txObject,
              d.data.markup,
              sender
            ),
            doc,
            tx.modifiedOn,
            tx.modifiedBy,
            d.context,
            d.receiver,
            d.notifyResult
          ))
        )
      }

      matched = matched.filter((it) => it._id !== notification.ids.MentionNotificationType)
    }

    if (matched.length === 0) return res

    const notifiedUsers = getNotifiedUsers(this.hierarchy, res)

    const collaborators = (await this.getCollaboratorAccounts(doc, space)).filter((it) => !notifiedUsers.includes(it))
    if (collaborators.length === 0) return res

    const receivers = await this.cache.getReceivers(collaborators)

    for (const receiver of receivers) {
      const context = contexts.find((it) => it.user === receiver.account)
      const notifyResult = await getTxNotifyResult(client, tx, doc, receiver, settings, matched)

      const types = notifyResult[notification.providers.InboxNotificationProvider] ?? []
      const type = types[0] as TxNotificationType
      if (type == null) continue

      if (client.hierarchy.hasMixin(type, serverNotification.mixin.TypeMatch)) {
        const mixin = client.hierarchy.as<NotificationType, TypeMatch>(type, serverNotification.mixin.TypeMatch)
        if (mixin.create == null) continue
        const f = await getResource(mixin.create)
        const data = await f(getTypeMatchClient(client), tx, txAttachedToDoc, txObject, receiver)
        if (data == null) continue
        let content: NotificationContent

        if (mixin.contentProvider != null) {
          const f = await getResource(mixin.contentProvider)
          content = await f(getTypeMatchClient(client), type, tx, txAttachedToDoc ?? txObject, txObject, sender)
        } else {
          const intlParams: Record<string, string | number> = {
            ...data.props,
            senderName: getSenderName(sender, config.LastNameFirst)
          }
          const intlParamsNotLocalized: Record<string, IntlString> = { ...data.propsIntl }

          if (data.markup != null) {
            intlParams.message = normalizeTextMessage(markupToText(data.markup))
          } else if (data.message != null) {
            intlParamsNotLocalized.message = data.message
          }

          if (data.header != null) {
            intlParamsNotLocalized.title = data.header
          }

          const message = intlParams.message ?? intlParamsNotLocalized.message
          content = {
            title:
              intlParams.identifier != null
                ? notification.string.CommonNotificationTitleWithIdentifier
                : notification.string.CommonNotificationTitle,
            body:
              message != null
                ? notification.string.MessageNotificationBody
                : notification.string.UpdateNotificationBody,
            intlParams,
            intlParamsNotLocalized
          }
        }
        res.push(
          ...(await this.createNotifications(
            notification.class.CommonInboxNotification,
            data,
            content,
            doc,
            tx.modifiedOn,
            tx.modifiedBy,
            context,
            receiver,
            notifyResult
          ))
        )
      }
    }

    return res
  }

  private async processReaction (tx: TxCUD<Reaction>): Promise<Tx[]> {
    if (tx._class === core.class.TxCreateDoc) {
      return await this.processCreateReaction(tx as TxCreateDoc<Reaction>)
    } else if (tx._class === core.class.TxRemoveDoc) {
      return await this.processRemoveReaction(tx as TxRemoveDoc<Reaction>)
    }

    return []
  }

  private async processCreateReaction (tx: TxCreateDoc<Reaction>): Promise<Tx[]> {
    if (tx.attachedTo === undefined) return []

    const reaction = TxProcessor.createDoc2Doc(tx)

    const message = await this.client.findOne(activity.class.ActivityMessage, { _id: reaction.attachedTo })
    if (message === undefined) return []

    const socialId = message.createdBy ?? message.modifiedBy
    if (socialId === core.account.System || socialId === tx.modifiedBy) return []

    const doc = await this.client.findOne(message.attachedToClass, { _id: message.attachedTo })
    if (doc === undefined) return []

    const account = await this.cache.getAccountBySocialId(socialId)
    if (account == null) return []

    const receiver = (await this.cache.getReceivers([account]))[0]
    if (receiver === undefined) return []

    const settings = await this.cache.getSettings()
    const client: Client = this.getClient()

    const data: Partial<Data<ReactionInboxNotification>> = {
      emoji: reaction.emoji,
      attachedTo: message._id,
      attachedToClass: message._class,
      ref: reaction._id
    }

    const type: TxNotificationType = this.model.findAllSync(notification.class.TxNotificationType, {
      _id: activity.ids.AddReactionNotification
    })[0]

    const providers: Ref<NotificationProvider>[] = getAllowedProviders(client, settings, receiver.socialIds, type)
    if (providers.length === 0 || !providers.includes(notification.providers.InboxNotificationProvider)) return []

    const res: Tx[] = []
    const context = (await this.cache.getContexts(doc._id)).find((it) => it.user === receiver.account)

    const notifyResult: NotifyResult = Object.fromEntries(providers.map((p) => [p, [type]]))
    const sender = await this.cache.getSender(reaction.modifiedBy)

    const txes = await this.createNotifications(
      notification.class.ReactionInboxNotification,
      data,
      getReactionNotificationContent(message, reaction, sender),
      doc,
      reaction.modifiedOn,
      reaction.modifiedBy,
      context,
      receiver,
      notifyResult
    )

    res.push(...txes)

    return res
  }

  private async processRemoveReaction (tx: TxRemoveDoc<Reaction>): Promise<Tx[]> {
    const toRemove = await this.client.findAll(notification.class.ReactionInboxNotification, { ref: tx.objectId })

    return toRemove.map((it) => this.txFactory.createTxRemoveDoc(it._class, it.space, it._id))
  }

  private async processMessage (tx: TxCUD<ActivityMessage>, notifiedUsers: AccountUuid[]): Promise<Tx[]> {
    if (tx._class === core.class.TxCreateDoc) {
      return await this.processCreateMessage(tx as TxCreateDoc<ActivityMessage>, notifiedUsers)
    } else if (tx._class === core.class.TxRemoveDoc) {
      return await this.processRemoveMessage(tx as TxRemoveDoc<ActivityMessage>)
    }

    return []
  }

  private async processCreateMessage (tx: TxCreateDoc<ActivityMessage>, notifiedUsers: AccountUuid[]): Promise<Tx[]> {
    const client = this.getClient()
    const message = await getMessage(client, tx)

    const doc = await this.cache.getDoc(message.attachedTo, message.attachedToClass)
    if (doc === undefined) return []

    const space = await this.cache.getDocSpace(doc)
    if (space === undefined) return []

    const res: Tx[] = []
    const contexts = await this.cache.getContexts(doc._id)

    res.push(...this.getUpdateContextTxes(contexts, message.modifiedOn))

    const collaborators = (await this.getCollaboratorAccounts(doc, space)).filter((it) => !notifiedUsers.includes(it))
    if (collaborators.length === 0) return res

    const settings = await this.cache.getSettings()
    const receivers = await this.cache.getReceivers(collaborators)

    if (receivers.length === 0) return res

    const sender = await this.cache.getSender(message.modifiedBy)

    for (const receiver of receivers) {
      const context = contexts.find((it) => it.user === receiver.account)
      const notifyResult = await getMessageNotifyResult(client, message, doc, receiver, settings)

      const types = (notifyResult[notification.providers.InboxNotificationProvider] ?? []).map((it) => it._id)
      if (types.length === 0) continue

      res.push(
        ...(await this.createNotifications(
          notification.class.ActivityInboxNotification,
          {
            attachedTo: message._id,
            attachedToClass: message._class
          },
          getMessageNotificationContent(client.hierarchy, doc, message, sender),
          doc,
          message.modifiedOn,
          message.modifiedBy,
          context,
          receiver,
          notifyResult
        ))
      )
    }
    return res
  }

  private async createNotifications<T extends InboxNotification>(
    _class: Ref<Class<T>>,
    data: Partial<Data<T>>,
    content: NotificationContent,
    doc: Doc,
    modifiedOn: Timestamp,
    modifiedBy: PersonId,
    context: DocNotifyContext | undefined,
    receiver: Receiver,
    notifyResult: NotifyResult
  ): Promise<Tx[]> {
    const res: Tx[] = []

    let contextId: Ref<DocNotifyContext>
    if (context != null) {
      contextId = context._id
    } else {
      const contextTx = this.getCreateContextTx(doc, receiver, modifiedOn)
      res.push(contextTx)
      contextId = TxProcessor.createDoc2Doc(contextTx)._id
    }

    const allowedProviders: Record<Ref<NotificationProvider>, Ref<NotificationType>[]> = Object.fromEntries(
      Object.entries(notifyResult).map(([provider, types]) => [provider, types.map((it) => it._id)])
    ) as Record<Ref<NotificationProvider>, Ref<NotificationType>[]>

    const attrs: Data<InboxNotification> = {
      ...content,
      ...data,
      objectId: doc._id,
      objectClass: doc._class,
      user: receiver.account,
      isViewed: receiver.role === 'GUEST' && receiver.account === readOnlyGuestAccountUuid,
      docNotifyContext: contextId,
      archived: false,
      allowedProviders
    }
    const tx = this.txFactory.createTxCreateDoc(_class, receiver.space, attrs, undefined, modifiedOn, modifiedBy)
    res.push(tx)

    return res
  }

  private getCreateContextTx (doc: Doc, receiver: Receiver, createdOn: Timestamp): TxCreateDoc<DocNotifyContext> {
    const createTx = this.txFactory.createTxCreateDoc(notification.class.DocNotifyContext, receiver.space, {
      user: receiver.account,
      objectId: doc._id,
      objectClass: doc._class,
      objectSpace: doc.space,
      isPinned: false,
      hidden: false,
      lastUpdate: createdOn,
      lastNotify: createdOn
    })

    this.cache.storeContext(TxProcessor.createDoc2Doc(createTx))
    return createTx
  }

  private async processRemoveMessage (tx: TxRemoveDoc<ActivityMessage>): Promise<Tx[]> {
    return []
  }

  private async getCollaboratorAccounts (doc: Doc, space: Space): Promise<AccountUuid[]> {
    const collaborators = await this.cache.getCollaborators(doc._id, doc._class)

    const filtered = !space.private
      ? collaborators
      : collaborators.filter((it) => space.members.includes(it.collaborator))

    const accounts = new Set(filtered.map((it) => it.collaborator))

    if (this.hierarchy.isDerived(doc._class, contact.mixin.Employee)) {
      const account = (doc as Employee).personUuid

      if (account != null) {
        accounts.add(account)
      }
    }

    return Array.from(accounts)
  }

  private getUpdateContextTxes (contexts: DocNotifyContext[], timestamp: Timestamp): Tx[] {
    return contexts.map((it) =>
      this.txFactory.createTxUpdateDoc(it._class, it.space, it._id, {
        hidden: false,
        lastUpdate: Math.max(it.lastUpdate ?? 0, timestamp)
      })
    )
  }

  public isInProgress (): boolean {
    return this.inProgress
  }

  public getLastTxDate (): Timestamp | undefined {
    return this.lastTxDate
  }
}

export default Workspace
