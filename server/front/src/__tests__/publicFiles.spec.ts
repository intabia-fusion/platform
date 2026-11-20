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
import { canReadPublicFile } from '../publicFiles'

const attachment = 'attachment:class:Attachment'
const documentClass = 'document:class:Document'
const blobAttribute = { attributeOf: attachment, type: { _class: core.class.TypeBlob } }
function fixture (): { client: any, findOne: jest.Mock } {
  const findOne = jest.fn(async (clazz, query) => {
    if (clazz === 'guest:class:PublicLink') return { attachedTo: 'doc', attachedToClass: documentClass }
    if (clazz === documentClass) return { _id: 'doc', _class: documentClass }
    if (clazz === attachment && query.attachedTo === 'doc' && query.file === 'allowed') return { file: 'allowed' }
    return undefined
  })
  return {
    findOne,
    client: {
      findOne,
      getHierarchy: () => ({
        hasClass: () => true,
        getDescendants: () => [attachment],
        getAncestors: () => [documentClass],
        getAllAttributes: (clazz: string) => new Map(clazz === attachment ? [['file', blobAttribute]] : [])
      })
    }
  }
}

describe('public file scope', () => {
  it.each([
    ['assignee avatar', 'assignee-avatar', true],
    ['author avatar', 'author-avatar', true],
    ['unrelated person avatar', 'foreign-avatar', false],
    ['another file of a readable person', 'person-attachment', false]
  ])('checks guest-readable people for %s', async (_name, file, expected) => {
    const { client, findOne } = fixture()
    const findDocument = findOne.getMockImplementation()
    findOne.mockImplementation(async (clazz, query) => {
      if (clazz === 'contact:class:Person') {
        // The guest client filters out people outside this link's scope.
        return ['assignee-avatar', 'author-avatar'].includes(query.avatar)
          ? { _id: 'readable-person', avatar: query.avatar }
          : undefined
      }
      return await findDocument?.(clazz, query)
    })
    expect(await canReadPublicFile(client, 'link', file as string)).toBe(expected)
    expect(findOne).toHaveBeenCalledWith('contact:class:Person', expect.objectContaining({ avatar: file }))
  })
  it('queries each declaring class and file field once, including inherited and distinct fields', async () => {
    const { client, findOne } = fixture()
    const photo = 'attachment:class:Photo'
    const version = 'drive:class:FileVersion'
    client.getHierarchy = () => ({
      hasClass: () => true,
      getDescendants: () => [photo, attachment, version],
      getAncestors: () => [documentClass],
      getAllAttributes: (clazz: string) => new Map(clazz === photo
        ? [['file', blobAttribute], ['preview', { ...blobAttribute, attributeOf: photo }]]
        : clazz === attachment
          ? [['file', blobAttribute]]
          : clazz === version ? [['file', { ...blobAttribute, attributeOf: version }]] : [])
    })
    const results = await Promise.all(Array.from({ length: 20 }, async (_, i) =>
      await canReadPublicFile(client, 'link', `embedded-${i}`)))
    expect(results).toEqual(Array(20).fill(false))
    const queries = findOne.mock.calls.filter(([clazz]) => [attachment, photo, version].includes(clazz))
    expect(queries).toHaveLength(60)
    expect(queries.filter(([clazz]) => clazz === attachment)).toHaveLength(20)
    expect(queries.filter(([clazz, query]) => clazz === photo && query.preview !== undefined)).toHaveLength(20)
    expect(queries.filter(([clazz]) => clazz === version)).toHaveLength(20)
    expect(queries.every(([, query]) => query.attachedTo === 'doc' &&
      query.attachedToClass.$in.includes(documentClass) === true)).toBe(true)
  })
  it('allows an attachment of the published object, regardless of file format', async () => {
    const { client } = fixture()
    expect(await canReadPublicFile(client, 'link', 'allowed')).toBe(true)
  })
  it('refuses a file not attached to the published object', async () => {
    const { client } = fixture()
    expect(await canReadPublicFile(client, 'link', 'foreign')).toBe(false)
  })
  it('checks attachments before loading collaborative text, while rechecking access on every request', async () => {
    const { client, findOne } = fixture()
    const getAllAttributes = client.getHierarchy().getAllAttributes
    client.getHierarchy = () => ({
      hasClass: () => true,
      getDescendants: () => [attachment],
      getAncestors: () => [documentClass],
      getAllAttributes: (clazz: string) => clazz === documentClass
        ? new Map([['content', { type: { _class: core.class.TypeCollaborativeDoc } }]])
        : getAllAttributes(clazz)
    })
    findOne.mockImplementation(async (clazz, query) => {
      if (clazz === 'guest:class:PublicLink') return { attachedTo: 'doc', attachedToClass: documentClass }
      if (clazz === documentClass) return { _id: 'doc', _class: documentClass, content: 'snapshot' }
      if (clazz === attachment && query.file === 'allowed') return { file: 'allowed' }
      return undefined
    })
    const load = jest.fn(async () => JSON.stringify({ type: 'doc', content: [] }))
    for (let i = 0; i < 20; i++) {
      expect(await canReadPublicFile(client, 'link', 'allowed', load)).toBe(true)
    }
    expect(load).not.toHaveBeenCalled()
    expect(findOne.mock.calls.filter(([clazz]) => clazz === 'guest:class:PublicLink')).toHaveLength(20)
    expect(findOne.mock.calls.filter(([clazz]) => clazz === documentClass)).toHaveLength(20)
    findOne.mockResolvedValueOnce(undefined)
    expect(await canReadPublicFile(client, 'link', 'allowed', load)).toBe(false)
  })
  it('refuses a revoked link even when the file still exists', async () => {
    const { client, findOne } = fixture()
    findOne.mockResolvedValueOnce(undefined)
    expect(await canReadPublicFile(client, 'revoked', 'allowed')).toBe(false)
    expect(findOne).toHaveBeenCalledTimes(1)
  })
  it('refuses a deleted or moved document', async () => {
    const { client, findOne } = fixture()
    findOne.mockResolvedValueOnce({ attachedTo: 'doc', attachedToClass: documentClass }).mockResolvedValueOnce(undefined)
    expect(await canReadPublicFile(client, 'link', 'allowed')).toBe(false)
  })
  it('allows a typed blob field on the published object', async () => {
    const { client } = fixture()
    client.getHierarchy = () => ({
      hasClass: () => true,
      getDescendants: () => [],
      getAllAttributes: () => new Map([['cover', blobAttribute]])
    })
    client.findOne = jest.fn().mockResolvedValueOnce({ attachedTo: 'doc', attachedToClass: documentClass })
      .mockResolvedValueOnce({ _id: 'doc', _class: documentClass, cover: 'cover-file' })
    expect(await canReadPublicFile(client, 'link', 'cover-file')).toBe(true)
  })
})

