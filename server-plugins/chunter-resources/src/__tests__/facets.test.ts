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

import chunter, { type ChatMessage } from '@hcengineering/chunter'
import { toFindResult } from '@hcengineering/core'
import type { WithFind } from '@hcengineering/server-core'

import { ChatMessageSearchFacets } from '../facets'

function linkText (text: string, href: string): any {
  return { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }
}

function message (content: any[], attachments = 0): ChatMessage {
  return {
    _id: 'm1',
    _class: chunter.class.ChatMessage,
    attachments,
    message: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content }] })
  } as any as ChatMessage
}

function storage (previews: any[] = []): WithFind & { findAll: jest.Mock } {
  return { findAll: jest.fn().mockResolvedValue(toFindResult(previews)) } as any
}

describe('ChatMessageSearchFacets', () => {
  it('leaves a message without links unmarked and does not query', async () => {
    const s = storage()
    const result = await ChatMessageSearchFacets(message([{ type: 'text', text: 'hi' }], 2), {} as any, {} as any, s)
    expect(result).toEqual({ values: [] })
    expect(s.findAll).not.toHaveBeenCalled()
  })

  it('marks every host once and indexes the urls', async () => {
    const doc = message([
      linkText('PR', 'https://github.com/a/b/pull/1'),
      { type: 'text', text: ' and https://www.github.com/c and https://ozon.ru/t/x' }
    ])
    const s = storage()
    expect(await ChatMessageSearchFacets(doc, {} as any, {} as any, s)).toEqual({
      values: ['message-link'],
      extra: 'https://github.com/a/b/pull/1\nhttps://www.github.com/c\nhttps://ozon.ru/t/x'
    })
    expect(s.findAll).not.toHaveBeenCalled()
  })

  it('adds the titles of its link previews', async () => {
    const s = storage([{ _id: 'p', attachedTo: 'm1', metadata: { title: 'Pull Request', description: '' } }])
    const result = await ChatMessageSearchFacets(
      message([linkText('x', 'https://github.com/a')], 1),
      {} as any,
      {} as any,
      s
    )
    expect(result.extra).toBe('https://github.com/a\nPull Request')
    expect(s.findAll.mock.calls[0][2]).toEqual({ attachedTo: { $in: ['m1'] }, type: 'application/link-preview' })
  })

  it('loads the previews of a whole batch in one query', async () => {
    const m1 = message([linkText('x', 'https://a.io')], 1)
    const m2 = { ...message([linkText('y', 'https://b.io')], 1), _id: 'm2' } as any as ChatMessage
    const s = storage([
      { _id: 'p1', attachedTo: 'm1', metadata: { title: 'A' } },
      { _id: 'p2', attachedTo: 'm2', metadata: { title: 'B' } }
    ])
    const batch = [m1, m2]
    const [r1, r2] = await Promise.all(batch.map((m) => ChatMessageSearchFacets(m, {} as any, {} as any, s, batch)))
    expect(s.findAll).toHaveBeenCalledTimes(1)
    expect(r1.extra).toBe('https://a.io/\nA')
    expect(r2.extra).toBe('https://b.io/\nB')
  })
})
