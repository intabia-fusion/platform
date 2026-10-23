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

import presentation, { downloadFile } from '@hcengineering/presentation'
import { getEventPositionElement, Menu, showPopup, type Action } from '@hcengineering/ui'
import { IconFileDownload, openLink } from '@hcengineering/ui/kit'
import view from '@hcengineering/view'

import chunter from '../plugin'

export interface ItemMenu {
  open?: () => void
  link?: string
  download?: { file: string, name: string }
  message: () => void
  onClose?: () => void
}

export function showItemMenu (e: MouseEvent, item: ItemMenu): void {
  e.preventDefault()
  e.stopPropagation()
  const actions: Action[] = []
  const { open, link, download, message, onClose } = item
  if (open !== undefined) {
    actions.push({
      label: view.string.Open,
      icon: view.icon.Open,
      action: async () => {
        open()
      }
    })
  }
  if (link !== undefined) {
    actions.push({
      label: chunter.string.OpenLink,
      icon: view.icon.OpenInNewTab,
      action: async () => {
        openLink(link)
      }
    })
  }
  if (download !== undefined) {
    actions.push({
      label: presentation.string.Download,
      icon: IconFileDownload,
      action: async () => {
        downloadFile(download.file, download.name)
      }
    })
  }
  actions.push({
    label: chunter.string.GoToMessage,
    icon: chunter.icon.Messages,
    action: async () => {
      message()
    }
  })
  showPopup(Menu, { actions }, getEventPositionElement(e), onClose)
}
