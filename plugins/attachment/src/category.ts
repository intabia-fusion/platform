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

/**
 * @public
 */
export enum AttachmentKind {
  Media = 'media',
  File = 'file',
  Audio = 'audio',
  Link = 'link'
}

/**
 * @public
 */
export enum AttachmentFormat {
  Image = 'image',
  Gif = 'gif',
  Video = 'video',
  Voice = 'voice',
  Music = 'music',
  Pdf = 'pdf',
  Document = 'document',
  Spreadsheet = 'spreadsheet',
  Presentation = 'presentation',
  Archive = 'archive',
  Text = 'text',
  Application = 'application',
  Other = 'other',
  LinkPreview = 'link-preview'
}

/**
 * @public
 */
export interface AttachmentCategory {
  kind: AttachmentKind
  format: AttachmentFormat
}

/**
 * @public
 */
export const LINK_PREVIEW_TYPE = 'application/link-preview'

/**
 * @public
 */
export const attachmentFormats: Record<AttachmentKind, AttachmentFormat[]> = {
  [AttachmentKind.Media]: [AttachmentFormat.Image, AttachmentFormat.Video, AttachmentFormat.Gif],
  [AttachmentKind.File]: [
    AttachmentFormat.Pdf,
    AttachmentFormat.Document,
    AttachmentFormat.Spreadsheet,
    AttachmentFormat.Presentation,
    AttachmentFormat.Archive,
    AttachmentFormat.Text,
    AttachmentFormat.Application,
    AttachmentFormat.Other
  ],
  [AttachmentKind.Audio]: [AttachmentFormat.Voice, AttachmentFormat.Music],
  [AttachmentKind.Link]: [AttachmentFormat.LinkPreview]
}

const kindOfFormat = new Map<AttachmentFormat, AttachmentKind>(
  Object.entries(attachmentFormats).flatMap(([kind, formats]) =>
    formats.map((format): [AttachmentFormat, AttachmentKind] => [format, kind as AttachmentKind])
  )
)

// The browser types an upload by its extension, so the extension says all the type would.
const byExtension: Record<string, AttachmentFormat> = {
  jpg: AttachmentFormat.Image,
  jpeg: AttachmentFormat.Image,
  png: AttachmentFormat.Image,
  webp: AttachmentFormat.Image,
  heic: AttachmentFormat.Image,
  heif: AttachmentFormat.Image,
  avif: AttachmentFormat.Image,
  bmp: AttachmentFormat.Image,
  svg: AttachmentFormat.Image,
  gif: AttachmentFormat.Gif,
  mp4: AttachmentFormat.Video,
  mov: AttachmentFormat.Video,
  webm: AttachmentFormat.Video,
  mkv: AttachmentFormat.Video,
  avi: AttachmentFormat.Video,
  m4v: AttachmentFormat.Video,
  mp3: AttachmentFormat.Music,
  m4a: AttachmentFormat.Music,
  wav: AttachmentFormat.Music,
  flac: AttachmentFormat.Music,
  ogg: AttachmentFormat.Music,
  opus: AttachmentFormat.Music,
  aac: AttachmentFormat.Music,
  pdf: AttachmentFormat.Pdf,
  doc: AttachmentFormat.Document,
  docx: AttachmentFormat.Document,
  docm: AttachmentFormat.Document,
  dotx: AttachmentFormat.Document,
  odt: AttachmentFormat.Document,
  rtf: AttachmentFormat.Document,
  pages: AttachmentFormat.Document,
  epub: AttachmentFormat.Document,
  xls: AttachmentFormat.Spreadsheet,
  xlsx: AttachmentFormat.Spreadsheet,
  xlsm: AttachmentFormat.Spreadsheet,
  xltx: AttachmentFormat.Spreadsheet,
  ods: AttachmentFormat.Spreadsheet,
  csv: AttachmentFormat.Spreadsheet,
  tsv: AttachmentFormat.Spreadsheet,
  numbers: AttachmentFormat.Spreadsheet,
  ppt: AttachmentFormat.Presentation,
  pptx: AttachmentFormat.Presentation,
  pptm: AttachmentFormat.Presentation,
  ppsx: AttachmentFormat.Presentation,
  odp: AttachmentFormat.Presentation,
  key: AttachmentFormat.Presentation,
  zip: AttachmentFormat.Archive,
  rar: AttachmentFormat.Archive,
  '7z': AttachmentFormat.Archive,
  gz: AttachmentFormat.Archive,
  tgz: AttachmentFormat.Archive,
  tar: AttachmentFormat.Archive,
  bz2: AttachmentFormat.Archive,
  xz: AttachmentFormat.Archive,
  txt: AttachmentFormat.Text,
  md: AttachmentFormat.Text,
  log: AttachmentFormat.Text,
  json: AttachmentFormat.Text,
  xml: AttachmentFormat.Text,
  yaml: AttachmentFormat.Text,
  yml: AttachmentFormat.Text,
  html: AttachmentFormat.Text,
  css: AttachmentFormat.Text,
  js: AttachmentFormat.Text,
  ts: AttachmentFormat.Text,
  py: AttachmentFormat.Text,
  sh: AttachmentFormat.Text,
  sql: AttachmentFormat.Text,
  apk: AttachmentFormat.Application,
  aab: AttachmentFormat.Application,
  ipa: AttachmentFormat.Application,
  exe: AttachmentFormat.Application,
  msi: AttachmentFormat.Application,
  dmg: AttachmentFormat.Application,
  deb: AttachmentFormat.Application,
  rpm: AttachmentFormat.Application,
  // No thumbnail can be made of a design source: a file to download, not a picture.
  psd: AttachmentFormat.Other
}

