//
// Reporting from the web: a message in a channel or a person. The client files a transient
// ContentReportAction in its own PersonSpace; the server turns it into cards for the owners.
//

import chunter, {
  type ChatMessage,
  type ContentReportAction,
  type ContentReportReason,
  type ThreadMessage
} from '@hcengineering/chunter'
import contact, { type Person } from '@hcengineering/contact'
import {
  AccountRole,
  type AccountUuid,
  type Data,
  type Doc,
  getCurrentAccount,
  hasAccountRole
} from '@hcengineering/core'
import { type IntlString, translate } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import { NotificationSeverity, addNotification, getEventPositionElement, showPopup } from '@hcengineering/ui'

import ReportNotification from './components/ReportNotification.svelte'

export const reasonLabels: Record<ContentReportReason, IntlString> = {
  spam: chunter.string.ContentReportSpam,
  abuse: chunter.string.ContentReportAbuse,
  inappropriate: chunter.string.ContentReportInappropriate,
  other: chunter.string.ContentReportOther
}

/** Somebody else's message in a channel; owners moderate directly and get no report action. */
export async function canReportMessage (doc?: Doc | Doc[]): Promise<boolean> {
  if (doc === undefined || Array.isArray(doc)) return false
  const message = doc as ChatMessage
  const me = getCurrentAccount()
  if (hasAccountRole(me, AccountRole.Owner)) return false
  if (message.createdBy !== undefined && me.socialIds.includes(message.createdBy)) return false
  const hierarchy = getClient().getHierarchy()
  const chatClass = hierarchy.isDerived(message._class, chunter.class.ThreadMessage)
    ? (message as ThreadMessage).objectClass
    : message.attachedToClass
  // Direct messages stay private: there the person is reported, from their profile.
  return !hierarchy.isDerived(chatClass, chunter.class.DirectMessage)
}

export async function canReportPerson (doc?: Doc | Doc[]): Promise<boolean> {
  if (doc === undefined || Array.isArray(doc)) return false
  const person = doc as Person
  const me = getCurrentAccount()
  if (hasAccountRole(me, AccountRole.Owner)) return false
  return person.personUuid != null && person.personUuid !== me.uuid
}

/** What the action reports: a message, or the account behind a person. */
export function reportTarget (doc: Doc): Target | undefined {
  const hierarchy = getClient().getHierarchy()
  if (hierarchy.isDerived(doc._class, chunter.class.ChatMessage)) {
    return { messageId: doc._id as ChatMessage['_id'] }
  }
  // A member's personUuid is their account uuid; the brands differ, the value does not.
  const account = (doc as Person).personUuid as unknown as AccountUuid | undefined
  return account == null ? undefined : { account }
}

// The reason is a submenu of the context menu (actionPopup); a direct click or the keyboard
// opens the same popup at the pointer, the way notification settings do.
export async function reportMessage (doc: Doc | Doc[], evt?: Event): Promise<void> {
  askReason(doc, evt)
}

export async function reportPerson (doc: Doc | Doc[], evt?: Event): Promise<void> {
  askReason(doc, evt)
}

export type Target = Pick<Data<ContentReportAction>, 'messageId' | 'account'>

function askReason (doc: Doc | Doc[], evt: Event | undefined): void {
  const value = Array.isArray(doc) ? doc[0] : doc
  if (value === undefined) return
  showPopup(
    chunter.component.ReportReasonPopup,
    { value },
    evt instanceof MouseEvent ? getEventPositionElement(evt) : 'top'
  )
}

export async function fileReport (target: Target, reason: ContentReportReason): Promise<void> {
  const client = getClient()
  const me = getCurrentAccount()
  // Own PersonSpace: the transient action reaches nobody else, the server requires it.
  const space = await client.findOne(contact.class.PersonSpace, { members: me.uuid }, { projection: { _id: 1 } })
  if (space === undefined) return
  await client.createDoc(chunter.class.ContentReportAction, space._id, { ...target, reason })
  addNotification(
    await translate(chunter.string.ContentReportSent, {}),
    await translate(chunter.string.ContentReportSentText, {}),
    ReportNotification,
    undefined,
    NotificationSeverity.Success
  )
}
