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

import attachment, { AttachmentFormat } from '@hcengineering/attachment'
import type { IntlString } from '@hcengineering/platform'

export const PAGE_FORMATS = new Set<AttachmentFormat>([
  AttachmentFormat.Pdf,
  AttachmentFormat.Document,
  AttachmentFormat.Spreadsheet,
  AttachmentFormat.Presentation,
  AttachmentFormat.Text
])

export const formatLabels: Record<AttachmentFormat, IntlString> = {
  [AttachmentFormat.Image]: attachment.string.FormatImage,
  [AttachmentFormat.Video]: attachment.string.FormatVideo,
  [AttachmentFormat.Gif]: attachment.string.FormatGif,
  [AttachmentFormat.Voice]: attachment.string.FormatVoice,
  [AttachmentFormat.Music]: attachment.string.FormatMusic,
  [AttachmentFormat.Pdf]: attachment.string.FormatPdf,
  [AttachmentFormat.Document]: attachment.string.FormatDocument,
  [AttachmentFormat.Spreadsheet]: attachment.string.FormatSpreadsheet,
  [AttachmentFormat.Presentation]: attachment.string.FormatPresentation,
  [AttachmentFormat.Archive]: attachment.string.FormatArchive,
  [AttachmentFormat.Text]: attachment.string.FormatText,
  [AttachmentFormat.Application]: attachment.string.FormatApplication,
  [AttachmentFormat.Other]: attachment.string.FormatOther,
  [AttachmentFormat.LinkPreview]: attachment.string.FormatLinkPreview
}
