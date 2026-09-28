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

import type { AccountUuid, Timestamp } from '@hcengineering/core'
import type { QueueTopic } from '@hcengineering/server-core'

import type { HeldPush } from './pendingPush'
import type { Result, TimeMachineMessage } from './types'

// A letter waits an hour or more: too long for the memory of a process that is redeployed
// daily. It is scheduled in the time machine (services/worker, a Postgres table) instead, which
// fires it back on QueueTopic.HeldNotifications; the service then checks whether the person read
// the notification meanwhile and publishes the letter only if not (Workspace.releaseHeld).

const LETTER = 'letter'

// QueueTopic.HeldNotifications, spelled out: the module tests mock @hcengineering/core, and importing
// server-core here would touch the real one while the mock is still being set up (heldLetter.test
// checks the two agree).
export const HELD_NOTIFICATIONS_TOPIC = 'held-notifications' as QueueTopic.HeldNotifications

/** The time machine key: a second schedule of the same letter moves its due date, as a hold would. */
export function heldLetterId (held: Pick<HeldPush, 'account' | 'notificationId' | 'provider'>): string {
  return `${LETTER}:${held.account}:${held.notificationId}:${held.provider}`
}

/** Every letter of the notification, whatever the provider (`%` is the time machine's wildcard). */
export function heldLetterPattern (account: AccountUuid, notificationId: string): string {
  return `${LETTER}:${account}:${notificationId}:%`
}

export function scheduleLetter (result: Result, held: HeldPush, holdMs: number, now: Timestamp = Date.now()): void {
  const schedule: TimeMachineMessage<HeldPush> = {
    type: 'schedule',
    id: heldLetterId(held),
    targetDate: now + holdMs,
    topic: HELD_NOTIFICATIONS_TOPIC,
    data: held
  }
  result.timeMachine.push(schedule)
}

/** The notifications were read or are gone: their letters are not needed. */
export function cancelLetters (result: Result, account: AccountUuid, notificationIds: string[]): void {
  for (const id of notificationIds) {
    const cancel: TimeMachineMessage = { type: 'cancel', id: heldLetterPattern(account, id) }
    result.timeMachine.push(cancel)
  }
}
