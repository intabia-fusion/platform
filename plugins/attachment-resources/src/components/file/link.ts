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

import type { Attachment } from '@hcengineering/attachment'
import type { BlobType, WithLookup } from '@hcengineering/core'
import { getResource, setPlatformStatus, unknownError } from '@hcengineering/platform'
import presentation, { copyTextToClipboard, getJsonOrEmpty, type LinkPreviewDetails } from '@hcengineering/presentation'
import { getEventPositionElement, Menu, showPopup, type Action } from '@hcengineering/ui'
import { openLink } from '@hcengineering/ui/kit'
import view from '@hcengineering/view'
import { writable, type Readable } from 'svelte/store'

import attachment from '../../plugin'
import { isAttachment } from '../../utils'

// Cards remount as a chat scrolls: the details of a link are fetched once a session.
const details = new Map<string, Promise<LinkPreviewDetails | undefined>>()

export async function loadLinkDetails (value: Pick<BlobType, 'file' | 'name'>): Promise<LinkPreviewDetails | undefined> {
  let pending = details.get(value.file)
  if (pending == null) {
    pending = getJsonOrEmpty<LinkPreviewDetails>(value.file, value.name)
    details.set(value.file, pending)
  }
  const result = await pending
  // A failure is not kept: a network blip would leave the link unavailable until a reload.
  if (result == null && details.get(value.file) === pending) details.delete(value.file)
  return result
}

export interface LinkDetailsState {
  details?: LinkPreviewDetails
  loaded: boolean
}

/** The details of the link one card shows: an answer for a link it no longer shows is dropped. */
export function createLinkDetails (): Readable<LinkDetailsState> & {
  load: (value: Pick<BlobType, 'file' | 'name'>) => void
} {
  const state = writable<LinkDetailsState>({ loaded: false })
  let current: string | undefined
  return {
    subscribe: state.subscribe,
    load: (value) => {
      // A query refresh hands a new object of the same link: the card keeps what it shows.
      if (value.file === current) return
      const file = (current = value.file)
      state.set({ loaded: false })
      void loadLinkDetails(value).then((details) => {
        if (current === file) state.set({ details, loaded: true })
      })
    }
  }
}

interface LinkMenuOptions {
  removable?: boolean
  onClose?: () => void
}

/** No confirmation: the link stays in the text and loses only its card. */
export async function removeLink (value: WithLookup<Attachment> | BlobType): Promise<void> {
  if (!isAttachment(value)) return
  try {
    const impl = await getResource(attachment.actionImpl.DeleteAttachment)
    await impl(value)
  } catch (err: any) {
    await setPlatformStatus(unknownError(err))
  }
}

export function showLinkMenu (
  e: MouseEvent,
  value: WithLookup<Attachment> | BlobType,
  url: string | undefined,
  { removable = false, onClose }: LinkMenuOptions = {}
): void {
  e.preventDefault()
  e.stopPropagation()
  const actions: Action[] = []
  if (url != null && url !== '') {
    actions.push(
      {
        label: view.string.Open,
        icon: view.icon.Open,
        action: async () => {
          openLink(url)
        }
      },
      {
        label: presentation.string.CopyLink,
        icon: view.icon.CopyLink,
        action: async () => {
          await copyTextToClipboard(url)
        }
      }
    )
  }
  if (removable && isAttachment(value)) {
    actions.push({
      label: presentation.string.Remove,
      icon: view.icon.Delete,
      action: async () => {
        await removeLink(value)
      }
    })
  }
  if (actions.length === 0) {
    onClose?.()
    return
  }
  showPopup(Menu, { actions }, getEventPositionElement(e), onClose)
}
