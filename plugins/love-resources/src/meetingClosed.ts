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
import { Severity, Status } from '@hcengineering/platform'
import { formatOccurrence } from './occurrenceTime'

/** What the service answers when the join window of a meeting is closed. */
const MEETING_CLOSED = 403
/** What it answers when the meeting the request names no longer exists. */
const MEETING_MISSING = 404

/**
 * The status to show when a join was refused because the meeting is not open, or `undefined` when
 * the refusal is something else and has to be reported as an error.
 *
 * `nextOccurrence` decides the wording: a series with a future occurrence says when the meeting
 * opens, a series with none says it is over. The time arrives here as a raw timestamp and leaves as
 * a formatted string, so the message is complete by the time it reaches the status bar.
 */
export function meetingClosedStatus (
  status: number | undefined,
  body: Record<string, any> | undefined,
  formatTime: (ts: number) => string = formatOccurrence
): Status | undefined {
  if (status === MEETING_MISSING) {
    // A meeting that is gone is not a runtime error: its series may still be on screen after it was
    // deleted, and the person deserves a sentence instead of a crash.
    return new Status(Severity.WARNING, love.string.MeetingNotFound, {}, undefined, { timeout: 6000 })
  }
  if (status !== MEETING_CLOSED) return undefined
  const next = typeof body?.nextOccurrence === 'number' ? body.nextOccurrence : undefined
  return next !== undefined
    ? new Status(Severity.WARNING, love.string.MeetingNotOpenYet, { time: formatTime(next) }, undefined, {
      timeout: 6000
    })
    : new Status(Severity.WARNING, love.string.MeetingIsOver, {}, undefined, { timeout: 6000 })
}
