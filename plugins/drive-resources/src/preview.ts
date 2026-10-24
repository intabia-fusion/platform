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

import { AttachmentFormat, AttachmentKind, formatBadge, getAttachmentCategory } from '@hcengineering/attachment'
import { pageImage, pictureImage } from '@hcengineering/attachment-resources'
import type { Blob, Ref } from '@hcengineering/core'
import type { FileVersion } from '@hcengineering/drive'
import { getBlobRef } from '@hcengineering/presentation'
import type { FileBadgeData, ImageSource } from '@hcengineering/ui/kit'

export interface FilePreview {
  badge: FileBadgeData
  audio: boolean
  video: boolean
  /** The master playlist of a transcoded video: the length of one uploaded without it is read from there. */
  playlist?: Ref<Blob>
  duration?: number
  picture?: ImageSource
  blurhash?: string
  page?: ImageSource
}

export function filePreview (name: string, version: FileVersion | undefined): FilePreview {
  const { kind, format } = getAttachmentCategory(version?.type, name)
  const badge = formatBadge(format, name)
  const audio = kind === AttachmentKind.Audio
  const video = format === AttachmentFormat.Video
  if (version == null) return { badge, audio, video }
  const page = pageImage(format, version.file, name)
  // A video shows the frame saved on transcoding, else the preview service image; without either, a badge.
  const poster =
    hlsOf(version, 'thumbnail') ?? (page == null && version.metadata?.thumbnail != null ? version.file : undefined)
  const picture = pictureImage(format, version.file, name) ?? (poster != null ? frame(poster) : undefined)
  const playlist = video ? hlsOf(version, 'source') : undefined
  const blurhash = picture != null ? (version.metadata?.thumbnail?.blurhash as string | undefined) : undefined
  const duration = video ? lengthOf(version) : undefined
  return { badge, audio, video, playlist, duration, picture, blurhash, page }
}

function lengthOf (version: FileVersion): number | undefined {
  const value = version.metadata?.durationSec
  return typeof value === 'number' && value > 0 ? value : undefined
}

// The media service once wrote the stream next to `metadata`, not into it: older versions keep it there.
function hlsOf (version: FileVersion, key: 'source' | 'thumbnail'): Ref<Blob> | undefined {
  const fields = version as FileVersion & { hls?: Partial<Record<'source' | 'thumbnail', Ref<Blob>>> }
  return fields.hls?.[key] ?? version.metadata?.hls?.[key]
}

function frame (poster: Ref<Blob>): ImageSource {
  return async (width, height) => await getBlobRef(poster, undefined, width, height)
}
