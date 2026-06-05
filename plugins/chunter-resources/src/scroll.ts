//
// Copyright © 2024 Hardcore Engineering Inc.
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
import { sortActivityMessages } from '@hcengineering/activity-resources'
import { type ActivityMessage } from '@hcengineering/activity'
import { type DocNotifyContext, type ReadState } from '@hcengineering/notification'

import { readChannelMessages } from './utils'

export function messageInView (msgElement: Element, containerRect: DOMRect): boolean {
  const rect = msgElement.getBoundingClientRect()
  return rect.bottom > containerRect.top && rect.top < containerRect.bottom
}

const messagesToReadAccumulator: Set<ActivityMessage> = new Set<ActivityMessage>()
let messagesToReadAccumulatorTimer: any

export function readViewportMessages (
  messages: ActivityMessage[],
  scrollDiv?: HTMLElement | null,
  contentDiv?: HTMLElement | null,
  context?: DocNotifyContext,
  readState?: ReadState | null
): void {
  if (scrollDiv == null || contentDiv == null) return

  const scrollRect = scrollDiv.getBoundingClientRect()
  const messagesElements = contentDiv?.getElementsByClassName('activityMessage')

  for (const message of messages) {
    const msgElement = messagesElements?.[message._id as any]
    if (msgElement == null) continue

    if (messageInView(msgElement, scrollRect)) {
      messagesToReadAccumulator.add(message)
    }
  }

  clearTimeout(messagesToReadAccumulatorTimer)
  messagesToReadAccumulatorTimer = setTimeout(() => {
    const messagesToRead = [...messagesToReadAccumulator]
    messagesToReadAccumulator.clear()
    if (messagesToRead.length === 0) return
    void readChannelMessages(sortActivityMessages(messagesToRead), context, readState)
  }, 500)
}
