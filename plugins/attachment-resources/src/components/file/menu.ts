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

import activity from '@hcengineering/activity'
import type { Attachment } from '@hcengineering/attachment'
import type { BlobType, WithLookup } from '@hcengineering/core'
import { getResource, setPlatformStatus, unknownError } from '@hcengineering/platform'
import presentation, { downloadFile, MessageBox } from '@hcengineering/presentation'
import { getEventPositionElement, Menu, showPopup, type Action } from '@hcengineering/ui'
import { IconFileDownload as FileDownload } from '@hcengineering/ui/kit'
import view from '@hcengineering/view'
import workbench from '@hcengineering/workbench'
import { get } from 'svelte/store'

import attachment from '../../plugin'
import { isAttachment, openAttachment, openAttachmentInSidebar } from '../../utils'
import { mayRemove, permissionsStore } from './permissions'

interface AttachmentMenuOptions {
  isSaved?: boolean
  removable?: boolean
  extra?: Action[]
  onClose?: () => void
}

/** Every removal of an attachment asks first: a cross on a tile is easy to hit by mistake. */
export function confirmRemove (action: () => Promise<void>): void {
  showPopup(
    MessageBox,
    {
      label: view.string.DeleteObject,
      message: view.string.DeleteObjectConfirm,
      params: { count: 1 },
      action
    },
    'top'
  )
}

export function showAttachmentMenu (
  e: MouseEvent,
  value: WithLookup<Attachment> | BlobType,
  { isSaved = false, removable = false, extra = [], onClose }: AttachmentMenuOptions = {}
): void {
  e.preventDefault()
  e.stopPropagation()
  const position = getEventPositionElement(e)
  void buildMenu(value, { isSaved, removable, extra }).then(
    (actions) => {
      showPopup(Menu, { actions }, position, onClose)
    },
    async (err) => {
      // The card waits for the close to drop its menu look.
      onClose?.()
      await setPlatformStatus(unknownError(err))
    }
  )
}

async function buildMenu (
  value: WithLookup<Attachment> | BlobType,
  { isSaved, removable, extra }: Required<Omit<AttachmentMenuOptions, 'onClose'>>
): Promise<Action[]> {
  // A recording plays in its card: opening it elsewhere shows the same player.
  const opens: Action[] = value.type.startsWith('audio/')
    ? []
    : [
        {
          label: view.string.Open,
          icon: view.icon.Open,
          action: async () => {
            await openAttachment(value)
          }
        },
        {
          label: workbench.string.OpenInSidebar,
          icon: view.icon.DetailsFilled,
          action: async () => {
            await openAttachmentInSidebar(value)
          }
        }
      ]
  const actions: Action[] = [
    ...extra,
    ...opens,
    {
      label: presentation.string.Download,
      icon: FileDownload,
      action: async () => {
        downloadFile(value.file, value.name)
      }
    }
  ]
  if (isAttachment(value)) {
    actions.push({
      label: isSaved ? attachment.string.RemoveAttachmentFromSaved : attachment.string.AddAttachmentToSaved,
      icon: isSaved ? activity.icon.BookmarkFilled : activity.icon.Bookmark,
      action: async (_: any, evt: Event) => {
        const impl = await getResource(
          isSaved ? attachment.actionImpl.DeleteAttachmentFromSaved : attachment.actionImpl.AddAttachmentToSaved
        )
        await impl(value, evt)
      }
    })
    if (removable && mayRemove(value, get(await permissionsStore()))) {
      actions.push({
        label: attachment.string.DeleteFile,
        icon: view.icon.Delete,
        action: async (_: any, evt: Event) => {
          confirmRemove(async () => {
            const impl = await getResource(attachment.actionImpl.DeleteAttachment)
            await impl(value, evt)
          })
        }
      })
    }
  }
  return actions
}
