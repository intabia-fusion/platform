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

import aiBot from '@hcengineering/ai-bot'
import attachment, { type Attachment } from '@hcengineering/attachment'
import type { Hierarchy } from '@hcengineering/core'

import { AttachmentSearchFacets } from '../facets'

const hierarchy = { isDerived: (_class: string, base: string) => _class === base } as any as Hierarchy

function file (patch: Partial<Attachment>): Attachment {
  return { _id: 'a', _class: attachment.class.Attachment, name: 'a', type: '', ...patch } as any as Attachment
}

describe('AttachmentSearchFacets', () => {
  it('files a document under its kind and format', () => {
    expect(AttachmentSearchFacets(file({ name: 'r.pdf', type: 'application/pdf' }), hierarchy)).toEqual({
      values: ['attachment-kind:file', 'attachment-format:pdf']
    })
  })

  it('tells a voice message from an uploaded track by its class', () => {
    const voice = file({ _class: aiBot.class.AudioTranscribe as any, name: 'me.webm', type: 'audio/webm' })
    expect(AttachmentSearchFacets(voice, hierarchy).values).toEqual([
      'attachment-kind:audio',
      'attachment-format:voice'
    ])
    expect(AttachmentSearchFacets(file({ name: 's.mp3', type: 'audio/mpeg' }), hierarchy).values).toEqual([
      'attachment-kind:audio',
      'attachment-format:music'
    ])
  })

  it('makes a link preview searchable by its title and description', () => {
    const preview = file({
      name: 'uuid',
      type: 'application/link-preview',
      metadata: { title: 'Pull Request #519', description: 'Shared hierarchy', image: 'https://x/y.png' }
    })
    expect(AttachmentSearchFacets(preview, hierarchy)).toEqual({
      values: ['attachment-kind:link', 'attachment-format:link-preview'],
      extra: 'Pull Request #519\nShared hierarchy'
    })
  })
})
