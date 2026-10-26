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

import { isSafeToOpen } from '../../main/downloadFileTypes'

describe('isSafeToOpen', () => {
  it.each(['report.pdf', 'photo.PNG', 'notes.txt', 'data.csv', 'clip.mp4', 'sound.mp3', 'report.docx', 'sheet.xlsx'])(
    'opens %s without asking',
    (name) => {
      expect(isSafeToOpen(name)).toBe(true)
    }
  )

  it.each([
    'setup.exe',
    'installer.msi',
    'run.bat',
    'script.sh',
    'app.app',
    'shortcut.lnk',
    'macro.docm',
    'macro.xlsm',
    'macro.pptm',
    'page.html',
    'page.htm',
    'picture.svg',
    'font.woff',
    'unknown.pif'
  ])('asks before opening %s', (name) => {
    expect(isSafeToOpen(name)).toBe(false)
  })

  // The last extension is the one the OS acts on.
  it('asks for a double extension', () => {
    expect(isSafeToOpen('report.pdf.exe')).toBe(false)
    expect(isSafeToOpen('report.zip.bat')).toBe(false)
  })

  it('asks for a name without an extension', () => {
    expect(isSafeToOpen('README')).toBe(false)
    expect(isSafeToOpen('')).toBe(false)
  })

  // A leading dot makes the whole name the "extension" and dotfiles are not documents.
  it('asks for a dotfile', () => {
    expect(isSafeToOpen('.bashrc')).toBe(false)
    expect(isSafeToOpen('.pdf')).toBe(false)
  })

  it('reads the extension case-insensitively', () => {
    expect(isSafeToOpen('REPORT.PDF')).toBe(true)
    expect(isSafeToOpen('SETUP.EXE')).toBe(false)
  })

  it('handles a name with several dots and spaces', () => {
    expect(isSafeToOpen('report 2026. final.pdf')).toBe(true)
  })
})
