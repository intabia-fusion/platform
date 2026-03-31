import { Receiver, TypeMatchClient, TypeMatchFunc } from '@hcengineering/server-notification'
import { NotificationType } from '@hcengineering/notification'
import { Doc } from '@hcengineering/core'
import { DocUpdateMessage } from '@hcengineering/activity'
import { Channel } from '@hcengineering/chunter'

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
