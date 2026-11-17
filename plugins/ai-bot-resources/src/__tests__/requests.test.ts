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

import { type Ref } from '@hcengineering/core'
import { type MeetingMinutes, type RoomLanguage } from '@hcengineering/love'
import { addStatusNotification } from '@hcengineering/ui'
import { connectMeeting } from '../requests'

jest.mock('@hcengineering/platform', () => ({
  ...jest.requireActual('@hcengineering/platform'),
  getMetadata: jest.fn(() => 'http://test')
}))
jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: { metadata: { Token: 'token' } }
}))
jest.mock('@hcengineering/ui', () => ({
  __esModule: true,
  default: { string: { WorkspaceLimitsExhausted: 'ui:string:WorkspaceLimitsExhausted' } },
  addStatusNotification: jest.fn()
}))

it('shows the workspace limit message when a new transcription is rejected', async () => {
  globalThis.fetch = jest.fn(async () => ({ ok: false, status: 413 })) as any

  await connectMeeting('meeting' as Ref<MeetingMinutes>, 'ru' as RoomLanguage, { transcription: true })

  expect(addStatusNotification).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'ui:string:WorkspaceLimitsExhausted' })
  )
})
