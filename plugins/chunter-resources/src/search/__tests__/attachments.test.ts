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

import type { Class, Doc, PersonId, Ref, SearchResultDoc } from '@hcengineering/core'

const descendants: Record<string, string[]> = {
  'attachment:class:Attachment': ['attachment:class:Attachment', 'ai-bot:class:AudioTranscribe'],
  'chunter:class:ChatMessage': ['chunter:class:ChatMessage', 'chunter:class:ThreadMessage']
}
const findAll = jest.fn()
jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({
    findAll,
    getHierarchy: () => ({
      getDescendants: (c: string) => descendants[c] ?? [c],
      isMixin: () => false,
      hasClass: () => true,
      isDerived: (c: string, base: string) => c === base
    })
  })
}))

jest.mock('../classes', () => ({
  expandClasses: (classes: Array<Ref<Class<Doc>>>) => classes
}))

jest.mock('@hcengineering/contact-resources', () => ({
  getPersonsByPersonIds: async () => new Map()
}))

jest.mock('../hydrate', () => ({
  hydratePlaces: async () => () => ({ channel: 'general' })
}))

/* eslint-disable import/first */
import {
  attachmentSearchRequest,
  BrowserTab,
  hydrateAttachments,
  hydrateLinks,
  linkSearchRequest,
  placeFilters
} from '../attachments'

const ALICE = 'social:alice' as PersonId

function doc (
  id: string,
  patch: Partial<SearchResultDoc['doc']>,
  extra: Partial<SearchResultDoc> = {}
): SearchResultDoc {
  return {
    id: id as Ref<Doc>,
    doc: { _id: id as Ref<Doc>, _class: 'attachment:class:Attachment' as Ref<Class<Doc>>, createdOn: 1, ...patch },
    ...extra
  }
}

describe('placeFilters', () => {
  it('turns authors, dates and places into index filters', () => {
    expect(
      placeFilters({
        authors: [{ person: 'p' as any, socialIds: [ALICE] }],
        after: 10,
        before: 20,
        attachedTo: [{ _id: 'chan' as Ref<Doc>, _class: 'chunter:class:Channel' as Ref<Class<Doc>>, title: 'c' }],
        attachedToClasses: ['chunter:class:DirectMessage' as Ref<Class<Doc>>]
      })
    ).toEqual({
      createdBy: [ALICE],
      createdAfter: 10,
      createdBefore: 20,
      attachedTo: ['chan'],
      rootObjectClass: ['chunter:class:DirectMessage']
    })
  })

  it('drops "thread replies": a file is filed under the chat, not the thread', () => {
    expect(placeFilters({ attachedToClasses: ['activity:class:ActivityMessage' as Ref<Class<Doc>>] })).toEqual({})
  })
})

describe('attachmentSearchRequest', () => {
  it('asks for the kind of the tab among chat attachments', () => {
    const request = attachmentSearchRequest(BrowserTab.Media, '', {}, 'date-desc')
    expect(request.query.classes).toEqual(['attachment:class:Attachment', 'ai-bot:class:AudioTranscribe'])
    expect(request.query.filters?.attachedToClass).toEqual(['chunter:class:ChatMessage', 'chunter:class:ThreadMessage'])
    expect(request.query.filters?.facets).toEqual([['attachment-kind:media']])
  })

  it('narrows to the picked formats with a group of their own', () => {
    const request = attachmentSearchRequest(BrowserTab.Files, 'x', { formats: ['pdf', 'document'] as any }, 'date-desc')
    expect(request.query.filters?.facets).toEqual([
      ['attachment-kind:file'],
      ['attachment-format:pdf', 'attachment-format:document']
    ])
  })

  it('searches the text inside documents only when asked, never inside media', () => {
    expect(attachmentSearchRequest(BrowserTab.Files, 'x', {}, 'relevance').options.searchIn).toEqual([
      'title',
      'content'
    ])
    expect(attachmentSearchRequest(BrowserTab.Files, 'x', { content: true }, 'relevance').options.searchIn).toEqual([
      'title',
      'content',
      'extra'
    ])
    expect(attachmentSearchRequest(BrowserTab.Media, 'x', { content: true }, 'relevance').options.searchIn).toEqual([
      'title',
      'content'
    ])
  })

  it('orders a feed by date even when relevance was picked for a query', () => {
    expect(attachmentSearchRequest(BrowserTab.Audio, '', {}, 'relevance').sort).toBe('date-desc')
    expect(attachmentSearchRequest(BrowserTab.Audio, 'x', {}, 'relevance').sort).toBe('relevance')
    expect(attachmentSearchRequest(BrowserTab.Audio, '', {}, 'date-asc').sort).toBe('date-asc')
  })

  it('highlights only a query', () => {
    expect(attachmentSearchRequest(BrowserTab.Files, '', {}, 'date-desc').options.highlight).toBe(false)
    expect(attachmentSearchRequest(BrowserTab.Files, 'x', {}, 'date-desc').options.highlight).toBe(true)
  })
})

