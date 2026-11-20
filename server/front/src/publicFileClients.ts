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

import type { Client, WorkspaceIds } from '@hcengineering/core'

export interface PublicFileClient {
  client: Client
  wsIds: WorkspaceIds
}

export class PublicFileClientsBusy extends Error {}

interface Entry {
  value: Promise<PublicFileClient>
  created: number
  lastUsed: number
  users: number
  retired: boolean
}

/** Only transport/model state is reused. File authorization is never cached here. */
export class PublicFileClients {
  private readonly entries = new Map<string, Entry>()
  private readonly timer: ReturnType<typeof setInterval>
  private closed = false

  constructor (
    private readonly open: (token: string) => Promise<PublicFileClient>,
    private readonly limits = { maxClients: 32, idleMs: 60000, maxAgeMs: 300000 }
  ) {
    this.timer = setInterval(() => { this.sweep() }, Math.min(limits.idleMs, limits.maxAgeMs))
    this.timer.unref?.()
  }

  async acquire (token: string): Promise<PublicFileClient & { release: (discard?: boolean) => void }> {
    if (this.closed) throw new PublicFileClientsBusy('Client pool is closed')
    this.sweep()
    let entry = this.entries.get(token)
    if (entry !== undefined && this.expired(entry)) {
      if (entry.users > 0) throw new PublicFileClientsBusy('Client is being retired')
      await this.remove(token, entry)
      entry = undefined
    }
    while (entry === undefined && this.entries.size >= this.limits.maxClients) {
      const idle = Array.from(this.entries).filter(([, it]) => it.users === 0)
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0]
      if (idle === undefined) throw new PublicFileClientsBusy('Client pool is busy')
      await this.remove(...idle)
      if (this.closed) throw new PublicFileClientsBusy('Client pool is closed')
      entry = this.entries.get(token)
    }
    // Another acquire may have opened this token while an idle client was closing.
    entry ??= this.entries.get(token)
    if (entry === undefined) {
      entry = {
        value: Promise.resolve().then(async () => await this.open(token)),
        created: Date.now(),
        lastUsed: Date.now(),
        users: 0,
        retired: false
      }
      this.entries.set(token, entry)
    }
    const acquired = entry
    acquired.users++
    try {
      const value = await acquired.value
      let released = false
      return {
        ...value,
        release: (discard = false) => {
          if (released) return
          released = true
          acquired.users--
          acquired.lastUsed = Date.now()
          acquired.retired ||= discard
          if (acquired.users === 0 && (this.closed || this.expired(acquired))) void this.remove(token, acquired)
        }
      }
    } catch (err) {
      acquired.users--
      acquired.retired = true
      if (this.entries.get(token) === acquired) this.entries.delete(token)
      throw err
    }
  }

  close (): void {
    this.closed = true
    clearInterval(this.timer)
    for (const [token, entry] of this.entries) {
      entry.retired = true
      if (entry.users === 0) void this.remove(token, entry)
    }
  }

  private expired (entry: Entry): boolean {
    return entry.retired || Date.now() - entry.created >= this.limits.maxAgeMs ||
      (entry.users === 0 && Date.now() - entry.lastUsed >= this.limits.idleMs)
  }

  private sweep (): void {
    for (const [token, entry] of this.entries) {
      if (entry.users === 0 && this.expired(entry)) void this.remove(token, entry)
    }
  }

  private async remove (token: string, entry: Entry): Promise<void> {
    if (this.entries.get(token) !== entry) return
    this.entries.delete(token)
    await entry.value.then(async ({ client }) => { await client.close() }).catch(() => {})
  }
}
