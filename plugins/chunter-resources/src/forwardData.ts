//
// Copyright © 2026 Intabia Fusion.
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

import activity, {
  type ActivityMessage,
  type AppletSnapshot,
  type AttachmentSnapshot,
  type ForwardContent,
  toAppletSnapshot
} from '@hcengineering/activity'
import attachment, { type Attachment } from '@hcengineering/attachment'
import { type ChatMessage } from '@hcengineering/chunter'
import { type Class, type Doc, type Ref, type WithLookup } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import { isEmptyMarkup } from '@hcengineering/text'

async function getAttachmentSnapshots (message: WithLookup<ChatMessage>): Promise<AttachmentSnapshot[]> {
  if ((message.attachments ?? 0) === 0) return []

  const client = getClient()
  const attachments = (
    (message.$lookup?.attachments as Attachment[]) ??
    (await client.findAll(attachment.class.Attachment, { attachedTo: message._id }))
  ).filter((it) => it.type !== 'application/link-preview')

  if (attachments.length === 0) return []

  return attachments.map((it) => ({
    originId: it._id,
    name: it.name,
    file: it.file,
    size: it.size,
    type: it.type,
    createdOn: it.createdOn ?? it.modifiedOn,
    metadata: it.metadata
  }))
}

async function getAppletSnapshots (message: WithLookup<ChatMessage>): Promise<AppletSnapshot[]> {
  if ((message.applets ?? 0) === 0) return []

  const client = getClient()
  const applets = await client.findAll(activity.class.AppletInstance, { attachedTo: message._id })
  // Shown in another space: the tallies stay, who voted and the quiz answer do not.
  return applets.map(toAppletSnapshot)
}

async function getForwardContent (message: WithLookup<ChatMessage>): Promise<ForwardContent | undefined> {
  return {
    author: message.createdBy ?? message.modifiedBy,
    message: message.message,
    createdOn: message.createdOn ?? message.modifiedOn,
    attachments: await getAttachmentSnapshots(message),
    applets: await getAppletSnapshots(message)
  }
}

export async function getForwardData (message: WithLookup<ChatMessage>): Promise<{
  forwardedMessage?: Ref<ActivityMessage>
  forwardFromId?: Ref<Doc>
  forwardFromClass?: Ref<Class<Doc>>
  forwardContent?: ForwardContent
}> {
  const hasContent = (message.attachments ?? 0) > 0 || (message.applets ?? 0) > 0 || !isEmptyMarkup(message.message)
  if (hasContent) {
    return {
      forwardedMessage: message._id,
      forwardFromId: message.attachedTo,
      forwardFromClass: message.attachedToClass,
      forwardContent: await getForwardContent(message)
    }
  } else if (message.forwardedMessage != null) {
    return {
      forwardedMessage: message.forwardedMessage,
      forwardFromId: message.forwardFromId,
      forwardFromClass: message.forwardFromClass,
      forwardContent: message.forwardContent
    }
  }

  return {}
}
