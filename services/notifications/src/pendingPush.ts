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
import type { ContextNotification, NotificationProvider, QueueNotifyMessage } from '@hcengineering/notification'

// How a read shows up: a message by the `ReadState` position, the rest by its id leaving the
// context's `unread*` list.
export type HeldReadBy = 'position' | 'reactions' | 'mentions' | 'commons'

export interface HeldPush {
  account: AccountUuid
  notificationId: ContextNotification['id']
  objectId: Ref<Doc>
  createdOn: Timestamp
  readBy: HeldReadBy
  provider: Ref<NotificationProvider>
  // What this provider delivers, published if the hold ends unread.
  message: QueueNotifyMessage
}

export interface PendingPushOptions {
  // The cap on a hold.
  holdMs: number
  sweepMs?: number
  publish: (message: QueueNotifyMessage) => Promise<void>
  // Which of the pushes were read meanwhile, one answer per push in order; one call per batch.
  areRead: (held: HeldPush[]) => Promise<boolean[]>
  // A failed check is retried this much later, this many times; then the push goes out unchecked.
  checkRetryMs?: number
  checkAttempts?: number
  onError: (err: unknown, held: HeldPush) => void
  onCheckFailed?: (err: unknown, held: HeldPush, attempt: number) => void
}

interface Entry {
  held: HeldPush
  dueAt: number
  checkFailures: number
}

export const DEFAULT_SWEEP_MS = 1000
export const DEFAULT_CHECK_RETRY_MS = 5000
export const DEFAULT_CHECK_ATTEMPTS = 3

// The native pushes of people at the computer wait here: a read cancels, leaving or the cap
// releases. In memory only; one tick a second releases everything due in one batch.
export class PendingPushHolder {
  private readonly entries = new Map<string, Entry>()
  private timer: ReturnType<typeof setInterval> | undefined
  // Releases in flight, for flushAll to wait for.
  private readonly inFlight = new Set<Promise<void>>()
  private closed = false

  constructor (private readonly options: PendingPushOptions) {}

  private prefix (account: AccountUuid, notificationId: string): string {
    return `${account}:${notificationId}:`
  }

  private key (account: AccountUuid, notificationId: string, provider: Ref<NotificationProvider>): string {
    return `${this.prefix(account, notificationId)}${provider}`
  }

  get size (): number {
    return this.entries.size
  }

  // A second hold of the same push (a redelivered tx) restarts its cap.
  hold (held: HeldPush): void {
    if (this.closed) {
      void this.options.publish(held.message).catch((err) => {
        this.options.onError(err, held)
      })
      return
    }
    this.put({ held, dueAt: Date.now() + this.options.holdMs, checkFailures: 0 })
  }

  private put (entry: Entry): void {
    const { account, notificationId, provider } = entry.held
    this.entries.set(this.key(account, notificationId, provider), entry)
    if (this.timer === undefined) {
      this.timer = setInterval(() => {
        this.sweep()
      }, this.options.sweepMs ?? DEFAULT_SWEEP_MS)
      this.timer.unref?.()
    }
  }

  cancel (account: AccountUuid, notificationId: string): boolean {
    const prefix = this.prefix(account, notificationId)
    let cancelled = false
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix) && this.drop(key)) cancelled = true
    }
    return cancelled
  }

  // Only the pushes read by position (messages): the rest waits for its own id.
  cancelByObject (account: AccountUuid, objectId: Ref<Doc>, readUpTo: Timestamp): string[] {
    const cancelled: string[] = []
    for (const [key, entry] of this.entries) {
      const { held } = entry
      if (
        held.readBy === 'position' &&
        held.account === account &&
        held.objectId === objectId &&
        held.createdOn <= readUpTo
      ) {
        if (this.drop(key)) cancelled.push(held.notificationId)
      }
    }
    return cancelled
  }

  // A whole-inbox read: everything held for the account is read, whatever it is about.
  cancelByAccount (account: AccountUuid): string[] {
    const cancelled: string[] = []
    for (const [key, entry] of this.entries) {
      if (entry.held.account === account && this.drop(key)) cancelled.push(entry.held.notificationId)
    }
    return cancelled
  }

  async flushByAccount (account: AccountUuid): Promise<void> {
    await this.release((entry) => entry.held.account === account)
  }

  // Closing: the releases in flight finish, then the rest goes out, a failed check unchecked.
  async flushAll (): Promise<void> {
    this.closed = true
    while (this.inFlight.size > 0) await Promise.allSettled(Array.from(this.inFlight))
    await this.release(() => true, true)
  }

  private sweep (): void {
    const now = Date.now()
    void this.release((entry) => entry.dueAt <= now)
  }

  private release (match: (entry: Entry) => boolean, final = false): Promise<void> {
    const run = this.releaseWhere(match, final).finally(() => this.inFlight.delete(run))
    this.inFlight.add(run)
    return run
  }

  private drop (key: string): boolean {
    const dropped = this.entries.delete(key)
    if (this.entries.size === 0 && this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    return dropped
  }

  // The batch leaves `entries` before the check: a cancel arriving meanwhile finds nothing.
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

  // Back for a later try; false when out of tries or closing: the push goes out unchecked.
  private deferAfterFailedCheck (entry: Entry, err: unknown, final: boolean): boolean {
    const attempt = entry.checkFailures + 1
    if (final || this.closed || attempt >= (this.options.checkAttempts ?? DEFAULT_CHECK_ATTEMPTS)) return false
    this.put({
      ...entry,
      checkFailures: attempt,
      dueAt: Date.now() + (this.options.checkRetryMs ?? DEFAULT_CHECK_RETRY_MS)
    })
    this.options.onCheckFailed?.(err, entry.held, attempt)
    return true
  }
}
