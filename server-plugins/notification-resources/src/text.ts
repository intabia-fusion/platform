import { concatLink, Doc, Ref } from '@hcengineering/core'
import { InboxNotification, notificationId, NotificationType } from '@hcengineering/notification'
import { getMetadata, getResource } from '@hcengineering/platform'
import type { TriggerControl } from '@hcengineering/server-core'
import activity, { ActivityMessage } from '@hcengineering/activity'
import { workbenchId } from '@hcengineering/workbench'
import { encodeObjectURI } from '@hcengineering/view'
import serverCore from '@hcengineering/server-core'
import serverView from '@hcengineering/server-view'

import { TemplateContent } from './types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fillTemplate (
  template: string,
  sender: string,
  doc: string,
  data: string,
  params: Record<string, string> = {}
): string {
  let res = replaceAll(template, '{sender}', sender)
  res = replaceAll(res, '{doc}', doc)
  res = replaceAll(res, '{data}', data)

  for (const key in params) {
    res = replaceAll(res, `{${key}}`, params[key])
  }
  return res
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getContentByTemplate (
  doc: Doc | undefined,
  sender: string,
  type: Ref<NotificationType>,
  control: TriggerControl,
  data: string,
  notificationData?: InboxNotification,
  message?: ActivityMessage
): Promise<TemplateContent | undefined> {
  // if (doc === undefined) return
  // const notificationType = control.modelDb.getObject(type)
  // if (notificationType.templates === undefined) return
  //
  // const textPart = await getTextPart(doc, control)
  // if (textPart === undefined) return
  // const params: Record<string, string> =
  //   notificationData !== undefined
  //     ? await getTranslatedNotificationContent(notificationData, notificationData._class, control)
  //     : {}
  //
  // if (
  //   notificationData !== undefined &&
  //   control.hierarchy.isDerived(notificationData._class, notification.class.MentionInboxNotification)
  // ) {
  //   const messageContent = (notificationData as MentionInboxNotification).markup
  //   const text = messageContent !== undefined ? markupToText(messageContent) : undefined
  //   params.body = text ?? params.body
  //   params.message = text ?? params.message
  // }
  //
  // if (message !== undefined) {
  //   const markup = await messageToMarkup(control, message)
  //   params.message = markup !== undefined ? markupToText(markup) : (params.message ?? '')
  // } else if (params.message === undefined) {
  //   params.message = params.body ?? ''
  // }
  //
  // const link = await getNotificationLink(control, doc, message?._id)
  // const app = control.branding?.title ?? 'Huly'
  // const linkText = await translate(notification.string.ViewIn, { app })
  //
  // params.link = `<a href='${link}'>${linkText}</a>`
  //
  // const text = fillTemplate(notificationType.templates.textTemplate, sender, textPart, data, params)
  // const htmlPart = await getHtmlPart(doc, control)
  // const html = fillTemplate(notificationType.templates.htmlTemplate, sender, htmlPart ?? textPart, data, params)
  // const subject = fillTemplate(notificationType.templates.subjectTemplate, sender, textPart, data, params)
  //
  // if (subject === '') return
  //
  // return {
  //   text,
  //   html,
  //   subject
  // }
  return undefined
}

export async function getNotificationLink (
  control: TriggerControl,
  doc: Doc,
  message?: Ref<ActivityMessage>
): Promise<string> {
  const linkProviders = control.modelDb.findAllSync(serverView.mixin.ServerLinkIdProvider, {})
  const provider = linkProviders.find(({ _id }) => _id === doc._class)

  let id: string = doc._id

  if (provider !== undefined) {
    const encodeFn = await getResource(provider.encode)

    id = await encodeFn(doc, control)
  }

  let thread: string | undefined

  if (control.hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
    const id = (doc as ActivityMessage)._id

    if (message === undefined) {
      message = id
    } else {
      thread = id
    }
  }

  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
  const path = [workbenchId, control.workspace.url, notificationId, encodeObjectURI(id, doc._class), thread]
    .filter((x): x is string => x !== undefined)
    .map((p) => encodeURIComponent(p))
    .join('/')

  const link = concatLink(front, path)

  return message !== undefined ? `${link}?message=${message}` : link
}

function replaceAll (str: string, find: string, replace: string): string {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace)
}

function escapeRegExp (str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
