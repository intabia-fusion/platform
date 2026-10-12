//
// What a moderation card says: who reported whom and, for a channel message, the quote, the files
// and a link to it. Direct messages are private, so there only a person can be reported.
//

import type { ActivityMessage } from '@hcengineering/activity'
import chunter, {
  chunterId,
  type ChatMessage,
  type ContentReportAction,
  type ContentReportReason,
  contentReportReasons,
  type ThreadMessage
} from '@hcengineering/chunter'
import contact, { formatName, type Person } from '@hcengineering/contact'
import {
  AccountRole,
  type AccountUuid,
  type Class,
  type Doc,
  type Markup,
  type PersonId,
  type Ref,
  concatLink,
  systemAccountUuid,
  BlobType
} from '@hcengineering/core'
import { getMetadata, IntlString, translate } from '@hcengineering/platform'
import { getAccountBySocialId, getPerson } from '@hcengineering/server-contact'
import { getDocTitle } from '@hcengineering/server-activity'
import serverCore, { type TriggerControl } from '@hcengineering/server-core'
import {
  type MarkupNode,
  MarkupMarkType,
  jsonToMarkup,
  markupToText,
  nodeDoc,
  nodeParagraph,
  nodeReference,
  nodeText
} from '@hcengineering/text-core'
import { workbenchId } from '@hcengineering/workbench'

const quoteLimit = 500

// Not a dependency of this package: the class id alone is enough to list a message's files.
const attachmentClass = 'attachment:class:Attachment' as Ref<Class<Doc>>

/** A workspace member as the account service lists them (LimitsProvider.getWorkspaceMembers). */
export interface WorkspaceMember {
  person: AccountUuid
  role: AccountRole
}

export interface PersonInfo {
  account: AccountUuid
  person?: Person
  name: string
}

export interface Subject {
  kind: 'message' | 'person'
  author: PersonInfo | undefined
  message?: {
    doc: ChatMessage
    chat: { _id: Ref<Doc>, _class: Ref<Class<Doc>>, name: string }
    link: string
    quote: string
    attachments: string[]
  }
}

export interface ReportProps {
  kind: 'message' | 'person'
  reason: ContentReportReason
  reporter: AccountUuid
  reporterName: string
  author?: AccountUuid
  authorName: string
  chat?: Ref<Doc>
  chatClass?: Ref<Class<Doc>>
  chatName: string
  messageId?: Ref<ActivityMessage>
  link: string
  quote: string
  attachments: string[]
}

export interface Card {
  props: ReportProps
  markup: Markup
  links: Array<{ _class: Ref<Class<Doc>>, _id: Ref<Doc> }>
}

/** A report on a person: only who it is - whatever was said stays in the direct message. */
export async function personSubject (
  account: AccountUuid,
  members: WorkspaceMember[],
  control: TriggerControl
): Promise<Subject | undefined> {
  const { ctx } = control
  const member = members.some((m) => m.person === account)
  if (!member || account === systemAccountUuid) {
    ctx.warn('content report: reported account is not a member', { account })
    return undefined
  }
  const person = (await control.findAll(ctx, contact.class.Person, { personUuid: account }, { limit: 1 }))[0]
  return { kind: 'person', author: { account, person, name: formatName(person?.name ?? '') } }
}

export async function messageSubject (
  action: ContentReportAction,
  control: TriggerControl
): Promise<Subject | undefined> {
  const { ctx } = control
  const { messageId } = action
  if (messageId == null) return undefined

  const message = (
    await control.findAll(ctx, chunter.class.ChatMessage, { _id: messageId as Ref<ChatMessage> }, { limit: 1 })
  )[0]
  if (message === undefined) {
    ctx.warn('content report: message not found', { messageId })
    return undefined
  }

  const chat = await chatOf(message, control)
  if (chat === undefined) return undefined

  const [author, attachments] = await Promise.all([
    getPersonInfo(message.createdBy ?? message.modifiedBy, control),
    attachmentNames(message, control)
  ])
  return {
    kind: 'message',
    author,
    message: {
      doc: message,
      chat,
      link: messageLink(message, chat._id, control),
      quote: markupToText(message.message).slice(0, quoteLimit),
      attachments
    }
  }
}

