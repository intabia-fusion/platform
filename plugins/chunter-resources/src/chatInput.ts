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

import { type AppletDraft } from '@hcengineering/activity'
import { type ChatMessage } from '@hcengineering/chunter'
import { type Markup, type Ref } from '@hcengineering/core'
import { isEmptyMarkup } from '@hcengineering/text'

// Its `applets` is a counter of the sent applets, not drafts.
type EditedMessage = Pick<ChatMessage, 'forwardedMessage' | 'applets'>

// A message with an applet is complete without text: the input may send it, or save the edit, empty.
export function isMessageContentChanged (state: {
  edited: EditedMessage | undefined
  forwardedMessage: Ref<ChatMessage> | undefined
  text: Markup
  attachments: number
  drafts: AppletDraft[]
}): boolean {
  const { edited, forwardedMessage, text, attachments, drafts } = state
  const hasApplets = drafts.length > 0 || (edited?.applets ?? 0) > 0
  return (
    (edited?.forwardedMessage !== forwardedMessage &&
      (!isEmptyMarkup(text) || attachments > 0 || forwardedMessage != null)) ||
    hasApplets
  )
}

// Arrow keys edit the last message from an empty new one only: a draft applet is content too.
export function passesArrowKeys (
  edited: EditedMessage | undefined,
  isEmptyText: boolean,
  drafts: AppletDraft[]
): boolean {
  return isEmptyText && drafts.length === 0 && edited == null
}