it('reads embedded image references only from a typed collaborative field', async () => {
  const { client } = fixture()
  client.getHierarchy = () => ({
    hasClass: () => true,
    getDescendants: () => [],
    getAllAttributes: () => new Map([['content', { type: { _class: core.class.TypeCollaborativeDoc } }]])
  })
  client.findOne = jest.fn().mockResolvedValueOnce({ attachedTo: 'doc', attachedToClass: documentClass })
    .mockResolvedValueOnce({ _id: 'doc', _class: documentClass, content: 'snapshot' })
  const load = jest.fn(async () => JSON.stringify({ type: 'doc', content: [{ type: 'image', attrs: { 'file-id': 'embedded' } }] }))
  expect(await canReadPublicFile(client, 'link', 'embedded', load)).toBe(true)
  expect(load).toHaveBeenCalledWith('snapshot')
})
it('does not authorize a file just because its id is in an arbitrary string field', async () => {
  const { client } = fixture()
  client.findOne = jest.fn().mockResolvedValueOnce({ attachedTo: 'doc', attachedToClass: documentClass })
    .mockResolvedValueOnce({ _id: 'doc', _class: documentClass, title: 'foreign' })
  expect(await canReadPublicFile(client, 'link', 'foreign')).toBe(false)
})

describe.each([
  ['inline', core.class.TypeMarkup],
  ['collaborative', core.class.TypeCollaborativeDoc]
])('custom emoji in %s markup', (_label, fieldType) => {
  it.each([
    ['referenced image emoji', 'emoji', 'image', 'emoji-file', 'emoji-file', true],
    ['another file', 'emoji', 'image', 'emoji-file', 'foreign-file', false],
    ['unicode emoji with an image attribute', 'emoji', 'unicode', 'emoji-file', 'emoji-file', false],
    ['another node with an image attribute', 'paragraph', 'image', 'emoji-file', 'emoji-file', false],
    ['emoji without image kind', 'emoji', undefined, 'emoji-file', 'emoji-file', false]
  ])('%s', async (_name, type, kind, image, requested, expected) => {
    const { client } = fixture()
    const markup = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type, attrs: { kind, image } }] }] })
    client.getHierarchy = () => ({
      hasClass: () => true,
      getDescendants: () => [],
      getAllAttributes: () => new Map([['content', { type: { _class: fieldType } }]])
    })
    client.findOne = jest.fn().mockResolvedValueOnce({ attachedTo: 'doc', attachedToClass: documentClass })
      .mockResolvedValueOnce({
        _id: 'doc',
        _class: documentClass,
        content: fieldType === core.class.TypeMarkup ? markup : 'snapshot'
      })
    expect(await canReadPublicFile(client, 'link', requested as string, async () => markup)).toBe(expected)
  })
})
