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

// A letter waits an hour or more: too long for memory, so it is scheduled in the time machine
// (services/worker), which fires it back on QueueTopic.HeldNotifications (Workspace.releaseHeld).

const LETTER = 'letter'

// Spelled out: importing server-core here breaks the module tests that mock core (heldLetter.test
// checks the two agree).
export const HELD_NOTIFICATIONS_TOPIC = 'held-notifications' as QueueTopic.HeldNotifications

/** letter:<account>:<notification>:<provider> */
export type HeldLetterId = `${typeof LETTER}:${string}:${string}:${string}`

/** The time machine key; a second schedule of it moves the due date. */
export function heldLetterId (held: Pick<HeldPush, 'account' | 'notificationId' | 'provider'>): HeldLetterId {
  return `${LETTER}:${held.account}:${held.notificationId}:${held.provider}`
}

/** Every letter of the notification, whatever the provider. */
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

export function cancelLetters (result: Result, account: AccountUuid, notificationIds: string[]): void {
  for (const id of notificationIds) {
    const cancel: TimeMachineMessage = { type: 'cancel', id: heldLetterPattern(account, id) }
    result.timeMachine.push(cancel)
  }
}
