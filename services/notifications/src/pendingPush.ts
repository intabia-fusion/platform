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

export interface HeldPush {
  account: AccountUuid
  // The notification id, the push's tag.
  notificationId: string
  objectId: Ref<Doc>
  createdOn: Timestamp
  // The native part of the queue message, published if the hold ends unread.
  message: QueueNotifyMessage
}

export interface PendingPushOptions {
  // The cap: a held push that is neither read nor released goes out after this.
  holdMs: number
  publish: (message: QueueNotifyMessage) => Promise<void>
  // Whether the account read the document past the message; checked when the hold ends.
  isRead: (account: AccountUuid, objectId: Ref<Doc>, createdOn: Timestamp) => Promise<boolean>
  onError: (err: unknown, held: HeldPush) => void
}

interface Entry {
  held: HeldPush
  timer: ReturnType<typeof setTimeout>
}

// A push to a phone about a message the person is about to read on the computer is noise. While
// the receiver is at the computer the native push waits here: reading the document cancels it,
// leaving the computer (away, offline) or the cap releases it. The hold lives in memory only: a
// crash loses what was waiting, a graceful close publishes it.
export class PendingPushHolder {
  private readonly entries = new Map<string, Entry>()

  constructor (private readonly options: PendingPushOptions) {}

  private key (account: AccountUuid, notificationId: string): string {
    return `${account}:${notificationId}`
  }

  get size (): number {
    return this.entries.size
  }

  // A second hold of the same push (a redelivered tx) replaces the first timer rather than doubling it.
  hold (held: HeldPush): void {
    const key = this.key(held.account, held.notificationId)
    const existing = this.entries.get(key)
    if (existing !== undefined) clearTimeout(existing.timer)
    const timer = setTimeout(() => {
      void this.release(key, true)
    }, this.options.holdMs)
    this.entries.set(key, { held, timer })
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
    await this.releaseWhere((held) => held.account === account)
  }

  async flushAll (): Promise<void> {
    await this.releaseWhere(() => true)
  }

  private drop (key: string): boolean {
    const entry = this.entries.get(key)
    if (entry === undefined) return false
    clearTimeout(entry.timer)
    this.entries.delete(key)
    return true
  }

  private async releaseWhere (match: (held: HeldPush) => boolean): Promise<void> {
    const keys = Array.from(this.entries.entries())
      .filter(([, entry]) => match(entry.held))
      .map(([key]) => key)
    await Promise.all(
      keys.map(async (key) => {
        await this.release(key, true)
      })
    )
  }

  // Ends the hold: the push goes out unless the person read the message meanwhile. The read check
  // is skipped only when the caller knows better.
  private async release (key: string, recheck: boolean): Promise<void> {
    const entry = this.entries.get(key)
    if (entry === undefined) return
    this.drop(key)
    const { held } = entry
    try {
      if (recheck && (await this.options.isRead(held.account, held.objectId, held.createdOn))) return
      await this.options.publish(held.message)
    } catch (err) {
      this.options.onError(err, held)
    }
  }
}
