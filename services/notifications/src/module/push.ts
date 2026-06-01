// //
// // Copyright © 2025 Hardcore Engineering Inc.
// //
// // Licensed under the Eclipse Public License, Version 2.0 (the "License");
// // you may not use this file except in compliance with the License. You may
// // obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
// //
// // Unless required by applicable law or agreed to in writing, software
// // distributed under the License is distributed on an "AS IS" BASIS,
// // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// //
// // See the License for the specific language governing permissions and
// // limitations under the License.
// //
//
// import serverCore, { TriggerControl } from '@hcengineering/server-core/lib'
// import serverNotification, {
//   NOTIFICATION_BODY_SIZE,
//   PUSH_NOTIFICATION_TITLE_SIZE
// } from '@hcengineering/server-notification/lib'
// import { AccountUuid, Class, concatLink, Doc, Hierarchy, Ref, Tx, TxCreateDoc, TxProcessor } from '@hcengineering/core'
// import notification, {
//   getNotificationMessageId,
//   getNotificationThreadId,
//   notificationId,
//   PushData,
//   PushSubscription
// } from '@hcengineering/notification/lib'
// import { ActivityMessage } from '@hcengineering/activity/lib'
// import serverView from 'server-plugins/view/src'
// import { getMetadata, getResource } from '@hcengineering/platform'
// import { workbenchId } from 'plugins/workbench/src'
// import { encodeObjectURI } from 'plugins/view/src'
// import { PersonSpace } from '@hcengineering/contact'
//
// import { getTranslatedNotificationContent } from '../../../../server-plugins/notification-resources/src/utils'
//
// async function createPush (
//   control: TriggerControl,
//   n: any,
//   receiver: AccountUuid,
//   soundAlert: boolean,
//   receiverSpace: Ref<PersonSpace>,
//   subscriptions: PushSubscription[]
// ): Promise<Tx | undefined> {
//   const { title: _title, body: _body } = await getTranslatedNotificationContent(
//     n,
//     control.branding?.defaultLanguage ?? 'en'
//   )
//
//   const title = _title.slice(0, PUSH_NOTIFICATION_TITLE_SIZE)
//   const body = _body.slice(0, NOTIFICATION_BODY_SIZE)
//
//   const objectIdentity = await getObjectIdentity(n, control)
//
//   const linkProviders = control.modelDb.findAllSync(serverView.mixin.ServerLinkIdProvider, {})
//   const provider = linkProviders.find(({ _id }) => _id === objectIdentity._class)
//
//   let id: string = objectIdentity._id
//
//   if (provider !== undefined) {
//     const encodeFn = await getResource(provider.encode)
//     const cache: Map<Ref<Doc>, Doc> = control.contextCache.get('PushNotificationsHandler') ?? new Map()
//     const doc =
//       cache.get(objectIdentity._id) ??
//       (await control.findAll(control.ctx, objectIdentity._class, { _id: objectIdentity._id }))[0]
//
//     if (doc === undefined) {
//       return
//     }
//
//     cache.set(doc._id, doc)
//     control.contextCache.set('PushNotificationsHandler', cache)
//
//     id = await encodeFn(doc, control)
//   }
//
//   const messageId = getNotificationMessageId(n)
//   const threadId = getNotificationThreadId(n, control.hierarchy)
//   const path =
//     threadId != null
//       ? [workbenchId, control.workspace.url, notificationId, encodeObjectURI(id, n.objectClass), threadId]
//       : [workbenchId, control.workspace.url, notificationId, encodeObjectURI(id, n.objectClass)]
//   const query = messageId != null ? { message: messageId } : undefined
//
//   if (subscriptions.length > 0) {
//     await createPushNotification(control, receiver, title, body, n._id, subscriptions, path, query)
//   }
//
//   const messageInfo = getMessageInfo(n, control.hierarchy)
//   return control.txFactory.createTxCreateDoc(notification.class.BrowserNotification, receiverSpace, {
//     user: receiver,
//     title: n.title ?? notification.string.CommonNotificationTitle,
//     body: n.body ?? notification.string.UpdateNotificationBody,
//     intlParams: n.intlParams ?? { title },
//     intlParamsNotLocalized: n.intlParamsNotLocalized,
//     sender: n.createdBy ?? n.modifiedBy,
//     tag: n._id,
//     objectId: n.objectId,
//     objectClass: n.objectClass,
//     messageId: messageInfo._id,
//     messageClass: messageInfo._class,
//     onClickLocation: {
//       path
//     },
//     soundAlert
//   })
// }
//
// function getMessageInfo (
//   n: any,
//   hierarchy: Hierarchy
// ): {
//     _id?: Ref<ActivityMessage>
//     _class?: Ref<Class<ActivityMessage>>
//   } {
//   // if (hierarchy.isDerived(n._class, notification.class.ActivityInboxNotification)) {
//   //   const activityNotification = n as ActivityInboxNotification
//   //
//   //   if (
//   //     activityNotification.attachedToClass === activity.class.DocUpdateMessage &&
//   //     hierarchy.isDerived(activityNotification.objectClass, activity.class.ActivityMessage)
//   //   ) {
//   //     return {
//   //       _id: activityNotification.objectId as Ref<ActivityMessage>,
//   //       _class: activityNotification.objectClass
//   //     }
//   //   }
//   //
//   //   return {
//   //     _id: activityNotification.attachedTo,
//   //     _class: activityNotification.attachedToClass
//   //   }
//   // }
//   //
//   // if (hierarchy.isDerived(n._class, notification.class.MentionInboxNotification)) {
//   //   const mentionNotification = n as MentionInboxNotification
//   //   if (hierarchy.isDerived(mentionNotification.mentionedInClass, activity.class.ActivityMessage)) {
//   //     return {
//   //       _id: mentionNotification.mentionedIn as Ref<ActivityMessage>,
//   //       _class: mentionNotification.mentionedInClass
//   //     }
//   //   }
//   // }
//
//   return {}
// }
//
// export async function createPushNotification (
//   control: TriggerControl,
//   target: AccountUuid,
//   title: string,
//   body: string,
//   _id: string,
//   subscriptions: PushSubscription[],
//   path?: string[],
//   query?: Record<string, string>
// ): Promise<void> {
//   const pushURL: string | undefined = getMetadata(serverNotification.metadata.WebPushUrl)
//   // TODO: Remove auth token after migration to new services
//   const authToken: string | undefined = getMetadata(serverNotification.metadata.MailAuthToken)
//   if (pushURL === undefined || pushURL === '') return
//   const userSubscriptions = subscriptions.filter((it) => it.user === target)
//   const data: PushData = {
//     title,
//     body,
//     silent: false
//   }
//   if (_id !== undefined) {
//     data.tag = _id
//   }
//   const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
//   const domainPath = `${workbenchId}/${control.workspace.url}`
//   data.domain = concatLink(front, domainPath)
//   if (path !== undefined) {
//     let url = concatLink(front, path.join('/'))
//     if (query !== undefined) {
//       const searchParams = new URLSearchParams(query)
//       url += '?' + searchParams.toString()
//     }
//     data.url = url
//   }
//
//   void sendPushToSubscription(pushURL, authToken, control, target, userSubscriptions, data)
// }
//
// async function sendPushToSubscription (
//   pushURL: string,
//   mailAuth: string | undefined,
//   control: TriggerControl,
//   targetUser: AccountUuid,
//   subscriptions: PushSubscription[],
//   data: PushData
// ): Promise<void> {
//   try {
//     const result: Ref<PushSubscription>[] = (
//       await (
//         await fetch(concatLink(pushURL, '/web-push'), {
//           method: 'post',
//           keepalive: true,
//           headers: {
//             'Content-Type': 'application/json',
//             ...(mailAuth != null ? { Authorization: `Bearer ${mailAuth}` } : {})
//           },
//           body: JSON.stringify({
//             subscriptions,
//             data
//           })
//         })
//       ).json()
//     ).result
//     if (result.length > 0) {
//       const domain = control.hierarchy.findDomain(notification.class.PushSubscription)
//       if (domain !== undefined) {
//         await control.lowLevel.clean(control.ctx, domain, result)
//       }
//     }
//   } catch (err) {
//     control.ctx.info('Cannot send push notification to', { user: targetUser, err })
//   }
// }
//
// export async function PushNotificationsHandler (txes: TxCreateDoc<any>[], control: TriggerControl): Promise<Tx[]> {
//   const all: any[] = txes
//     .map((tx) => TxProcessor.createDoc2Doc(tx))
//     .filter((it) => (it.allowedProviders?.[notification.providers.PushNotificationProvider]?.length ?? 0) !== 0)
//
//   if (all.length === 0) return []
//
//   const receivers = new Set(all.map((it) => it.user))
//   const subscriptions = (await control.queryFind(control.ctx, notification.class.PushSubscription, {})).filter((it) =>
//     receivers.has(it.user)
//   )
//
//   const subscriptionSettings = await control.queryFind(control.ctx, notification.class.PushSubscriptionSetting, {})
//   const filteredSubscriptions = subscriptions.filter((sub) => {
//     const setting = subscriptionSettings.find(({ attachedTo }) => attachedTo === sub._id)
//     return setting?.enabled !== false
//   })
//   const res: Tx[] = []
//
//   for (const inboxNotification of all) {
//     const { user } = inboxNotification
//     const userSubscriptions = filteredSubscriptions.filter((it) => it.user === user)
//
//     const soundAlert =
//       (inboxNotification.allowedProviders?.[notification.providers.SoundNotificationProvider]?.length ?? 0) > 0
//     const tx = await createPush(
//       control,
//       inboxNotification,
//       user,
//       soundAlert,
//       inboxNotification.space,
//       userSubscriptions
//     )
//
//     if (tx !== undefined) {
//       res.push(tx)
//     }
//   }
//
//   return res
// }
//
// async function getObjectIdentity (
//   inboxNotification: any,
//   control: TriggerControl
// ): Promise<Pick<Doc, '_id' | '_class'>> {
//   // const { hierarchy } = control
//   // if (!hierarchy.isDerived(inboxNotification._class, notification.class.ActivityInboxNotification)) {
//   //   return {
//   //     _id: inboxNotification.objectId,
//   //     _class: inboxNotification.objectClass
//   //   }
//   // }
//   //
//   // const activityNotification = inboxNotification as ActivityInboxNotification
//   //
//   // if (
//   //   hierarchy.isDerived(activityNotification.attachedToClass, chunter.class.ThreadMessage) &&
//   //   hierarchy.isDerived(activityNotification.objectClass, activity.class.ActivityMessage)
//   // ) {
//   //   const attachedTo = (
//   //     await control.findAll<ThreadMessage>(control.ctx, activityNotification.attachedToClass, {
//   //       _id: activityNotification.attachedTo as Ref<ThreadMessage>
//   //     })
//   //   )[0]
//   //
//   //   if (attachedTo != null) {
//   //     return { _id: attachedTo.objectId, _class: attachedTo.objectClass }
//   //   }
//   // }
//   //
//   // return { _id: activityNotification.objectId, _class: activityNotification.objectClass }
//
//   return {} as any
// }

