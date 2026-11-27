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

import { type Ref, type WorkspaceUuid } from '@hcengineering/core'
import { PublicFileAccessError, type PublicFileAccessClient } from '@hcengineering/datalake'
import { type PublicFileSyncJob } from '@hcengineering/guest'

let backgroundWorkers = 0

type PendingJob = Pick<PublicFileSyncJob, '_id' | 'generation'>

export interface PublicFileSource {
  pending: () => Promise<PendingJob[]>
  finish: (id: Ref<PublicFileSyncJob>, generation: string, retryAt?: number) => Promise<void>
  files: (linkId: string) => Promise<string[] | undefined>
}

export class PublicFileSync {
  private readonly locks = new Map<string, Promise<boolean>>()
  private closed = false
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private wakeRequested = false
  private backoff = 1000

  constructor (
    private readonly workspace: WorkspaceUuid,
    private readonly client: Pick<PublicFileAccessClient, 'state' | 'replace' | 'revoke'>,
    private readonly source: PublicFileSource,
    private readonly report: (error: unknown) => void
  ) {}

  async sourceFiles (linkId: string): Promise<string[] | undefined> {
    return await this.source.files(linkId)
  }

  /** Returns true when this link id is permanently revoked. */
  async sync (linkId: string, restrictOnly = false): Promise<boolean> {
    const previous = this.locks.get(linkId) ?? Promise.resolve(false)
    const work = previous
      .catch(() => {})
      .then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          // Read the revision BEFORE the source, so a concurrent publisher cannot overwrite
          // a completed reduction with an older snapshot and a higher revision.
          const state = await this.client.state(this.workspace, linkId)
          if (state.revoked) return true
          const files = await this.source.files(linkId)
          try {
            if (files === undefined) {
              await this.client.revoke(this.workspace, linkId, state.revision + 1)
              return true
            } else {
              const allowed = new Set(files)
              const next = restrictOnly ? state.blobs.filter((file) => allowed.has(file)) : files
              const sorted = [...new Set(next)].sort()
              // A restriction must fence publishers that collected an older source snapshot,
              // including files which have not reached the registry yet.
              if (!restrictOnly && JSON.stringify([...state.blobs].sort()) === JSON.stringify(sorted)) return false
              await this.client.replace(this.workspace, linkId, state.revision + 1, sorted)
            }
            return false
          } catch (err) {
            if (!(err instanceof PublicFileAccessError) || err.status !== 409 || attempt === 2) throw err
          }
        }
        return false
      })
    this.locks.set(linkId, work)
    try {
      return await work
    } finally {
      if (this.locks.get(linkId) === work) this.locks.delete(linkId)
    }
  }

  wake (): void {
    if (this.running !== undefined) {
      this.wakeRequested = true
    } else if (this.backoff === 1000) {
      clearTimeout(this.timer)
      this.timer = undefined
      this.schedule(1)
    }
  }

  start (): void {
    this.schedule(1000)
  }

  private schedule (delay: number): void {
    if (this.closed || this.timer !== undefined) return
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        this.running = this.tick().finally(() => {
          this.running = undefined
        })
      },
      Math.round(delay * (0.8 + Math.random() * 0.4))
    )
    this.timer.unref?.()
  }

  async tick (): Promise<void> {
    if (this.closed) return
    if (backgroundWorkers >= 2) {
      this.schedule(1000)
      return
    }
    let acquired = false
    try {
      this.wakeRequested = false
      const jobs = await this.source.pending()
      if (this.closed) return
      if (backgroundWorkers >= 2) {
        this.schedule(1000)
        return
      }
      backgroundWorkers++
      acquired = true
      for (const job of jobs) {
        if (this.closed) return
        let retryAt: number | undefined
        try {
          await this.sync(job._id)
        } catch (err) {
          // Keep failures in the queue without keeping later jobs behind them.
          this.report(err)
          const retryAfter = err instanceof PublicFileAccessError ? (err.retryAfterMs ?? 0) : 0
          retryAt = Date.now() + Math.min(Math.max(60000, retryAfter), 1800000)
        }
        await this.source.finish(job._id, job.generation, retryAt)
      }
      this.backoff = 1000
      this.schedule(this.wakeRequested ? 1 : jobs.length === 10 ? 1000 : 60000)
    } catch (err) {
      this.report(err)
      this.backoff = Math.min(this.backoff * 2, 300000)
      const retryAfter = err instanceof PublicFileAccessError ? (err.retryAfterMs ?? 0) : 0
      this.schedule(Math.min(Math.max(this.backoff, retryAfter), 1800000))
    } finally {
      if (acquired) backgroundWorkers--
    }
  }

  async close (): Promise<void> {
    this.closed = true
    clearTimeout(this.timer)
    await this.running
    await Promise.allSettled([...this.locks.values()])
  }
}