describe('linkSearchRequest', () => {
  it('asks for messages with links, by text, urls and preview titles', () => {
    const request = linkSearchRequest('github', {}, 'date-desc')
    expect(request.query.classes).toEqual(['chunter:class:ChatMessage', 'chunter:class:ThreadMessage'])
    expect(request.query.filters?.facets).toEqual([['message-link']])
    expect(request.options).toMatchObject({ searchIn: ['content', 'extra'], fields: ['message', 'attachments'] })
  })
})

describe('hydrateAttachments', () => {
  const attached = { attachedTo: 'm1' as Ref<Doc>, attachedToClass: 'chunter:class:ChatMessage' as Ref<Class<Doc>> }

  it('rebuilds the attachment from the stored fields', async () => {
    const [row] = await hydrateAttachments([
      doc(
        'a1',
        { ...attached, createdBy: ALICE },
        {
          fields: { name: 'clip.mp4', file: 'blob1', type: 'video/mp4', size: 5, hls: { thumbnail: 'poster1' } },
          highlights: { title: ['\u0001clip\u0002.mp4'] }
        }
      )
    ])
    expect(row.attachment).toMatchObject({ _id: 'a1', name: 'clip.mp4', file: 'blob1', type: 'video/mp4', size: 5 })
    expect(row.format).toBe('video')
    expect(row.poster).toBe('poster1')
    expect(row.message).toEqual({ _id: 'm1', _class: 'chunter:class:ChatMessage' })
    expect(row.nameHighlight).toBe('\u0001clip\u0002.mp4')
    expect(row.channel).toBe('general')
  })

  it('reads the poster and length of a video kept in its metadata', async () => {
    const [row] = await hydrateAttachments([
      doc('a2', attached, {
        fields: {
          name: 'clip.mp4',
          file: 'blob2',
          type: 'video/mp4',
          metadata: { hls: { thumbnail: 'poster2' }, durationSec: 12.5 }
        }
      })
    ])
    expect(row.poster).toBe('poster2')
    expect(row.durationSec).toBe(12.5)
  })

  it('drops a hit that came without its file', async () => {
    expect(await hydrateAttachments([doc('a1', attached)])).toEqual([])
  })

  it('tells a voice message by its class and keeps its transcript excerpts', async () => {
    const [row] = await hydrateAttachments([
      doc(
        'v1',
        { ...attached, _class: 'ai-bot:class:AudioTranscribe' as Ref<Class<Doc>> },
        {
          fields: { name: 'me.webm', file: 'b', type: 'audio/webm', durationSec: 7, text: 'hello there' },
          highlights: { content: [' \u0001hello\u0002 there '] }
        }
      )
    ])
    expect(row.format).toBe('voice')
    expect(row.durationSec).toBe(7)
    expect(row.transcript).toBe('hello there')
    expect(row.contentHighlights).toEqual(['\u0001hello\u0002 there'])
  })
})

describe('hydrateLinks', () => {
  const message = (text: string): string =>
    JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

  beforeEach(() => {
    findAll.mockReset()
  })

  it('looks previews up only for messages carrying attachments', async () => {
    findAll.mockResolvedValue([
      {
        _id: 'p',
        attachedTo: 'm2',
        metadata: { url: 'https://GitHub.com/x', title: 'Repo', description: '', image: 'https://x/y.png' }
      }
    ])
    const rows = await hydrateLinks([
      doc(
        'm1',
        { _class: 'chunter:class:ChatMessage' as Ref<Class<Doc>> },
        { fields: { message: message('https://a.io') } }
      ),
      doc(
        'm2',
        { _class: 'chunter:class:ChatMessage' as Ref<Class<Doc>> },
        {
          fields: { message: message('see https://github.com/x'), attachments: 1 }
        }
      )
    ])
    expect(findAll.mock.calls[0][1]).toEqual({ attachedTo: { $in: ['m2'] }, type: 'application/link-preview' })
    expect(rows.map((r) => r.links.map((l) => l.host))).toEqual([['a.io'], ['github.com']])
    expect(rows[1].previews).toEqual([
      { url: 'https://github.com/x', title: 'Repo', description: undefined, image: 'https://x/y.png' }
    ])
  })

  it('skips the lookup entirely when no message has attachments', async () => {
    await hydrateLinks([doc('m1', {}, { fields: { message: message('https://a.io') } })])
    expect(findAll).not.toHaveBeenCalled()
  })

  it('drops a message whose links were edited away since it was indexed', async () => {
    expect(await hydrateLinks([doc('m1', {}, { fields: { message: message('no links now') } })])).toEqual([])
  })
})
