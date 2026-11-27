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

import { concatLink, type WorkspaceUuid } from '@hcengineering/core'

/** HTTP failures are preserved so the synchronizer can distinguish conflicts from transient errors. */
export class PublicFileAccessError extends Error {
  constructor (
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(`Public file access request failed: HTTP ${status}`)
    this.name = 'PublicFileAccessError'
  }
}

export interface PublicFileAccessState {
  revision: number
  revoked: boolean
  blobs: string[]
}

/** Internal publisher client. The caller supplies a dedicated public-file-access service token. */
export class PublicFileAccessClient {
  constructor (
    private readonly endpoint: string,
    private readonly token: string,
    private readonly timeoutMs = 10000
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid request timeout')
  }

  async state (workspace: WorkspaceUuid, linkId: string): Promise<PublicFileAccessState> {
    const state = await this.read<PublicFileAccessState>(workspace, `/${segment(linkId)}`)
    if (
      !Number.isSafeInteger(state.revision) ||
      state.revision < 0 ||
      typeof state.revoked !== 'boolean' ||
      !Array.isArray(state.blobs) ||
      !state.blobs.every((blob) => typeof blob === 'string')
    ) {
      throw new Error('Invalid registry state')
    }
    return state
  }

  async activeLinks (workspace: WorkspaceUuid, after: string): Promise<string[]> {
    const links = await this.read<string[]>(workspace, `?after=${encodeURIComponent(after)}`)
    if (
      !Array.isArray(links) ||
      links.length > 10 ||
      !links.every((link) => typeof link === 'string' && link > after)
    ) {
      throw new Error('Invalid registry cursor')
    }
    return links
  }

  private async read<T>(workspace: WorkspaceUuid, tail: string): Promise<T> {
    const response = await fetch(concatLink(this.endpoint, `/internal/public-links/${segment(workspace)}${tail}`), {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error'
    })
    try {
      if (response.status !== 200) throw accessError(response)
      return (await response.json()) as T
    } finally {
      if (!response.bodyUsed && response.body?.locked === false) await response.body.cancel()
    }
  }

  async replace (workspace: WorkspaceUuid, linkId: string, revision: number, blobs: string[]): Promise<void> {
    await this.request('PUT', workspace, linkId, { revision, blobs })
  }

  async revoke (workspace: WorkspaceUuid, linkId: string, revision: number): Promise<void> {
    await this.request('DELETE', workspace, linkId, { revision })
  }

  private async request (
    method: 'PUT' | 'DELETE',
    workspace: WorkspaceUuid,
    linkId: string,
    body: { revision: number, blobs?: string[] }
  ): Promise<void> {
    if (!Number.isSafeInteger(body.revision) || body.revision < 1) throw new Error('Invalid revision')
    const path = `/internal/public-links/${segment(workspace)}/${segment(linkId)}`
    const response = await fetch(concatLink(this.endpoint, path), {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error'
    })
    try {
      if (response.status !== 204) {
        throw accessError(response)
      }
    } finally {
      if (!response.bodyUsed && response.body?.locked === false) await response.body.cancel()
    }
  }
}

function segment (value: string): string {
  if (typeof value !== 'string' || value === '' || value === '.' || value === '..') {
    throw new Error('Invalid path segment')
  }
  return encodeURIComponent(value)
}

function accessError (response: Response): PublicFileAccessError {
  const header = response.headers.get('retry-after')
  const seconds = header === null ? NaN : Number(header)
  const until = header === null ? NaN : Date.parse(header) - Date.now()
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : until
  return new PublicFileAccessError(response.status, Number.isFinite(delay) ? Math.max(0, delay) : undefined)
}
