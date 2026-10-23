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

import { showAttachmentPreviewPopup } from '@hcengineering/attachment-resources'
import chunter, { type ChatMessage } from '@hcengineering/chunter'
import type { Class, Ref } from '@hcengineering/core'
import { translate } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import { addNotification, NotificationSeverity, type PopupResult } from '@hcengineering/ui'

import ReportNotification from '../components/ReportNotification.svelte'
import { openSearchResult } from '../navigation'
import chunterResources from '../plugin'
import type { AttachmentRow, AttachmentSearchStore } from './attachments'

// Ask for the next page while a few items are still ahead, so paging on never waits for it.
const PREFETCH_AHEAD = 3

export async function openMessage (message: { _id: Ref<ChatMessage>, _class: Ref<Class<ChatMessage>> }): Promise<void> {
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const _class = hierarchy.hasClass(message._class) ? message._class : chunter.class.ChatMessage
  const found = await client.findOne(_class, { _id: message._id })
  if (found == null) {
    // The viewer is already closed by then: without a word the click would seem lost.
    const title = await translate(chunter.string.ContentReportMessageGone, {})
    addNotification(title, '', ReportNotification, undefined, NotificationSeverity.Info)
    return
  }
  await openSearchResult(found)
}

export function openAttachmentViewer (store: AttachmentSearchStore, index: number): void {
  let rows: AttachmentRow[] = []
  let current = index

  function propsAt (i: number): Record<string, any> {
    const row = rows[i]
    return {
      value: row.attachment,
      navigation: {
        prev:
          i > 0
            ? () => {
                go(i - 1)
              }
            : undefined,
        next:
          i < rows.length - 1
            ? () => {
                go(i + 1)
              }
            : undefined
      },
      extraActions: [
        {
          icon: chunter.icon.Messages,
          label: chunterResources.string.GoToMessage,
          action: () => {
            // Closing from here skips the popup's onClose.
            unsubscribe()
            popup.close()
            void openMessage(row.message)
          }
        }
      ]
    }
  }

  function go (i: number): void {
    current = i
    if (i >= rows.length - PREFETCH_AHEAD) store.loadMore()
    popup.update(propsAt(i))
  }

  const unsubscribe = store.subscribe((state) => {
    // The open file is followed by its id: a new row on top or a reloaded page does not close the viewer.
    const shown = rows[current]?._id
    const at = shown === undefined ? -1 : state.results.findIndex((r) => r._id === shown)
    if (rows.length > 0 && at === -1) {
      // A new search replaced the list: the positions the viewer pages by mean other files now.
      unsubscribe()
      popup.close()
      return
    }
    const changed = rows.length > 0 && (state.results.length !== rows.length || at !== current)
    rows = state.results
    if (at !== -1) current = at
    if (changed) popup.update(propsAt(current))
  })

  if (rows[index] === undefined) {
    unsubscribe()
    return
  }

  const popup: PopupResult = showAttachmentPreviewPopup(rows[index].attachment, propsAt(index), unsubscribe)
}
