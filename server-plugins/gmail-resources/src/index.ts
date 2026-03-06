//
// Copyright © 2022 Hardcore Engineering Inc.
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
import contact, { Channel, Employee, Person, SocialIdentity } from '@hcengineering/contact'
import {
  AccountUuid,
  Class,
  Doc,
  DocumentQuery,
  Domain,
  FindOptions,
  FindResult,
  groupByArray,
  Hierarchy,
  MeasureContext,
  Ref,
  SocialIdType,
  Tx,
  TxCreateDoc,
  TxProcessor,
  WorkspaceUuid
} from '@hcengineering/core'
import gmail, { Message } from '@hcengineering/gmail'
import { PlatformQueueProducer, QueueTopic, TriggerControl } from '@hcengineering/server-core'
import { InboxNotification, NotificationType } from '@hcengineering/notification'
import serverNotification, { Receiver, TypeMatchClient, TypeMatchFunc } from '@hcengineering/server-notification'
import { getMetadata } from '@hcengineering/platform'
import { ActivityMessage, DocUpdateMessage } from '@hcengineering/activity'
import { getEmployeeByAcc } from '@hcengineering/server-contact'
import { getContentByTemplate, getNotificationMessages } from '@hcengineering/server-notification-resources'

async function FindMessages (
  doc: Doc,
  hiearachy: Hierarchy,
  findAll: <T extends Doc>(
    clazz: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<FindResult<T>>
): Promise<Doc[]> {
  const channel = doc as Channel
  if (channel.provider !== contact.channelProvider.Email) {
    return []
  }
  const messages = await findAll(gmail.class.Message, { attachedTo: channel._id })
  const newMessages = await findAll(gmail.class.NewMessage, { attachedTo: channel._id })
  return [...messages, ...newMessages]
}

async function OnMessageCreate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const createTx = tx as TxCreateDoc<Message>

    const message = TxProcessor.createDoc2Doc<Message>(createTx)

    const channel = (
      await control.findAll(control.ctx, contact.class.Channel, { _id: message.attachedTo }, { limit: 1 })
    )[0]
    if (channel !== undefined) {
      if (channel.lastMessage === undefined || channel.lastMessage < message.sendOn) {
        const tx = control.txFactory.createTxUpdateDoc(channel._class, channel.space, channel._id, {
          lastMessage: message.sendOn
        })
        result.push(tx)
      }
    }
  }

  return result
}

export const IsIncomingMessageTypeMatch: TypeMatchFunc = async (
  client: TypeMatchClient,
  _type: NotificationType,
  _typeObject: Doc,
  doc: Doc,
  _receiver: Receiver
): Promise<boolean> => {
  const { hierarchy } = client
  const message = _typeObject as DocUpdateMessage
  if (!hierarchy.isDerived(message.objectClass, gmail.class.Message)) return false

  const gmailMessage = (
    await client.findAll(client.ctx, gmail.class.Message, { _id: message.objectId as Ref<Message> }, { limit: 1 })
  )[0]
  if (gmailMessage == null) return false

  return gmailMessage.incoming && gmailMessage.sendOn > (doc.createdOn ?? doc.modifiedOn)
}

function isMailConfigured (): boolean {
  const mailURL = getMetadata(serverNotification.metadata.MailUrl)
  return mailURL !== undefined && mailURL !== ''
}

interface EmailNotification {
  type: 'email'
  data: {
    text: string
    html: string
    subject: string
    to: string[]
  }
}

export async function sendEmailNotification (
  ctx: MeasureContext,
  producer: PlatformQueueProducer<EmailNotification>,
  workspace: WorkspaceUuid,
  text: string,
  html: string,
  subject: string,
  receiver: string
): Promise<void> {
  try {
    await producer.send(ctx, workspace, [
      {
        type: 'email',
        data: {
          text,
          html,
          subject,
          to: [receiver]
        }
      }
    ])
  } catch (err) {
    ctx.error('Could not send email notification', { err, receiver })
  }
}

