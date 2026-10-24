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

import { AttachmentFormat } from '@hcengineering/attachment'
import type { Blob, Ref } from '@hcengineering/core'
import { getBlobRef } from '@hcengineering/presentation'
import type { ImageSource } from '@hcengineering/ui/kit'

import { PAGE_FORMATS } from '../../format'

export function blobImage (file: Ref<Blob>, name: string): ImageSource {
  return async (width, height) => await getBlobRef(file, name, width, height)
}

export function pageImage (format: AttachmentFormat, file: Ref<Blob>, name: string): ImageSource | undefined {
  return PAGE_FORMATS.has(format) ? blobImage(file, name) : undefined
}

export function pictureImage (format: AttachmentFormat, file: Ref<Blob>, name: string): ImageSource | undefined {
  return format === AttachmentFormat.Image || format === AttachmentFormat.Gif ? blobImage(file, name) : undefined
}
