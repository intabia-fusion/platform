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

import { getCurrentAccount } from '@hcengineering/core'
import { type MeetingMinutes } from '@hcengineering/love'
import { getClient, MessageBox } from '@hcengineering/presentation'
import { showPopup } from '@hcengineering/ui'
import love from './plugin'

/** Closing a meeting you are not a member of hides its content from you, so offer to join. */
export async function setMeetingPrivate (mm: MeetingMinutes, value: boolean): Promise<void> {
  const client = getClient()
  const me = getCurrentAccount().uuid
  if (!value || mm.members.includes(me)) {
    await client.update(mm, { private: value })
    return
  }
  const confirmed = await new Promise<boolean>((resolve) => {
    showPopup(
      MessageBox,
      { label: love.string.CloseRoom, message: love.string.CloseRoomNotMember, okLabel: love.string.JoinAndCloseRoom },
      undefined,
      (result?: boolean) => {
        resolve(result === true)
      }
    )
  })
  if (!confirmed) return
  await client.update(mm, { private: true, $push: { members: me } })
}
