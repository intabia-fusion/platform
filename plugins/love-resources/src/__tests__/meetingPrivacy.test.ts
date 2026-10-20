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

import { type MeetingMinutes } from '@hcengineering/love'
import { showPopup } from '@hcengineering/ui'
import { setMeetingPrivate } from '../meetingPrivacy'

const mockUpdate = jest.fn()

jest.mock('@hcengineering/core', () => ({ getCurrentAccount: () => ({ uuid: 'me' }) }))
jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({ update: mockUpdate }),
  MessageBox: 'MessageBox'
}))
jest.mock('@hcengineering/ui', () => ({ showPopup: jest.fn() }))
jest.mock('../plugin', () => ({
  __esModule: true,
  default: { string: { CloseRoom: 'CloseRoom', CloseRoomNotMember: 'CloseRoomNotMember', JoinAndCloseRoom: 'Join' } }
}))

function meeting (members: string[], isPrivate = false): MeetingMinutes {
  return { _id: 'mm1', members, private: isPrivate } as unknown as MeetingMinutes
}

function answerConfirm (result: boolean | undefined): void {
  ;(showPopup as jest.Mock).mockImplementation((_c, _p, _a, onClose: (r?: boolean) => void) => {
    onClose(result)
  })
}

describe('setMeetingPrivate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('closes a meeting for a member without asking', async () => {
    const mm = meeting(['me'])
    await setMeetingPrivate(mm, true)

    expect(showPopup).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(mm, { private: true })
  })

  it('opens a meeting for a non-member without asking', async () => {
    const mm = meeting(['other'], true)
    await setMeetingPrivate(mm, false)

    expect(showPopup).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(mm, { private: false })
  })

  it('joins a non-member in the same update when they confirm closing', async () => {
    answerConfirm(true)
    const mm = meeting(['other'])
    await setMeetingPrivate(mm, true)

    expect(showPopup).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(mm, { private: true, $push: { members: 'me' } })
  })

  it.each([false, undefined])('changes nothing when a non-member dismisses the confirm (%s)', async (result) => {
    answerConfirm(result)
    await setMeetingPrivate(meeting(['other']), true)

    expect(showPopup).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