// export async function getTranslatedNotificationContent(
//   data: Data<any>,
//   language: string
// ): Promise<{ title: string; body: string; [key: string]: string }> {
//   const params = { ...data.intlParams }
//
//   for (const [k, v] of Object.entries(data.intlParamsNotLocalized ?? {})) {
//     params[k] = await translate(v as any, params, language)
//   }
//
//   const title = await translate(data.title ?? notification.string.CommonNotificationTitle, params, language)
//   const body = await translate(data.body ?? notification.string.UpdateNotificationBody, params, language)
//
//   return { ...params, title, body }
// }
//
// export async function getContentByTemplate(
//   control: TriggerControl,
//   doc: Doc,
//   _types: Ref<NotificationType>[],
//   inboxNotification: any,
//   message: ActivityMessage | undefined
// ): Promise<
//   | {
//       text: string
//       html: string
//       subject: string
//     }
//   | undefined
// > {
//   const { modelDb } = control
//   const language = control.branding?.defaultLanguage ?? 'en'
//   const types = _types.map((it) => modelDb.getObject(it)).filter(notEmpty)
//
//   const type = types.find((it) => it.templates != null)
//   const templates: NotificationTemplate = type?.templates ?? {
//     text: notification.emailTemplate.GeneratedNotificationText,
//     html: notification.emailTemplate.GeneratedNotificationHtml,
//     subject: notification.emailTemplate.GeneratedNotificationSubject
//   }
//
//   const params: Record<string, string> = await getTranslatedNotificationContent(inboxNotification, language)
//
//   const title = (await getDocTitle(control, doc)) ?? ''
//   const url = await getUrlWithMessage(control, doc, inboxNotification, message?._id)
//
//   const identifier = (inboxNotification.intlParams?.identifier ?? (await getDocIdentifier(control, doc)))?.toString()
//
//   const titleWithIdentifier = identifier != null ? `${identifier}: ${title}` : title
//   const htmlTitle = url != null ? `<a href='${url}'>${titleWithIdentifier}</a>` : titleWithIdentifier
//
//   if (url != null) {
//     params.url = url
//   }
//   if (identifier != null) {
//     params.identifier = identifier
//   }
//
//   // if (hierarchy.isDerived(inboxNotification._class, notification.class.MentionInboxNotification)) {
//   //   const markup: Markup | undefined = message?.message ?? (inboxNotification as MentionInboxNotification).markup
//   //   const text = markup !== undefined ? markupToText(markup) : undefined
//   //   params.body = text ?? params.body
//   //   params.message = text ?? params.message
//   // } else if (message !== undefined) {
//   //   params.message = message.message !== undefined ? markupToText(message.message) : (params.message ?? '')
//   // } else if (params.message === undefined) {
//   //   params.message = params.body ?? ''
//   // }
//
//   const inboxLink = await getNotificationInboxLink(control, doc, message?._id)
//   const app = control.branding?.title ?? 'Platform'
//
//   const inboxLinkText = await translate(notification.string.ViewIn, { app }, language)
//
//   params.link = `<a href='${inboxLink}'>${inboxLinkText}</a>`
//   const senderName = (inboxNotification?.intlParams?.senderName ?? 'System').toString()
//
//   const text = await fillTemplate(templates.text, senderName, titleWithIdentifier, params, language)
//   const html = await fillTemplate(templates.html, senderName, htmlTitle, params, language)
//   const subject = await fillTemplate(templates.subject, senderName, titleWithIdentifier, params, language)
//
//   if (subject === '') return
//
//   return {
//     text,
//     html,
//     subject
//   }
// }
//
// export async function getNotificationInboxLink(
//   control: TriggerControl,
//   doc: Doc,
//   message?: Ref<ActivityMessage>
// ): Promise<string> {
//   const linkProviders = control.modelDb.findAllSync(serverView.mixin.ServerLinkIdProvider, {})
//   const provider = linkProviders.find(({ _id }) => _id === doc._class)
//
//   let id: string = doc._id
//
//   if (provider !== undefined) {
//     const encodeFn = await getResource(provider.encode)
//
//     id = await encodeFn(doc, control)
//   }
//
//   let thread: string | undefined
//
//   if (control.hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
//     const id = (doc as ActivityMessage)._id
//
//     if (message === undefined) {
//       message = id
//     } else {
//       thread = id
//     }
//   }
//
//   const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
//   const path = [workbenchId, control.workspace.url, notificationId, encodeObjectURI(id, doc._class), thread]
//     .filter((x): x is string => x !== undefined)
//     .map((p) => encodeURIComponent(p))
//     .join('/')
//
//   const link = concatLink(front, path)
//
//   return message !== undefined ? `${link}?message=${message}` : link
// }
//
// async function fillTemplate(
//   template: IntlString,
//   sender: string,
//   doc: string,
//   params: Record<string, string>,
//   lang: string
// ): Promise<string> {
//   return await translate(
//     template,
//     {
//       ...params,
//       sender,
//       doc
//     },
//     lang
//   )
// }
//
// async function getUrlWithMessage(
//   control: TriggerControl,
//   doc: Doc,
//   inboxNotification: any,
//   messageId?: Ref<ActivityMessage>
// ): Promise<string | undefined> {
//   const baseUrl = inboxNotification.intlParams?.url?.toString() ?? (await getDocUrl(control, doc))?.toString()
//   if (baseUrl == null || baseUrl === '') return
//
//   const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
//
//   try {
//     const url = front !== '' ? new URL(baseUrl, front) : new URL(baseUrl)
//
//     if (messageId != null) {
//       url.searchParams.set('message', messageId)
//     }
//
//     return url.toString()
//   } catch (e) {
//     control.ctx.error('Invalid url', { baseUrl, front, e })
//     return baseUrl
//   }
// }