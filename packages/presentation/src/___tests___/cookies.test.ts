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
import { presentationCookiePaths } from '../cookies'

describe('presentationCookiePaths', () => {
  const origin = 'http://localhost:8080'

  it('covers the storage path and the preview path', () => {
    expect(presentationCookiePaths('/files/ws', 'http://localhost:4040', origin)).toEqual(['/files/ws', '/'])
  })

  // a thumbnail is an <img>: no header to put the token in, so the preview path must be there
  it('adds the path of the preview service, not its host', () => {
    expect(presentationCookiePaths(undefined, 'http://localhost:8087/_preview', origin)).toEqual(['/_preview'])
  })

  it('resolves a relative preview url against the current origin', () => {
    expect(presentationCookiePaths(undefined, '/_preview', origin)).toEqual(['/_preview'])
  })

  it('normalizes a storage path without a leading slash', () => {
    expect(presentationCookiePaths('files/ws', undefined, origin)).toEqual(['/files/ws'])
  })

  it('writes only the storage cookie when preview is not configured', () => {
    expect(presentationCookiePaths('/files/ws', '', origin)).toEqual(['/files/ws'])
    expect(presentationCookiePaths('/files/ws', undefined, origin)).toEqual(['/files/ws'])
  })

  it('ignores a malformed preview url instead of dropping the session', () => {
    expect(presentationCookiePaths('/files/ws', 'http://[bad', origin)).toEqual(['/files/ws'])
  })
})
