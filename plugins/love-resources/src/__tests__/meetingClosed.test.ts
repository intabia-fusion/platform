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

import love from '@hcengineering/love'
import { Severity } from '@hcengineering/platform'
import { meetingClosedStatus } from '../meetingClosed'
import { formatOccurrence } from '../occurrenceTime'

describe('meetingClosedStatus', () => {
  it('says when the meeting opens when the service names the next occurrence', () => {
    const next = new Date('2026-11-20T15:00:00Z').getTime()

    const status = meetingClosedStatus(403, { error: 'Meeting is not open', nextOccurrence: next })

    expect(status).toBeDefined()
    expect(status?.severity).toBe(Severity.WARNING)
    expect(status?.code).toBe(love.string.MeetingNotOpenYet)
    expect(status?.params.time).toBe(formatOccurrence(next))
  })

  it('says the meeting is over when the series has no next occurrence', () => {
    const status = meetingClosedStatus(403, { error: 'Meeting is not open' })

    expect(status?.code).toBe(love.string.MeetingIsOver)
    expect(status?.params).toEqual({})
  })

  it('does not swallow other failures', () => {
    // Only a closed window is an answer; a 500 or a network error must reach the caller as is.
    expect(meetingClosedStatus(500, { error: 'boom' })).toBeUndefined()
    expect(meetingClosedStatus(undefined, undefined)).toBeUndefined()
  })
})

describe('formatOccurrence', () => {
  it('renders the time, not the raw timestamp', () => {
    const formatted = formatOccurrence(new Date('2026-11-20T15:00:00Z').getTime())

    expect(formatted).not.toBe('')
    expect(formatted).not.toBe(String(new Date('2026-11-20T15:00:00Z').getTime()))
    expect(formatted).toMatch(/\d/)
  })
})
