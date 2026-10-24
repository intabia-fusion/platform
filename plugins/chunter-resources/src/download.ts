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

import attachment, { LINK_PREVIEW_TYPE, type Attachment } from '@hcengineering/attachment'
import { compareAsInMessage } from '@hcengineering/attachment-resources'
import type { ChatMessage } from '@hcengineering/chunter'
import type { Doc } from '@hcengineering/core'
import { downloadFiles, getClient } from '@hcengineering/presentation'

import chunter from './plugin'

// A selection of one row arrives as an array of one.
function chatMessage (doc?: Doc | Doc[]): ChatMessage | undefined {
  const it = Array.isArray(doc) ? doc[0] : doc
  return it != null && getClient().getHierarchy().isDerived(it._class, chunter.class.ChatMessage)
    ? (it as ChatMessage)
    : undefined
}

// Files only: a link preview is stored as an attachment but is nothing to save.
async function messageFiles (message: ChatMessage | undefined): Promise<Attachment[]> {
  if (message == null || (message.attachments ?? 0) === 0) return []
  const files = await getClient().findAll(attachment.class.Attachment, { attachedTo: message._id })
  // In the order the message lays them out, grouped by kind.
  return files.filter((it) => it.type !== LINK_PREVIEW_TYPE).sort(compareAsInMessage)
}

export async function canDownloadAttachments (doc?: Doc | Doc[]): Promise<boolean> {
  return (await messageFiles(chatMessage(doc))).length > 0
}

export async function downloadAttachments (doc?: Doc | Doc[]): Promise<void> {
  await downloadFiles(await messageFiles(chatMessage(doc)))
}
