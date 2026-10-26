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

import { downloadToFolder, validEntries } from '../../main/batchDownload'

jest.mock('electron', () => ({}))

describe('validEntries', () => {
  it('keeps web addresses, external ones too', () => {
    const files = [
      { url: 'https://front.example/files/a?file=1', name: 'a.pdf' },
      { url: 'http://lake.example/blob/ws/2', name: 'b.png' },
      { url: 'https://cdn.example/imported.zip', name: 'c.zip' }
    ]
    expect(validEntries(files)).toEqual(files)
  })

  it('drops other schemes', () => {
    expect(
      validEntries([
        { url: 'file:///etc/passwd', name: 'passwd' },
        { url: 'data:text/plain,hi', name: 'a' },
        { url: 'javascript:alert(1)', name: 'a' },
        { url: 'not a url', name: 'a' }
      ])
    ).toEqual([])
  })

  it('drops malformed input', () => {
    expect(validEntries(undefined)).toEqual([])
    expect(validEntries('https://front.example/a')).toEqual([])
    expect(
      validEntries([null, { url: 'https://front.example/a' }, { url: 'https://front.example/a', name: 1 }])
    ).toEqual([])
  })

  it('names the refused files without asking for a folder', async () => {
    const sender = { downloadURL: jest.fn() } as any
    const refused = await downloadToFolder(sender, [
      { url: 'file:///etc/passwd', name: 'a.pdf' },
      { url: 'https://front.example/b', name: 1 }
    ])
    expect(refused).toEqual(['a.pdf', ''])
    expect(sender.downloadURL).not.toHaveBeenCalled()
  })
})
