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

    return added.includes(receiver.account) || set.includes(receiver.account)
  }

  if (message.action === 'create') {
    return (doc as Channel).members.includes(receiver.account)
  }

  return false
}
