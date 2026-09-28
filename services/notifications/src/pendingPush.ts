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

import type { AccountUuid, Doc, Ref, Timestamp } from '@hcengineering/core'
import type { QueueNotifyMessage } from '@hcengineering/notification'

/**
 * How a read of the held notification shows up: a chat message is read when the account's
 * `ReadState` position passes its `createdOn`; a reaction, a mention outside a message or a
 * common notification is read when its id leaves the matching `unread*` list of the context.
 */
export type HeldReadBy = 'position' | 'reactions' | 'mentions' | 'commons'

export interface HeldPush {
  account: AccountUuid
  // The notification id, the push's tag.
  notificationId: string
  objectId: Ref<Doc>
  createdOn: Timestamp
  readBy: HeldReadBy
  // The native part of the queue message, published if the hold ends unread.
  message: QueueNotifyMessage
}

export interface PendingPushOptions {
  // The cap: a held push that is neither read nor released goes out after this.
  holdMs: number
  // How often the due pushes are looked for; the tick runs only while something is held.
  sweepMs?: number
  publish: (message: QueueNotifyMessage) => Promise<void>
  // Which of the pushes the person read meanwhile (see HeldReadBy), one answer per push in order.
  // One call per batch: the pushes of one document need one lookup, not one each.
  areRead: (held: HeldPush[]) => Promise<boolean[]>
  // A failed check (the DB is away) is retried this much later, this many times; then the push
  // goes out unchecked: a push the person may have read beats a push they never get.
  checkRetryMs?: number
  checkAttempts?: number
  // A push that could not be published: it is lost.
  onError: (err: unknown, held: HeldPush) => void
  // A check failed and the push waits for another try.
  onCheckFailed?: (err: unknown, held: HeldPush, attempt: number) => void
}

interface Entry {
  held: HeldPush
  dueAt: number
  // Read checks that failed for this push so far.
  checkFailures: number
}

export const DEFAULT_SWEEP_MS = 1000
export const DEFAULT_CHECK_RETRY_MS = 5000
export const DEFAULT_CHECK_ATTEMPTS = 3

// A push to a phone about something the person is about to see on the computer is noise. While
// the receiver is at the computer the native push waits here: reading it there cancels the push,
// leaving the computer (away, offline) or the cap releases it. The hold lives in memory only: a
// crash loses what was waiting, a graceful close publishes it. One tick a second releases
// everything due, so a burst of pushes ends in one batch and one read check.
export class PendingPushHolder {
  private readonly entries = new Map<string, Entry>()
  private timer: ReturnType<typeof setInterval> | undefined

  constructor (private readonly options: PendingPushOptions) {}

  private key (account: AccountUuid, notificationId: string): string {
    return `${account}:${notificationId}`
  }

  get size (): number {
    return this.entries.size
  }

  // A second hold of the same push (a redelivered tx) restarts its cap rather than doubling it.
  hold (held: HeldPush): void {
    this.put({ held, dueAt: Date.now() + this.options.holdMs, checkFailures: 0 })
  }

  private put (entry: Entry): void {
    this.entries.set(this.key(entry.held.account, entry.held.notificationId), entry)
    if (this.timer === undefined) {
      this.timer = setInterval(() => {
        this.sweep()
      }, this.options.sweepMs ?? DEFAULT_SWEEP_MS)
      this.timer.unref?.()
    }
  }

  cancel (account: AccountUuid, notificationId: string): boolean {
    return this.drop(this.key(account, notificationId))
  }

  // The account read the document up to `readUpTo`: every held push about it up to there is cancelled.
  cancelByObject (account: AccountUuid, objectId: Ref<Doc>, readUpTo: Timestamp): number {
    let cancelled = 0
    for (const [key, entry] of this.entries) {
      const { held } = entry
      if (held.account === account && held.objectId === objectId && held.createdOn <= readUpTo) {
        if (this.drop(key)) cancelled++
      }
    }
    return cancelled
  }

  // The account left the computer: what waited for it goes out now.
  async flushByAccount (account: AccountUuid): Promise<void> {
    await this.releaseWhere((entry) => entry.held.account === account)
  }

  // The service is closing: nothing can wait for another try, a failed check publishes unchecked.
  async flushAll (): Promise<void> {
    await this.releaseWhere(() => true, true)
  }

  private sweep (): void {
    const now = Date.now()
    void this.releaseWhere((entry) => entry.dueAt <= now)
  }

  private drop (key: string): boolean {
    const dropped = this.entries.delete(key)
    if (this.entries.size === 0 && this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    return dropped
  }

  // Ends the hold of every matching push: each goes out unless the person read it meanwhile.
  // The batch is taken out first, so a cancel arriving during the check finds nothing to cancel.
  private async releaseWhere (match: (entry: Entry) => boolean, final = false): Promise<void> {
    const batch: Entry[] = []
    for (const [key, entry] of this.entries) {
      if (match(entry)) {
        this.drop(key)
        batch.push(entry)
      }
    }
    if (batch.length === 0) return
    let read: boolean[]
    try {
      read = await this.options.areRead(batch.map((it) => it.held))
    } catch (err) {
      // A deferred push counts as read for this round: it is not published now.
      read = batch.map((entry) => this.deferAfterFailedCheck(entry, err, final))
    }
    await Promise.all(
      batch.map(async ({ held }, i) => {
        if (read[i]) return
        try {
          await this.options.publish(held.message)
        } catch (err) {
          this.options.onError(err, held)
        }
      })
    )
  }

  // Puts the push back for a later try; false when it is out of tries (or the holder is closing)
  // and the push goes out unchecked.
  private deferAfterFailedCheck (entry: Entry, err: unknown, final: boolean): boolean {
    const attempt = entry.checkFailures + 1
    if (final || attempt >= (this.options.checkAttempts ?? DEFAULT_CHECK_ATTEMPTS)) return false
    this.put({
      ...entry,
      checkFailures: attempt,
      dueAt: Date.now() + (this.options.checkRetryMs ?? DEFAULT_CHECK_RETRY_MS)
    })
    this.options.onCheckFailed?.(err, entry.held, attempt)
    return true
  }
}
