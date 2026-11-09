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

import type { WorkspaceUuid } from '@hcengineering/core'

import { uploadBlob } from '../API/Datalake'
import { expect, test } from '../fixtures'
import { PlatformSetting, PlatformURI } from '../utils'

// These exercise external tools baked into preview-base (ffmpeg, libreoffice+poppler) - a
// base-image bump that breaks one shows up here, not as a blank UI thumbnail.
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

/** The workspace claim of the session token the app itself wrote as a cookie. */
function workspaceOf (jwt: string): WorkspaceUuid {
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as { workspace?: string }
  if (payload.workspace === undefined) throw new Error('the session token names no workspace')
  return payload.workspace as WorkspaceUuid
}

test.describe('Preview service thumbnails', () => {
  // A cold libreoffice start alone can take ~10s.
  test.setTimeout(120000)

  for (const c of cases) {
    test(`renders a thumbnail for ${c.file} via ${c.tool}`, async ({ sharedWorkspace }) => {
      const { ws, token } = await sharedWorkspace()
      const name = randomUUID()
      const data = readFileSync(path.join(__dirname, '../files', c.file))

      await uploadBlob(ws.workspace, name, data, c.contentType)

      const response = await fetch(`${previewUrl}/image/width=${WIDTH}/${ws.workspace}/${name}`, {
        headers: { Accept: 'image/png', Authorization: `Bearer ${token}` }
      })
      const body = Buffer.from(await response.arrayBuffer())

      expect(response.status, body.toString('utf8').slice(0, 300)).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(pngWidth(body)).toBe(WIDTH)
    })
  }

  test('refuses a thumbnail request without a token', async ({ sharedWorkspace }) => {
    const { ws } = await sharedWorkspace()

    const response = await fetch(`${previewUrl}/image/width=${WIDTH}/${ws.workspace}/${randomUUID()}`)

    expect(response.status).toBe(401)
  })
})

// A thumbnail in a feed is an <img>: it carries no Authorization header, and a guest of a public link
// has no account cookie at all. The whole chain - the app writing the token cookie for the preview
// path, the browser sending it for an <img>, preview accepting it - is exercised only here: the API
// cases above set the header, the unit tests set the cookie by hand.
test.describe('Preview service thumbnails in a browser', () => {
  test.use({ storageState: PlatformSetting })
  test.setTimeout(120000)

  test('serves a thumbnail to a request that carries only the cookie', async ({ page, context }) => {
    await page.goto(`${PlatformURI}/workbench/sanity-ws/drive`)
    await page.waitForFunction(() => document.cookie.includes('presentation-metadata-Token'))

    const cookie = (await context.cookies()).find((it) => it.name === 'presentation-metadata-Token')
    expect(cookie, 'the app must write the session token as a cookie').toBeDefined()
    const workspace = workspaceOf(decodeURIComponent(cookie?.value ?? ''))

    const name = randomUUID()
    await uploadBlob(
      workspace,
      name,
      readFileSync(path.join(__dirname, '../files/small-square-32x32.png')),
      'image/png'
    )

    const answer = await page.evaluate(
      async (url) => {
        const response = await fetch(url, { credentials: 'include' })
        return { status: response.status, type: response.headers.get('content-type') }
      },
      `${previewUrl}/image/width=${WIDTH}/${workspace}/${name}`
    )

    expect(answer.status).toBe(200)
    expect(answer.type).toBe('image/png')
  })
})
