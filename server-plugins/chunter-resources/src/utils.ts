import { Receiver, TypeMatchClient, TypeMatchFunc } from '@hcengineering/server-notification'
import { NotificationType } from '@hcengineering/notification'
import { AccountUuid, concatLink, Doc } from '@hcengineering/core'
import { DocUpdateMessage } from '@hcengineering/activity'
import chunter, { Channel, ChunterSpace, chunterId, DirectMessage } from '@hcengineering/chunter'
import {
  StringPresenterFn,
  PresenterControl,
  PresenterOptions,
  IconPresenterFn,
  PropsPresenterFn,
  Icon,
  IntlStringPresenterFn
} from '@hcengineering/server-activity'
import { encodeObjectURI } from '@hcengineering/view'
import serverCore from '@hcengineering/server-core'
import { getMetadata, IntlString } from '@hcengineering/platform'
import { workbenchId } from '@hcengineering/workbench'
import contact, { formatName, Person } from '@hcengineering/contact'

export const JoinChannelTypeMatch: TypeMatchFunc = (
  _client: TypeMatchClient,
  _type: NotificationType,
  _object: Doc,
  doc: Doc,
  receiver: Receiver
) => {
  const message = _object as DocUpdateMessage
  const author = message.createdBy ?? message.modifiedBy

  if (receiver.socialIds.includes(author)) {
    return false
  }

  if (message.action === 'update') {
    const added = message.attributeUpdates?.added ?? []
    const set = message.attributeUpdates?.set ?? []

    const historyAdded = message.history?.flatMap((h) => h.update?.added ?? []) ?? []
    const historySet = message.history?.flatMap((h) => h.update?.set ?? []) ?? []

    const currentlyAdded = added.filter((a) => !historyAdded.includes(a))
    const currentlySet = set.filter((s) => !historySet.includes(s))

    return currentlyAdded.includes(receiver.account) || currentlySet.includes(receiver.account)
  }

  if (message.action === 'create') {
    return (doc as Channel).members.includes(receiver.account)
  }

  return false
}

export const ChannelTitlePresenter: StringPresenterFn<Channel> = async (doc: Channel): Promise<string> => {
  return doc.name
}

export const DirectTitlePresenter: StringPresenterFn<DirectMessage> = async (
  doc: DirectMessage,
  control: PresenterControl,
  options?: PresenterOptions
): Promise<string | undefined> => {
  return await buildDirectName(doc, control, options?.account)
}

export const DirectLabelPresenter: IntlStringPresenterFn<DirectMessage> = async (
  doc: DirectMessage
): Promise<IntlString> => {
  return doc.type === 'person' ? chunter.string.Direct : chunter.string.GroupChat
}

// The client builds the title per viewer: from the members, or the name of a group of more than two
export const DirectPropsPresenter: PropsPresenterFn<DirectMessage> = async (doc: DirectMessage) => ({
  members: doc.members,
  type: doc.type,
  name: doc.name
})

export const ChannelUrlPresenter: StringPresenterFn<ChunterSpace> = async (
  doc: ChunterSpace,
  control: PresenterControl
): Promise<string> => {
  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
  const path = `${workbenchId}/${control.workspace.url}/${chunterId}/${encodeObjectURI(doc._id, doc._class)}`
  return concatLink(front, path)
}

export const ChannelIconPresenter: IconPresenterFn<Channel> = async (doc: Channel): Promise<Icon> => {
  return { emoji: doc.emoji, asset: doc.icon ?? (doc.private ? chunter.icon.Lock : chunter.icon.Hashtag) }
}

export const DirectIconPresenter: IconPresenterFn<DirectMessage> = async (
  doc: DirectMessage,
  control: PresenterControl,
  options?: PresenterOptions
): Promise<Icon> => {
  const clazz = control.hierarchy.findClass(doc._class)
  const { account } = options ?? {}

  const members = doc.members.length > 1 ? doc.members.filter((m) => m !== account) : doc.members

  return { asset: clazz?.icon, props: { members } }
}

// Without a viewer the direct is named by everyone in it, for a viewer by the others
async function buildDirectName (
  direct: DirectMessage,
  control: PresenterControl,
  account: AccountUuid | undefined
): Promise<string> {
  const members = direct.members ?? []
  // As the client does: a rename writes every member into the name, a group of two is called by the other one
  if (direct.type !== 'person' && members.length > 2 && direct.name.trim().length > 0) return direct.name
  const others = members.filter((m) => m !== account)
  // A direct with oneself is called by oneself
  const shown = others.length > 0 ? others : members
  const persons = await control.findAll<Person>(control.ctx, contact.class.Person, { personUuid: { $in: shown } })
  return persons.map((p) => formatName(p.name, control.branding?.lastNameFirst)).join(', ')
}
