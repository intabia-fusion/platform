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
import { type Ref } from '@hcengineering/core'
import { EmptyMarkup } from '@hcengineering/text'

import { isMessageContentChanged, passesArrowKeys } from '../chatInput'

const poll: AppletDraft = { id: 'draft-1', appletId: 'activity:applet:Poll' as any, params: { question: 'Lunch?' } }
const reply = 'reply-to' as Ref<ChatMessage>

describe('chat input with applets', () => {
  it('sends a new message without text when it has a poll or replies to a message', () => {
    const empty = { edited: undefined, forwardedMessage: undefined, text: EmptyMarkup, attachments: 0 }
    expect(isMessageContentChanged({ ...empty, drafts: [] })).toBe(false)
    expect(isMessageContentChanged({ ...empty, drafts: [poll] })).toBe(true)
    expect(isMessageContentChanged({ ...empty, forwardedMessage: reply, drafts: [] })).toBe(true)
  })

  it('saves an edit of a message with a poll even with the text cleared', () => {
    expect(
      isMessageContentChanged({
        edited: { applets: 1 },
        forwardedMessage: undefined,
        text: EmptyMarkup,
        attachments: 0,
        drafts: []
      })
    ).toBe(true)
  })

  it('does not save an edit of a reply with the text cleared', () => {
    expect(
      isMessageContentChanged({
        edited: { forwardedMessage: reply, applets: 0 },
        forwardedMessage: reply,
        text: EmptyMarkup,
        attachments: 0,
        drafts: []
      })
    ).toBe(false)
  })

  it('lets arrow keys leave only an empty new message without applet drafts', () => {
    expect(passesArrowKeys(undefined, true, [])).toBe(true)
    expect(passesArrowKeys(undefined, true, [poll])).toBe(false)
    expect(passesArrowKeys(undefined, false, [])).toBe(false)
    expect(passesArrowKeys({ applets: 0 }, true, [])).toBe(false)
  })
})
