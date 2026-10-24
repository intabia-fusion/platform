//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { formatBadge, getAttachmentCategory } from '@hcengineering/attachment'
import { type Blob as PlatformBlob, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import {
  type FileStorage,
  type FileStorageUploadProgress,
  createFileStorage as createStorageClient
} from '@hcengineering/storage-client'
import { textContentTypes } from '@hcengineering/view'
import { v4 as uuid } from 'uuid'

import plugin from './plugin'
import { getFileMetadata, matchContentType } from './filetypes'

export function getCurrentWorkspaceUuid (): WorkspaceUuid {
  const workspaceUuid = getMetadata(plugin.metadata.WorkspaceUuid) ?? ''
  return workspaceUuid as WorkspaceUuid
}

function getToken (): string {
  return getMetadata(plugin.metadata.Token) ?? ''
}

/** @public */
export function generateFileId (): string {
  return uuid()
}

/** @public */
export function createFileStorage (uploadUrl: string, datalakeUrl?: string, hulylakeUrl?: string): FileStorage {
  return createStorageClient({ uploadUrl, datalakeUrl, hulylakeUrl })
}

/** @public */
export function getFileStorage (): FileStorage {
  const storage = getMetadata(plugin.metadata.FileStorage)
  if (storage === undefined) {
    throw new Error('Missing file storage metadata')
  }

  return storage
}

export function fileBadge (name: string, contentType: string): { label: string, color: string } {
  return formatBadge(getAttachmentCategory(contentType, name).format, name)
}

export function isTextFile (contentType: string): boolean {
  return textContentTypes.some((it) => matchContentType(it, contentType))
}

/** @public */
export function getFileUrl (file: string, filename?: string): string {
  if (file.includes('://')) {
    return file
  }

  const workspace = getCurrentWorkspaceUuid()

  const storage = getFileStorage()
  return storage.getFileUrl(workspace, file, filename)
}

/** @public */
// Content types the browser commonly fails to detect, resolved by file extension instead.
const extensionContentTypes: Record<string, string> = {
  log: 'text/plain',
  txt: 'text/plain',
  text: 'text/plain',
  ini: 'text/plain',
  conf: 'text/plain',
  cfg: 'text/plain',
  env: 'text/plain',
  properties: 'text/plain',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  json: 'application/json',
  md: 'text/markdown',
  csv: 'text/csv',
  xml: 'text/xml'
}

/**
 * Resolves a usable content type for a file, falling back to its extension when the
 * browser-provided type is missing or the generic application/octet-stream.
 * @public
 */
export function getContentType (name: string, type: string): string {
  if (type !== '' && type !== 'application/octet-stream') {
    return type
  }
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext !== undefined && extensionContentTypes[ext] !== undefined) {
    return extensionContentTypes[ext]
  }
  return type
}

export async function uploadFile (
  file: File,
  uuid?: Ref<PlatformBlob>,
  signal?: AbortSignal,
  onProgress?: (progress: FileStorageUploadProgress) => void
): Promise<{ uuid: Ref<PlatformBlob>, metadata: Record<string, any> }> {
  uuid ??= generateFileId() as Ref<PlatformBlob>

  const token = getToken()
  const workspace = getCurrentWorkspaceUuid()

  const contentType = getContentType(file.name, file.type)
  if (contentType !== file.type) {
    file = new File([file], file.name, { type: contentType, lastModified: file.lastModified })
  }

  const storage = getFileStorage()
  await storage.uploadFile(token, workspace, uuid, file, { signal, onProgress })

  const metadata = (await getFileMetadata(file, uuid)) ?? {}

  return { uuid, metadata }
}

export function downloadFile (file: string, name: string): void {
  const link = document.createElement('a')
  link.href = getFileUrl(file, name)
  link.download = name
  link.click()
}

export interface DownloadEntry {
  url: string
  name: string
}

// The browser drops downloads started in one go; a pause between them keeps every file.
const DOWNLOAD_GAP_MS = 300

let downloadFilesHandler: ((files: DownloadEntry[]) => Promise<void>) | undefined

export function setDownloadFilesHandler (handler: ((files: DownloadEntry[]) => Promise<void>) | undefined): void {
  downloadFilesHandler = handler
}

export async function downloadFiles (files: Array<{ file: string, name: string }>): Promise<void> {
  if (downloadFilesHandler != null) {
    await downloadFilesHandler(
      files.map((it) => ({ url: new URL(getFileUrl(it.file, it.name), window.location.href).href, name: it.name }))
    )
    return
  }
  for (const [index, it] of files.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_GAP_MS))
    downloadFile(it.file, it.name)
  }
}

/** @public */
export async function deleteFile (file: string): Promise<void> {
  const token = getToken()
  const workspace = getCurrentWorkspaceUuid()

  const storage = getFileStorage()
  await storage.deleteFile(token, workspace, file)
}

export async function getJsonOrEmpty<T = any> (file: string, name: string): Promise<T | undefined> {
  try {
    const resp = await fetch(getFileUrl(file, name))
    // An error answer is JSON too: taken for the file it would hide the failure.
    if (!resp.ok) return undefined
    return (await resp.json()) as T
  } catch {
    return undefined
  }
}
