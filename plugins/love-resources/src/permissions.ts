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

import type { AccountUuid, PersonId } from '@hcengineering/core'
import type { PermanentMeeting } from '@hcengineering/love'

/**
 * Who the caller is, reduced to what the meeting rules read. Passed in rather than fetched so the
 * rules stay testable without a client.
 */
export interface MeetingViewer {
  uuid: AccountUuid
  primarySocialId: PersonId
}

/** The creator of a meeting: `createdBy` for new documents, the first owner for older ones. */
export function isPermanentMeetingCreator (meeting: PermanentMeeting, me: MeetingViewer): boolean {
  if (meeting.createdBy !== undefined) return meeting.createdBy === me.primarySocialId
  return (meeting.owners ?? [])[0] === me.uuid
}

/** An owner cannot walk out: the server puts an owner straight back, so the action would be a lie. */
export function canLeaveMeeting (meeting: PermanentMeeting, me: MeetingViewer): boolean {
  if (meeting.members === undefined) return false
  if (meeting.owners?.includes(me.uuid) === true) return false
  return meeting.members.includes(me.uuid)
}

/** Settings stay open to members: the window itself only allows what the meeting lets them change. */
export function canEditMeeting (meeting: PermanentMeeting, me: MeetingViewer): boolean {
  if (meeting.members === undefined) return false
  return meeting.members.includes(me.uuid)
}