/**
 * @public
 */
export function fileExtension (name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

// Only for a name without a known extension, e.g. a file sent through the API.
function formatOfMime (mime: string): AttachmentFormat | undefined {
  if (mime === 'application/pdf') return AttachmentFormat.Pdf
  if (mime === 'image/gif') return AttachmentFormat.Gif
  if (mime.startsWith('image/')) return AttachmentFormat.Image
  if (mime.startsWith('video/')) return AttachmentFormat.Video
  if (mime.startsWith('audio/')) return AttachmentFormat.Music
  if (mime.startsWith('text/')) return AttachmentFormat.Text
  return undefined
}

// Own keys only: "x.constructor" must not find a method of the object.
function formatOfExtension (ext: string): AttachmentFormat | undefined {
  return Object.prototype.hasOwnProperty.call(byExtension, ext) ? byExtension[ext] : undefined
}

// These hold sound alone as well as video: there the family of the type tells which.
const mediaContainers = new Set(['webm', 'mp4', 'ogg'])

function formatOf (mime: string, name: string): AttachmentFormat {
  if (mime === LINK_PREVIEW_TYPE) return AttachmentFormat.LinkPreview
  const ext = fileExtension(name)
  if (mediaContainers.has(ext)) {
    if (mime.startsWith('audio/')) return AttachmentFormat.Music
    if (mime.startsWith('video/')) return AttachmentFormat.Video
  }
  return formatOfExtension(ext) ?? formatOfMime(mime) ?? AttachmentFormat.Other
}

export function getAttachmentCategory (type: string | undefined, name: string, voice = false): AttachmentCategory {
  const mime = (type ?? '').split(';')[0].trim().toLowerCase()

  // A recorder may save audio-only .webm, so a voice message is never left to its type.
  const format = voice ? AttachmentFormat.Voice : formatOf(mime, name)

  return { kind: kindOfFormat.get(format) ?? AttachmentKind.File, format }
}

/**
 * @public
 */
export const attachmentFacet = {
  kind: (kind: AttachmentKind): string => `attachment-kind:${kind}`,
  format: (format: AttachmentFormat): string => `attachment-format:${format}`
}

// Palette names, so the badge follows the theme.
const formatColors: Record<AttachmentFormat, string> = {
  [AttachmentFormat.Image]: 'Sky',
  [AttachmentFormat.Video]: 'Blueberry',
  [AttachmentFormat.Gif]: 'Lavander',
  [AttachmentFormat.Voice]: 'Orchid',
  [AttachmentFormat.Music]: 'Pink',
  [AttachmentFormat.Pdf]: 'Firework',
  [AttachmentFormat.Document]: 'Cerulean',
  [AttachmentFormat.Spreadsheet]: 'Houseplant',
  [AttachmentFormat.Presentation]: 'Orange',
  [AttachmentFormat.Archive]: 'Sunshine',
  [AttachmentFormat.Text]: 'Porpoise',
  [AttachmentFormat.Application]: 'Turquoise',
  [AttachmentFormat.Other]: 'Coin',
  [AttachmentFormat.LinkPreview]: 'Cloud'
}

export const formatShortLabels: Record<AttachmentFormat, string> = {
  [AttachmentFormat.Image]: 'IMG',
  [AttachmentFormat.Video]: 'VID',
  [AttachmentFormat.Gif]: 'GIF',
  [AttachmentFormat.Voice]: 'VOICE',
  [AttachmentFormat.Music]: 'AUD',
  [AttachmentFormat.Pdf]: 'PDF',
  [AttachmentFormat.Document]: 'DOC',
  [AttachmentFormat.Spreadsheet]: 'XLS',
  [AttachmentFormat.Presentation]: 'PPT',
  [AttachmentFormat.Archive]: 'ZIP',
  [AttachmentFormat.Text]: 'TXT',
  [AttachmentFormat.Application]: 'APP',
  [AttachmentFormat.Other]: 'FILE',
  [AttachmentFormat.LinkPreview]: ''
}

export function formatBadge (format: AttachmentFormat, name: string): { label: string, color: string } {
  // The container depends on the device that recorded it and tells the listener nothing.
  if (format === AttachmentFormat.Voice) return { label: formatShortLabels[format], color: formatColors[format] }
  const ext = fileExtension(name).slice(0, 4).toUpperCase()
  return { label: ext !== '' ? ext : formatShortLabels[format], color: formatColors[format] }
}
