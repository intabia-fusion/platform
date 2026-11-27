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

import core from '@hcengineering/core'
import { collectPublicFiles } from '../publicFiles'

const root = 'document:class:Document'
const attachment = 'attachment:class:Attachment'
const photo = 'attachment:class:Photo'
const person = 'contact:class:Person'
const identity = 'contact:class:SocialIdentity'
const field = (type: string, attributeOf = root, extra = {}): any => ({ attributeOf, type: { _class: type, ...extra } })
function fixture (): any {
  const records: Record<string, any[]> = {
    [attachment]: [
      { _id: 'a', attachedTo: 'doc', attachedToClass: root, file: 'attachment' },
      { _id: 'b', attachedTo: 'foreign', attachedToClass: root, file: 'foreign-file' },
      { _id: 'c', attachedTo: 'doc', attachedToClass: 'other-domain', file: 'wrong-class-file' }
    ],
    [person]: [
      { _id: 'assignee', avatar: 'assignee-avatar' },
      { _id: 'author', avatar: 'author-avatar' },
      { _id: 'foreign-person', avatar: 'foreign-avatar' }
    ],
    [identity]: [{ _id: 'author-id', attachedTo: 'author' }]
  }
  const attrs = new Map([
    ['cover', field(core.class.TypeBlob)],
    ['blobRef', field(core.class.RefTo, root, { to: core.class.Blob })],
    ['text', field(core.class.TypeMarkup)],
    ['content', field(core.class.TypeCollaborativeDoc)],
    ['title', field(core.class.TypeString)],
    ['assignee', field(core.class.RefTo, root, { to: person })]
  ])
  const findAll = jest.fn(async (clazz, query) =>
    (records[clazz] ?? []).filter(
      (record) =>
        (query._id === undefined || query._id.$in.includes(record._id) === true) &&
        (query.attachedTo === undefined || query.attachedTo === record.attachedTo) &&
        (query.attachedToClass === undefined || query.attachedToClass.$in.includes(record.attachedToClass) === true)
    )
  )
  const client = {
    findAll,
    getHierarchy: () => ({
      hasClass: () => true,
      isDerived: (clazz: string, base: string) => clazz === base,
      getDescendants: () => [photo, attachment, 'chunter:class:ChatMessage'],
      getAncestors: () => [root],
      getAllAttributes: (clazz: string) =>
        clazz === root
          ? attrs
          : [attachment, photo].includes(clazz)
              ? new Map([['file', field(core.class.TypeBlob, attachment)]])
              : new Map()
    })
  }
  const doc = {
    _id: 'doc',
    _class: root,
    cover: 'cover',
    blobRef: 'ref-file',
    title: 'private-file',
    assignee: 'assignee',
    createdBy: 'author-id',
    modifiedBy: 'author-id',
    content: 'snapshot',
    text: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'image', attrs: { 'file-id': 'inline-image' } },
            { type: 'emoji', attrs: { kind: 'image', image: 'emoji' } }
          ]
        },
        { type: 'file', attrs: { 'file-id': 'excluded-file-node' } },
        { type: 'paragraph', attrs: { image: 'arbitrary-field' } },
        { type: 'emoji', attrs: { kind: 'unicode', image: 'not-custom-emoji' } }
      ]
    })
  }
  const load = jest.fn(async () =>
    JSON.stringify({
      type: 'doc',
      content: [
        { type: 'image', attrs: { 'file-id': 'snapshot-image' } },
        { type: 'image', attrs: { 'file-id': 'cover' } },
        { type: 'image', attrs: { 'file-id': 'https://example.com/external.png' } }
      ]
    })
  )
  return { client, doc, load, findAll, attrs }
}

it('collects only declared files, direct attachments, text images and scoped avatars', async () => {
  const { client, doc, load, findAll } = fixture()
  expect(await collectPublicFiles(client, doc, load)).toEqual([
    'assignee-avatar',
    'attachment',
    'author-avatar',
    'cover',
    'emoji',
    'inline-image',
    'ref-file',
    'snapshot-image'
  ])
  expect(findAll.mock.calls.filter(([clazz]: [string, unknown]) => clazz === attachment)).toHaveLength(1)
  expect(findAll).toHaveBeenCalledWith(attachment, { attachedTo: 'doc', attachedToClass: { $in: [root] } })
  expect(load).toHaveBeenCalledWith('snapshot')
})
it('does not return partial results after a snapshot read failure', async () => {
  const { client, doc, load } = fixture()
  load.mockRejectedValue(new Error('storage unavailable'))
  await expect(collectPublicFiles(client, doc, load)).rejects.toThrow('storage unavailable')
})
it('does not silently ignore malformed markup', async () => {
  const { client, doc, load } = fixture()
  doc.text = '{broken'
  await expect(collectPublicFiles(client, doc, load)).rejects.toThrow()
})
it('includes people from array references but not arbitrary string references', async () => {
  const { client, doc, load, attrs } = fixture()
  attrs.set('reviewers', field(core.class.ArrOf, root, { of: { _class: core.class.RefTo, to: person } }))
  doc.reviewers = ['assignee']
  doc.assignee = undefined
  doc.createdBy = undefined
  doc.modifiedBy = undefined
  doc.title = 'foreign-person'
  const files = await collectPublicFiles(client, doc, load)
  expect(files).toContain('assignee-avatar')
  expect(files).not.toContain('author-avatar')
  expect(files).not.toContain('foreign-avatar')
})
it('recomputes after additions and removals without changing the supplied document', async () => {
  const { client, doc, load } = fixture()
  const before = JSON.stringify(doc)
  await collectPublicFiles(client, doc, load)
  expect(JSON.stringify(doc)).toBe(before)
  doc.text = JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { 'file-id': 'new-image' } }] })
  const files = await collectPublicFiles(client, doc, load)
  expect(files).toContain('new-image')
  expect(files).not.toContain('inline-image')
  expect(files).not.toContain('emoji')
})

it('drops an unreferenced image embedding but retains an embedded PDF attachment', async () => {
  const { client, doc, load, findAll } = fixture()
  const original = findAll.getMockImplementation()
  findAll.mockImplementation(async (clazz: string, query: any) => {
    const found = await original(clazz, query)
    return clazz !== attachment
      ? found
      : [
          ...found,
          { _class: 'attachment:class:Embedding', type: 'image/png', file: 'inline-image' },
          { _class: 'attachment:class:Embedding', type: 'application/pdf', file: 'embedded-pdf' }
        ]
  })
  expect(await collectPublicFiles(client, doc, load)).toContain('inline-image')
  doc.text = JSON.stringify({ type: 'doc', content: [] })
  const files = await collectPublicFiles(client, doc, load)
  expect(files).not.toContain('inline-image')
  expect(files).toContain('embedded-pdf')
})