async function notifyByEmail (
  control: TriggerControl,
  producer: PlatformQueueProducer<EmailNotification>,
  types: Ref<NotificationType>[],
  doc: Doc,
  email: string,
  inboxNotification: InboxNotification,
  message: ActivityMessage | undefined
): Promise<void> {
  const content = await getContentByTemplate(control, doc, types, inboxNotification, message)

  if (content !== undefined) {
    await sendEmailNotification(
      control.ctx,
      producer,
      control.workspace.uuid,
      content.text,
      content.html,
      content.subject,
      email
    )
  }
}

async function getEmployeeEmails (control: TriggerControl, employeeId: Ref<Person>): Promise<SocialIdentity[]> {
  const emailQuery = {
    attachedTo: employeeId,
    type: { $in: [SocialIdType.EMAIL, SocialIdType.GOOGLE] },
    verifiedOn: { $gt: 0 },
    isDeleted: { $ne: true }
  }

  try {
    // Use rawFindAll to avoid filters from permission middleware
    return await control.lowLevel.rawFindAll<SocialIdentity>('channel' as Domain, emailQuery, { limit: 10 })
  } catch (err) {
    // Fallback to regular findAll if lowLevel fails
    return await control.findAll(control.ctx, contact.class.SocialIdentity, emailQuery)
  }
}

async function processEmailNotifications (
  control: TriggerControl,
  producer: PlatformQueueProducer<EmailNotification>,
  notifications: InboxNotification[]
): Promise<void> {
  if (notifications.length === 0) return

  const docId = notifications[0].objectId
  const docClass = notifications[0].objectClass

  const doc = (await control.findAll(control.ctx, docClass, { _id: docId }))[0]
  if (doc === undefined) return

  const employeesMap = new Map<AccountUuid, Employee>()
  const emailsMap = new Map<Ref<Employee>, SocialIdentity[]>()

  const messages = await getNotificationMessages(control, notifications)

  for (const n of notifications) {
    try {
      const types = n.allowedProviders?.[gmail.providers.EmailNotificationProvider] ?? []
      if (types.length === 0) continue

      const receiverEmployee = employeesMap.get(n.user) ?? (await getEmployeeByAcc(control, n.user))
      if (receiverEmployee == null) continue

      employeesMap.set(n.user, receiverEmployee)

      const emails: SocialIdentity[] =
        emailsMap.get(receiverEmployee._id) ?? (await getEmployeeEmails(control, receiverEmployee._id))

      emailsMap.set(receiverEmployee._id, emails)

      if (emails.length === 0) continue

      const message = messages.get(n._id)
      await notifyByEmail(control, producer, types, doc, emails[0].value, n, message)
    } catch (e) {
      control.ctx.error('Failed to process email notification', { e, notification: n })
    }
  }
}

async function NotificationsHandler (txes: TxCreateDoc<InboxNotification>[], control: TriggerControl): Promise<Tx[]> {
  if (!isMailConfigured()) return []
  if (control.queue == null) return []

  const all: InboxNotification[] = txes
    .map((tx) => TxProcessor.createDoc2Doc(tx))
    .filter((it) => (it.allowedProviders?.[gmail.providers.EmailNotificationProvider]?.length ?? 0) > 0)

  if (all === null) return []

  const notificationsByDocId = groupByArray(all, (it) => it.objectId)
  const producer = control.queue.getProducer<EmailNotification>(control.ctx, QueueTopic.NotificationQueue)
  await Promise.all(
    Array.from(notificationsByDocId.entries()).map(([, notifications]) =>
      processEmailNotifications(control, producer, notifications)
    )
  )

  return []
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    OnMessageCreate,
    NotificationsHandler
  },
  function: {
    IsIncomingMessageTypeMatch,
    FindMessages
  }
})