export async function buildCard (
  reporter: PersonInfo,
  subject: Subject,
  reason: ContentReportReason,
  control: TriggerControl
): Promise<Card> {
  const lang = control.branding?.defaultLanguage
  const t = async (key: IntlString): Promise<string> => await translate(key, {}, lang)
  const [fromLabel, aboutLabel, openLabel] = await Promise.all([
    t(chunter.string.ContentReportFrom),
    t(chunter.string.ContentReportAbout),
    t(chunter.string.ContentReportOpen)
  ])
  const { author, message } = subject

  const props: ReportProps = {
    kind: subject.kind,
    reason: normalizeReason(reason),
    reporter: reporter.account,
    reporterName: reporter.name,
    author: author?.account,
    authorName: author?.name ?? '',
    chat: message?.chat._id,
    chatClass: message?.chat._class,
    chatName: message?.chat.name ?? '',
    messageId: message?.doc._id,
    link: message?.link ?? '',
    quote: message?.quote ?? '',
    attachments: message?.attachments ?? []
  }

  // Who reported whom, labelled, then what was said - the owner must not have to guess the roles.
  const about = [personMarkupNode(author), ...(message !== undefined ? [nodeText(` · ${message.chat.name}`)] : [])]
  const body: MarkupNode[] =
    message === undefined
      ? []
      : [
          ...(message.quote !== '' ? [nodeParagraph(nodeText(`«${message.quote}»`))] : []),
          ...(message.attachments.length > 0 ? [nodeParagraph(nodeText(message.attachments.join(', ')))] : []),
          nodeParagraph(linkMarkupNode(openLabel, message.link))
        ]
  const markup = jsonToMarkup(
    nodeDoc(
      nodeParagraph(nodeText(`${fromLabel}: `), personMarkupNode(reporter)),
      nodeParagraph(nodeText(`${aboutLabel}: `), ...about),
      ...body
    )
  )

  const links = message !== undefined ? [{ _class: message.doc._class, _id: message.doc._id }] : []
  return { props, markup, links }
}

function normalizeReason (value: unknown): ContentReportReason {
  return contentReportReasons.includes(value as ContentReportReason) ? (value as ContentReportReason) : 'other'
}

export async function getPersonInfo (socialId: PersonId, control: TriggerControl): Promise<PersonInfo | undefined> {
  const account = await getAccountBySocialId(control, socialId)
  if (account == null) return undefined
  const person = await getPerson(control, socialId)
  return { account, person, name: formatName(person?.name ?? '') }
}

async function chatOf (
  message: ChatMessage,
  control: TriggerControl
): Promise<{ _id: Ref<Doc>, _class: Ref<Class<Doc>>, name: string } | undefined> {
  const { hierarchy, ctx } = control
  const thread = hierarchy.isDerived(message._class, chunter.class.ThreadMessage)
    ? (message as ThreadMessage)
    : undefined
  const _id = thread !== undefined ? thread.objectId : message.attachedTo
  const _class = thread !== undefined ? thread.objectClass : message.attachedToClass
  const chat = (await control.findAll(ctx, _class, { _id }, { limit: 1 }))[0]
  const name = chat !== undefined ? await getDocTitle(control, chat) : undefined
  return { _id, _class, name: name ?? '' }
}

async function attachmentNames (doc: ChatMessage, control: TriggerControl): Promise<string[]> {
  const files = (await control.findAll(control.ctx, attachmentClass, { attachedTo: doc._id })) as any as BlobType[]
  return files.map((f) => f.name)
}

function messageLink (doc: ChatMessage, chatId: Ref<Doc>, control: TriggerControl): string {
  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
  const parent = control.hierarchy.isDerived(doc._class, chunter.class.ThreadMessage) ? `/${doc.attachedTo}` : ''
  return concatLink(front, `${workbenchId}/${control.workspace.url}/${chunterId}/${chatId}${parent}?message=${doc._id}`)
}

function personMarkupNode (person: PersonInfo | undefined): MarkupNode {
  if (person === undefined) return nodeText('')
  return person.person !== undefined
    ? nodeReference({ id: person.person._id, label: person.name, objectclass: contact.class.Person })
    : nodeText(person.name)
}

function linkMarkupNode (label: string, href: string): MarkupNode {
  return { ...nodeText(label), marks: [{ type: MarkupMarkType.link, attrs: { href } }] }
}
