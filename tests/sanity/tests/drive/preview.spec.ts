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
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'

import { uploadBlob } from '../API/Datalake'
import { expect, test } from '../fixtures'
import { PlatformURI } from '../utils'

// These go through the external tools baked into preview-base, so a base image bump that breaks
// one of them shows up here instead of as a blank thumbnail in the UI:
//   video -> ffmpeg frame grab
//   docx  -> libreoffice to pdf -> poppler pdftoppm to png
const cases = [
  { file: 'fake-video.mp4', contentType: 'video/mp4', tool: 'ffmpeg' },
  {
    file: 'fake-doc.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    tool: 'libreoffice + poppler'
  }
]

const WIDTH = 320

// Overridable to point at a side-by-side preview pod, e.g. when trying a new preview-base without
// recreating the stand other tests are running against.
const previewUrl = process.env.PREVIEW_URL ?? `${PlatformURI}/_preview`

/** Width from the PNG IHDR chunk - proves a real resized image came back, not an error body. */
function pngWidth (body: Buffer): number {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(body.subarray(0, 8).equals(signature), 'response must be a PNG').toBe(true)
  return body.readUInt32BE(16)
}

test.describe('Preview service thumbnails', () => {
  // A cold libreoffice start alone can take ~10s.
  test.setTimeout(120000)

  for (const c of cases) {
    test(`renders a thumbnail for ${c.file} via ${c.tool}`, async ({ sharedWorkspace }) => {
      const { ws } = await sharedWorkspace()
      const name = randomUUID()
      const data = readFileSync(path.join(__dirname, '../files', c.file))

      await uploadBlob(ws.workspace, name, data, c.contentType)

      const response = await fetch(`${previewUrl}/image/width=${WIDTH}/${ws.workspace}/${name}`, {
        headers: { Accept: 'image/png' }
      })
      const body = Buffer.from(await response.arrayBuffer())

      expect(response.status, body.toString('utf8').slice(0, 300)).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(pngWidth(body)).toBe(WIDTH)
    })
  }
})
