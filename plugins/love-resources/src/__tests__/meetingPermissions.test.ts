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

import type { AccountUuid, PersonId, Ref } from '@hcengineering/core'
import type { PermanentMeeting } from '@hcengineering/love'
import { canEditMeeting, canLeaveMeeting, isPermanentMeetingCreator, type MeetingViewer } from '../permissions'

const creatorAccount = 'account:creator' as AccountUuid
const memberAccount = 'account:member' as AccountUuid
const strangerAccount = 'account:stranger' as AccountUuid

const creatorSocial = 'social:creator' as PersonId
const memberSocial = 'social:member' as PersonId

const creatorViewer: MeetingViewer = { uuid: creatorAccount, primarySocialId: creatorSocial }
const memberViewer: MeetingViewer = { uuid: memberAccount, primarySocialId: memberSocial }
const strangerViewer: MeetingViewer = { uuid: strangerAccount, primarySocialId: 'social:stranger' as PersonId }

function meeting (opts?: {
  owners?: AccountUuid[]
  members?: AccountUuid[]
  createdBy?: PersonId
}): PermanentMeeting {
  return {
    _id: 'permanent:1' as Ref<PermanentMeeting>,
    owners: opts?.owners ?? [creatorAccount],
    members: opts?.members ?? [creatorAccount, memberAccount],
    createdBy: opts?.createdBy
  } as unknown as PermanentMeeting
}

describe('meeting permissions', () => {
  describe('isPermanentMeetingCreator', () => {
    it('reads createdBy of a new document', () => {
      const doc = meeting({ createdBy: creatorSocial })

      expect(isPermanentMeetingCreator(doc, creatorViewer)).toBe(true)
      expect(isPermanentMeetingCreator(doc, memberViewer)).toBe(false)
    })

    it('falls back to the first owner of an old document', () => {
      const doc = meeting({ owners: [creatorAccount, memberAccount] })

      expect(isPermanentMeetingCreator(doc, creatorViewer)).toBe(true)
      expect(isPermanentMeetingCreator(doc, memberViewer)).toBe(false)
    })

    it('is false for a document without owners and createdBy', () => {
      expect(isPermanentMeetingCreator(meeting({ owners: [] }), creatorViewer)).toBe(false)
    })
  })

  describe('canLeaveMeeting', () => {
    it('hides the action from an owner, the creator included', () => {
      expect(canLeaveMeeting(meeting({ createdBy: creatorSocial }), creatorViewer)).toBe(false)
    })

    it('shows the action to a plain member', () => {
      expect(canLeaveMeeting(meeting({ createdBy: creatorSocial }), memberViewer)).toBe(true)
    })

    it('hides the action from somebody who is not a member', () => {
      expect(canLeaveMeeting(meeting({ createdBy: creatorSocial }), strangerViewer)).toBe(false)
    })
  })

  describe('canEditMeeting', () => {
    it('is open to members, the creator included', () => {
      expect(canEditMeeting(meeting(), creatorViewer)).toBe(true)
      expect(canEditMeeting(meeting(), memberViewer)).toBe(true)
    })

    it('is closed to everybody else', () => {
      expect(canEditMeeting(meeting(), strangerViewer)).toBe(false)
    })
  })
})
