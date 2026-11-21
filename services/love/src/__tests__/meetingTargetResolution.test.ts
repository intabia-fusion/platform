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
import calendar from '@hcengineering/calendar'
import type { MeasureContext, Ref } from '@hcengineering/core'
import love, { type PermanentMeeting } from '@hcengineering/love'
import { WorkspaceClient } from '../workspaceClient'
import { createMockContext } from './test-helpers'

const permanentId = 'PM1' as Ref<PermanentMeeting>

const permanentMeeting = {
  _id: permanentId,
  _class: love.class.PermanentMeeting,
  name: 'Daily',
  members: ['account-1'],
  linkVersion: 1,
  meetingAccess: {}
}

function makeWorkspaceClient (
  ctx: MeasureContext,
  opts: { event?: any, permanent?: any, mixin?: any }
): WorkspaceClient {
  const event =
    opts.event === undefined
      ? undefined
      : {
          _id: 'event-doc-1',
          _class: calendar.class.Event,
          eventId: 'E1',
          title: 'Daily',
          ...(opts.mixin !== undefined ? { [love.mixin.MeetingEventLink]: opts.mixin } : {}),
          ...opts.event
        }
  const client = {
    findOne: jest.fn(async (cls: string) => {
      if (cls === calendar.class.Event) return event
      if (cls === love.class.PermanentMeeting) return opts.permanent
      return undefined
    }),
    findAll: jest.fn(async () => [])
  }
  // Bypass the private constructor: only `ctx` and `client` are touched, no network.
  const wc = Object.create(WorkspaceClient.prototype)
  wc.ctx = ctx
  wc.client = client
  return wc as WorkspaceClient
}

describe('WorkspaceClient.findMeetingTarget → a permanent meeting addressed by its series', () => {
  it('resolves the event back to the meeting, so membership is the meeting’s members', async () => {
    // The series of a permanent meeting has no participants of its own; only the back-reference
    // tells who may join. Resolving by the event id used to answer 403 for its own participants.
    const wc = makeWorkspaceClient(createMockContext(), {
      event: {},
      permanent: permanentMeeting,
      mixin: { permanentMeeting: permanentId }
    })

    const target = await wc.findMeetingTarget('E1', 'event')

    expect(target?.kind).toBe('meeting')
    expect(target?.kind === 'meeting' ? target.meeting._id : undefined).toBe(permanentId)
  })

  it('keeps the meeting path when the meeting id is given directly', async () => {
    const wc = makeWorkspaceClient(createMockContext(), { permanent: permanentMeeting })

    const target = await wc.findMeetingTarget(permanentId, 'meeting')

    expect(target?.kind).toBe('meeting')
  })
})
