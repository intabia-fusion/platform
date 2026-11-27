/** @jest-environment jsdom */
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

import { type Blob, type Ref } from '@hcengineering/core'
import { setMetadata } from '@hcengineering/platform'
import presentation from './plugin'
import { getFileUrl } from './file'
import { getBlobRef, getPreviewThumbnail } from './preview'
import { publicFilePath, setPublicFileCookie } from './publicFiles'

jest.mock('./utils', () => ({ decodeTokenPayload: (token: string) => JSON.parse(token) }))
jest.mock('./filetypes', () => ({ getFileMetadata: jest.fn(), matchContentType: jest.fn() }))

const datalakeUrl = 'http://localhost:8087/prefix/_datalake/'
beforeEach(() => {
  setMetadata(presentation.metadata.WorkspaceUuid, 'workspace' as any)
  setMetadata(presentation.metadata.Token, JSON.stringify({ extra: { guest: 'true', linkId: 'a' } }))
  setMetadata(presentation.metadata.DatalakeUrl, datalakeUrl)
  setMetadata(presentation.metadata.PreviewUrl, 'http://preview.invalid')
})

it('keeps cookies for two links of one workspace independent', () => {
  const name = 'public-file-token'
  setPublicFileCookie('token-a', 'workspace', 'a', datalakeUrl)
  setPublicFileCookie('token-b', 'workspace', 'b', datalakeUrl)
  const path = (link: string): string => new URL(publicFilePath('workspace', link, datalakeUrl)).pathname
  // The URL determines which scoped cookies the browser sends.
  window.history.replaceState({}, '', path('a') + 'image.png')
  expect(document.cookie).toBe(`${name}=token-a`)
  window.history.replaceState({}, '', path('b') + 'attachment.pdf')
  expect(document.cookie).toBe(`${name}=token-b`)
  window.history.replaceState({}, '', path('a') + 'image.png')
  expect(document.cookie).toBe(`${name}=token-a`)
  window.history.replaceState({}, '', path('ab') + 'image.png')
  expect(document.cookie).toBe('')
})

it('routes guest files and thumbnails through Datalake without preview srcset URLs', async () => {
  setMetadata(presentation.metadata.PreviewUrl, 'http://preview.invalid')
  const url = getFileUrl('image /1.png', 'My picture.png')
  expect(url).toBe('http://localhost:8087/prefix/_datalake/blob/public/workspace/a/image%20%2F1.png/My%20picture.png')
  const ref = await getBlobRef('image' as Ref<Blob>, undefined, 100, 100)
  expect(ref.src).toBe(datalakeUrl + 'blob/public/workspace/a/image')
  expect(ref.srcset).toBe('')
  expect(getPreviewThumbnail('image', 100, 100)).toBe(ref.src)
  expect(getFileUrl('https://external.invalid/image.png')).toBe('https://external.invalid/image.png')
})

it('preserves member storage URLs and preview srcset', async () => {
  setMetadata(presentation.metadata.Token, JSON.stringify({ extra: {} }))
  const getUrl = jest.fn(() => '/ordinary/file')
  setMetadata(presentation.metadata.FileStorage, { getFileUrl: getUrl } as any)
  expect(getFileUrl('file', 'name')).toBe('/ordinary/file')
  expect(getUrl).toHaveBeenCalledWith('workspace', 'file', 'name')
  expect((await getBlobRef('image' as Ref<Blob>, undefined, 100, 100)).srcset).toContain(
    'http://preview.invalid/image/'
  )
})

it('rejects a Datalake host to which the browser cannot send the scoped cookie', () => {
  expect(() => {
    setPublicFileCookie('token', 'workspace', 'a', 'https://other.invalid')
  }).toThrow('frontend hostname')
})
