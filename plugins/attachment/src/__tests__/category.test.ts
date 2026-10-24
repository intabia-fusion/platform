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

import { AttachmentFormat, AttachmentKind, fileExtension, formatBadge, getAttachmentCategory } from '../category'

describe('getAttachmentCategory', () => {
  it.each([
    ['image/png', 'a.png', AttachmentKind.Media, AttachmentFormat.Image],
    ['image/gif', 'a.gif', AttachmentKind.Media, AttachmentFormat.Gif],
    ['video/quicktime', 'a.mov', AttachmentKind.Media, AttachmentFormat.Video],
    ['audio/ogg', 'a.ogg', AttachmentKind.Audio, AttachmentFormat.Music],
    ['application/link-preview', 'uuid', AttachmentKind.Link, AttachmentFormat.LinkPreview],
    ['application/pdf', 'a.pdf', AttachmentKind.File, AttachmentFormat.Pdf],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'a.docx',
      AttachmentKind.File,
      AttachmentFormat.Document
    ],
    ['text/csv', 'a.csv', AttachmentKind.File, AttachmentFormat.Spreadsheet],
    ['application/x-zip-compressed', 'a.zip', AttachmentKind.File, AttachmentFormat.Archive],
    ['text/x-log', 'a.log', AttachmentKind.File, AttachmentFormat.Text],
    ['application/vnd.android.package-archive', 'a.apk', AttachmentKind.File, AttachmentFormat.Application],
    ['application/x-pkcs12', 'a.p12', AttachmentKind.File, AttachmentFormat.Other]
  ])('%s %s is %s/%s', (type, name, kind, format) => {
    expect(getAttachmentCategory(type, name)).toEqual({ kind, format })
  })

  it('ignores mime parameters and case', () => {
    expect(getAttachmentCategory('Text/Plain; charset=utf-8', 'a')).toEqual({
      kind: AttachmentKind.File,
      format: AttachmentFormat.Text
    })
  })

  it('falls back to the extension for an untyped upload', () => {
    expect(getAttachmentCategory('', 'Photo.JPG').format).toBe(AttachmentFormat.Image)
    expect(getAttachmentCategory(undefined, 'report.xlsx').format).toBe(AttachmentFormat.Spreadsheet)
    expect(getAttachmentCategory('application/octet-stream', 'build.apk').format).toBe(AttachmentFormat.Application)
    expect(getAttachmentCategory('', 'noext').format).toBe(AttachmentFormat.Other)
  })

  it('trusts the extension over the type', () => {
    expect(getAttachmentCategory('application/octet-stream', 'deck.ppsx').format).toBe(AttachmentFormat.Presentation)
    expect(getAttachmentCategory('text/plain', 'table.csv').format).toBe(AttachmentFormat.Spreadsheet)
  })

  it('tells sound from video in a shared container by the type', () => {
    expect(getAttachmentCategory('audio/webm', 'meeting.webm').format).toBe(AttachmentFormat.Music)
    expect(getAttachmentCategory('audio/mp4', 'talk.mp4').kind).toBe(AttachmentKind.Audio)
    expect(getAttachmentCategory('video/ogg', 'clip.ogg').format).toBe(AttachmentFormat.Video)
    expect(getAttachmentCategory('', 'clip.webm').format).toBe(AttachmentFormat.Video)
  })

  it('reads only the family of the type for a name without a known extension', () => {
    expect(getAttachmentCategory('application/pdf', 'scan').format).toBe(AttachmentFormat.Pdf)
    expect(getAttachmentCategory('image/gif', 'anim').format).toBe(AttachmentFormat.Gif)
    expect(getAttachmentCategory('image/heic', 'IMG_0001').format).toBe(AttachmentFormat.Image)
    expect(getAttachmentCategory('video/mp4', 'clip').format).toBe(AttachmentFormat.Video)
    expect(getAttachmentCategory('audio/mpeg', 'track').format).toBe(AttachmentFormat.Music)
    expect(getAttachmentCategory('application/zip', 'bundle').format).toBe(AttachmentFormat.Other)
  })

  it('keeps a link preview whatever its name', () => {
    expect(getAttachmentCategory('application/link-preview', 'page.html').format).toBe(AttachmentFormat.LinkPreview)
  })

  it('keeps design sources out of the media grid and knows macro office files', () => {
    expect(getAttachmentCategory('image/vnd.adobe.photoshop', 'mock.psd').kind).toBe(AttachmentKind.File)
    expect(getAttachmentCategory('', 'budget.xlsm').format).toBe(AttachmentFormat.Spreadsheet)
    expect(getAttachmentCategory('application/vnd.ms-word.document.macroEnabled.12', 'a.docm').format).toBe(
      AttachmentFormat.Document
    )
  })

  it('puts a voice message under audio whatever its container', () => {
    expect(getAttachmentCategory('audio/webm;codecs=opus', 'me-1.webm', true)).toEqual({
      kind: AttachmentKind.Audio,
      format: AttachmentFormat.Voice
    })
    expect(getAttachmentCategory('video/webm', 'me-1.webm', true).kind).toBe(AttachmentKind.Audio)
  })
})

describe('fileExtension', () => {
  it.each([
    ['a.PDF', 'pdf'],
    ['archive.tar.gz', 'gz'],
    ['.gitignore', ''],
    ['name.', ''],
    ['name', '']
  ])('%s -> %s', (name, ext) => {
    expect(fileExtension(name)).toBe(ext)
  })
})

describe('formatBadge', () => {
  it('takes the extension', () => {
    expect(formatBadge(AttachmentFormat.Music, 'song.m4a').label).toBe('M4A')
  })

  it('names a voice message the same whatever device recorded it', () => {
    expect(formatBadge(AttachmentFormat.Voice, 'me.webm').label).toBe('VOICE')
    expect(formatBadge(AttachmentFormat.Voice, 'me.m4a').label).toBe('VOICE')
  })
})
