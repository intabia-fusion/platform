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

import type { Blob, Ref } from '@hcengineering/core'
import { concatLink } from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import { withRetry } from '@hcengineering/retry'

import { getFileUrl, getCurrentWorkspaceUuid, getFileStorage, isPublicFileAccess } from './file'
import presentation from './plugin'

const frontImagePreviewUrl = '/files/:workspace?file=:blobId&size=:size'

export interface PreviewMetadata {
  thumbnail?: {
    width: number
    height: number
    blurhash: string
  }
}

export interface VideoMeta {
  hls?: HLSMeta
}

export interface HLSMeta {
  thumbnail?: string
  source?: string
}

export async function getBlobRef (
  file: Ref<Blob>,
  name?: string,
  width?: number,
  height?: number
): Promise<{
  src: string
  srcset: string
}> {
  return {
    src: getFileUrl(file, name),
    srcset: getSrcSet(file, width, height)
  }
}

export async function getBlobSrcSet (file: Ref<Blob>, width?: number, height?: number): Promise<string> {
  return getSrcSet(file, width, height)
}

export function getSrcSet (_blob: Ref<Blob>, width?: number, height?: number): string {
  return blobToSrcSet(_blob, width, height)
}

function blobToSrcSet (blob: Ref<Blob>, width: number | undefined, height: number | undefined): string {
  if (isPublicFileAccess() || blob.includes('://')) {
    return ''
  }

  const workspace = encodeURIComponent(getCurrentWorkspaceUuid())
  const name = encodeURIComponent(blob)

  const previewUrl = getMetadata(presentation.metadata.PreviewUrl) ?? ''
  if (previewUrl !== '') {
    if (width !== undefined) {
      return (
        getImagePreviewUrl(workspace, name, width, height ?? width, 1) +
        ' 1x , ' +
        getImagePreviewUrl(workspace, name, width, height ?? width, 2) +
        ' 2x, ' +
        getImagePreviewUrl(workspace, name, width, height ?? width, 3) +
        ' 3x'
      )
    } else {
      return ''
    }
  }

  const frontUrl = getMetadata(presentation.metadata.FrontUrl) ?? window.location.origin
  const url = concatLink(frontUrl, frontImagePreviewUrl).replaceAll(':workspace', workspace).replaceAll(':blobId', name)

  let result = ''
  if (width !== undefined) {
    result +=
      formatImageSize(url, width, height ?? width, 1) +
      ' 1x , ' +
      formatImageSize(url, width, height ?? width, 2) +
      ' 2x, ' +
      formatImageSize(url, width, height ?? width, 3) +
      ' 3x'
  }

  return result
}

export function getPreviewThumbnail (file: string, width: number, height: number, dpr?: number): string {
  if (isPublicFileAccess()) return getFileUrl(file)
  return getImagePreviewUrl(
    encodeURIComponent(getCurrentWorkspaceUuid()),
    encodeURIComponent(file),
    width,
    height,
    dpr ?? window.devicePixelRatio
  )
}

export async function getPreviewMetadata (workspace: string, name: string): Promise<PreviewMetadata> {
  const previewUrl = getMetadata(presentation.metadata.PreviewUrl) ?? ''

  if (previewUrl !== '') {
    const token = getMetadata(presentation.metadata.Token) ?? ''
    const url = concatLink(previewUrl, `/metadata/${workspace}/${name}`)

    try {
      const response = await withRetry(async () => {
        return await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      })
      if (response.ok) {
        const json = await response.json()
        return json as PreviewMetadata
      }
    } catch (err) {
      console.warn('Failed to fetch preview metadata', err)
    }
  }
  return {}
}

function getImagePreviewUrl (workspace: string, name: string, width: number, height: number, dpr: number): string {
  const previewUrl = getMetadata(presentation.metadata.PreviewUrl) ?? ''
  const url = `/image/fit=cover,width=${width},height=${height},dpr=${dpr}/${workspace}/${name}`
  return concatLink(previewUrl, url)
}

function formatImageSize (url: string, width: number, height: number, dpr: number): string {
  return url
    .replaceAll(':size', `${width * dpr}`)
    .replaceAll(':width', `${width}`)
    .replaceAll(':height', `${height}`)
    .replaceAll(':dpr', `${dpr}`)
}

/***
 * @deprecated, please use Blob direct operations.
 */
export function getFileSrcSet (_blob: Ref<Blob>, width?: number, height?: number): string {
  return blobToSrcSet(_blob, width, height)
}

/**
 * @public
 */
export async function getVideoMeta (file: string, filename?: string): Promise<VideoMeta | undefined> {
  try {
    const token = getMetadata(presentation.metadata.Token) ?? ''
    const workspace = getCurrentWorkspaceUuid()

    const storage = getFileStorage()
    const meta = await storage.getFileMeta(token, workspace, file)
    return meta as VideoMeta
  } catch {
    return {}
  }
}
