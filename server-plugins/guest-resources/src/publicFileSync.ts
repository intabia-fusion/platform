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

import { type WorkspaceUuid } from '@hcengineering/core'
import { PublicFileAccessError, type PublicFileAccessClient } from '@hcengineering/datalake'

let backgroundWorkers = 0

export interface PublicFileSource {
  links: (after: string) => Promise<string[]>
  files: (linkId: string) => Promise<string[] | undefined>
}

/** Source records and registry rows are the durable work list; no in-memory event is required for recovery. */
export class PublicFileSync {
  private readonly locks = new Map<string, Promise<void>>()
  private readonly hints = new Map<string, number>()
  private closed = false
  private timer?: ReturnType<typeof setTimeout>
  private running?: Promise<void>
  private sourceCursor = ''
  private registryCursor = ''
  private sourceDone = false
  private registryDone = false
  private backoff = 1000

  constructor (
    private readonly workspace: WorkspaceUuid,
    private readonly client: Pick<PublicFileAccessClient, 'state' | 'replace' | 'revoke' | 'activeLinks'>,
    private readonly source: PublicFileSource,
    private readonly report: (error: unknown) => void
  ) {}

  async sourceFiles (linkId: string): Promise<string[] | undefined> {
    return await this.source.files(linkId)
  }

  async sync (linkId: string, restrictOnly = false): Promise<void> {
    const previous = this.locks.get(linkId) ?? Promise.resolve()
    const work = previous
      .catch(() => {})
      .then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          // Read the revision BEFORE the source, so a concurrent publisher cannot overwrite
          // a completed reduction with an older snapshot and a higher revision.
          const state = await this.client.state(this.workspace, linkId)
          if (state.revoked) return
          const files = await this.source.files(linkId)
          try {
            if (files === undefined) {
              await this.client.revoke(this.workspace, linkId, state.revision + 1)
            } else {
              const allowed = new Set(files)
              const next = restrictOnly ? state.blobs.filter((file) => allowed.has(file)) : files
              const sorted = [...new Set(next)].sort()
              // A restriction must fence publishers that collected an older source snapshot,
              // including files which have not reached the registry yet.
              if (!restrictOnly && JSON.stringify([...state.blobs].sort()) === JSON.stringify(sorted)) return
              await this.client.replace(this.workspace, linkId, state.revision + 1, sorted)
            }
            return
          } catch (err) {
            if (!(err instanceof PublicFileAccessError) || err.status !== 409 || attempt === 2) throw err
          }
        }
      })
    this.locks.set(linkId, work)
    try {
      await work
    } finally {
      if (this.locks.get(linkId) === work) this.locks.delete(linkId)
    }
  }

  enqueue (ids: Iterable<string>): void {
    for (const id of ids) {
      if (this.hints.size < 1000 || this.hints.has(id)) this.hints.set(id, (this.hints.get(id) ?? 0) + 1)
    }
    if (this.running === undefined && this.backoff === 1000) {
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
    backgroundWorkers++
    try {
      const source = this.sourceDone ? [] : await this.source.links(this.sourceCursor)
      const registry = this.registryDone ? [] : await this.client.activeLinks(this.workspace, this.registryCursor)
      const hints = new Map([...this.hints].slice(0, 10))
      for (const id of new Set([...hints.keys(), ...source, ...registry])) {
        if (this.closed) return
        try {
          await this.sync(id)
        } catch (err) {
          if (!(err instanceof PublicFileAccessError) || ![400, 409].includes(err.status)) throw err
          this.report(new Error(`Public file synchronization rejected for link ${id}: HTTP ${err.status}`))
        }
        if (hints.has(id) && this.hints.get(id) === hints.get(id)) this.hints.delete(id)
      }
      this.sourceCursor = source.at(-1) ?? this.sourceCursor
      this.registryCursor = registry.at(-1) ?? this.registryCursor
      this.sourceDone ||= source.length < 10
      this.registryDone ||= registry.length < 10
      const complete = this.sourceDone && this.registryDone
      if (complete) {
        this.sourceCursor = ''
        this.registryCursor = ''
        this.sourceDone = false
        this.registryDone = false
      }
      this.backoff = 1000
      this.schedule(complete && this.hints.size === 0 ? 60000 : 1000)
    } catch (err) {
      this.report(err)
      this.backoff = Math.min(this.backoff * 2, 300000)
      const retryAfter = err instanceof PublicFileAccessError ? (err.retryAfterMs ?? 0) : 0
      this.schedule(Math.min(Math.max(this.backoff, retryAfter), 1800000))
    } finally {
      backgroundWorkers--
    }
  }

  async close (): Promise<void> {
    this.closed = true
    clearTimeout(this.timer)
    await this.running
    await Promise.allSettled([...this.locks.values()])
  }
}
