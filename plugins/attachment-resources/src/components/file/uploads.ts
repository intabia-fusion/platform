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

import type { Attachment } from '@hcengineering/attachment'
import {
  RateLimiter,
  generateId,
  type Blob as PlatformBlob,
  type BlobMetadata,
  type Class,
  type Doc,
  type PersonId,
  type Ref,
  type Space
} from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { deleteFile, getContentType, uploadFile } from '@hcengineering/presentation'
import ui from '@hcengineering/ui'
import uploader from '@hcengineering/uploader'

import attachment from '../../plugin'

// More at once only queues the same bandwidth and holds every bar back.
const MAX_PARALLEL_UPLOADS = 3

export function draftAttachment (
  target: { space: Ref<Space>, objectId: Ref<Doc>, _class: Ref<Class<Doc>> },
  name: string,
  blob: File | Blob,
  file: Ref<PlatformBlob> = '' as Ref<PlatformBlob>,
  metadata?: BlobMetadata
): Attachment {
  return {
    _id: generateId(),
    _class: attachment.class.Attachment,
    collection: 'attachments',
    modifiedOn: 0,
    modifiedBy: '' as PersonId,
    space: target.space,
    attachedTo: target.objectId,
    attachedToClass: target._class,
    name,
    file,
    type: blob instanceof File ? getContentType(blob.name, blob.type) : blob.type,
    size: blob.size,
    lastModified: blob instanceof File ? blob.lastModified : Date.now(),
    metadata
  }
}

export interface Upload {
  doc: Attachment
  file: File
  progress: number
  failed?: IntlString
  retryable: boolean
  stored: boolean
}

interface Running extends Upload {
  controller: AbortController
}

export interface UploadTile {
  doc: Attachment
  upload?: Upload
  draft: boolean
}

/** The files of a list, then those still going up; a stored one waiting for its turn shows no bar. */
export function uploadTiles (
  attachments: Iterable<Attachment>,
  uploads: UploadQueue | undefined,
  isDraft: (doc: Attachment) => boolean
): UploadTile[] {
  return [
    ...Array.from(attachments, (doc) => ({ doc, upload: undefined, draft: isDraft(doc) })),
    ...(uploads?.list() ?? []).map((it) => ({ doc: it.doc, upload: it.stored ? undefined : it, draft: true }))
  ]
}

export class UploadQueue {
  private readonly items = new Map<Ref<Attachment>, Running>()
  private readonly running = new Map<Ref<Attachment>, Promise<void>>()
  private readonly pictures = new Map<Ref<Attachment>, string>()
  private readonly limiter = new RateLimiter(MAX_PARALLEL_UPLOADS)

  constructor (
    private readonly changed: () => void,
    private readonly stored: (docs: Attachment[]) => void
  ) {}

  get size (): number {
    return this.items.size
  }

  get failed (): boolean {
    return Array.from(this.items.values()).some((it) => it.failed != null)
  }

  list (): Upload[] {
    return Array.from(this.items.values())
  }

  has (_id: Ref<Attachment>): boolean {
    return this.items.has(_id)
  }

  picture (_id: Ref<Attachment>): string | undefined {
    return this.pictures.get(_id)
  }

  add (doc: Attachment, file: File): void {
    this.items.set(doc._id, {
      doc,
      file,
      progress: 0,
      retryable: false,
      stored: false,
      controller: new AbortController()
    })
    if (file.type.startsWith('image/')) this.pictures.set(doc._id, URL.createObjectURL(file))
    this.start(doc._id)
    this.changed()
  }

  retry (_id: Ref<Attachment>): void {
    const item = this.items.get(_id)
    // Only a failed one: a second run of a going upload would leave its first copy behind.
    if (item?.failed == null) return
    item.failed = undefined
    item.retryable = false
    item.progress = 0
    item.controller = new AbortController()
    this.start(_id)
    this.changed()
  }

  remove (_id: Ref<Attachment>): void {
    const item = this.items.get(_id)
    if (item != null) {
      item.controller.abort()
      if (item.stored) void deleteFile(item.doc.file)
      this.items.delete(_id)
      this.promote()
    }
    this.release(_id)
    this.changed()
  }

  async settled (): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all(this.running.values())
    }
  }

  flush (): Attachment[] {
    const docs: Attachment[] = []
    for (const [_id, item] of this.items) {
      if (item.stored) {
        docs.push(item.doc)
        this.items.delete(_id)
      }
    }
    this.clear()
    return docs
  }

  clear (): void {
    for (const [_id, item] of this.items) {
      item.controller.abort()
      if (item.stored) void deleteFile(item.doc.file)
      this.release(_id)
    }
    this.items.clear()
    this.changed()
  }

  release (_id: Ref<Attachment>): void {
    const url = this.pictures.get(_id)
    if (url == null) return
    URL.revokeObjectURL(url)
    this.pictures.delete(_id)
  }

  releaseAll (): void {
    for (const _id of Array.from(this.pictures.keys())) this.release(_id)
  }

  private start (_id: Ref<Attachment>): void {
    const run = this.limiter.exec(async () => {
      await this.transfer(_id)
    })
    this.running.set(_id, run)
    void run.finally(() => {
      if (this.running.get(_id) === run) this.running.delete(_id)
    })
  }

  private async transfer (_id: Ref<Attachment>): Promise<void> {
    const item = this.items.get(_id)
    if (item == null) return
    const { signal } = item.controller
    if (signal.aborted) return
    let uploaded: Awaited<ReturnType<typeof uploadFile>>
    try {
      uploaded = await uploadFile(item.file, undefined, signal, (p) => {
        if (p.total > 0 && !signal.aborted) {
          item.progress = p.loaded / p.total
          this.changed()
        }
      })
    } catch (err: any) {
      if (signal.aborted) return
      console.warn('failed to upload attachment', err)
      const limit = err?.isStorageLimit === true
      item.failed = limit ? uploader.string.StorageLimitReached : ui.string.UploadFailed
      item.retryable = !limit
      this.changed()
      return
    }
    if (signal.aborted) {
      void deleteFile(uploaded.uuid)
      return
    }
    item.doc = { ...item.doc, file: uploaded.uuid, metadata: uploaded.metadata }
    item.progress = 1
    item.stored = true
    this.promote()
    this.changed()
  }

  private promote (): void {
    const docs: Attachment[] = []
    for (const [_id, item] of this.items) {
      if (!item.stored) break
      this.items.delete(_id)
      docs.push(item.doc)
    }
    if (docs.length > 0) this.stored(docs)
  }
}
