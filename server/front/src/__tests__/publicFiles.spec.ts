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
const blobAttribute = { type: { _class: core.class.TypeBlob } }
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
  it('allows an attachment of the published object, regardless of file format', async () => {
    const { client } = fixture()
    expect(await canReadPublicFile(client, 'link', 'allowed')).toBe(true)
  })
  it('refuses a file not attached to the published object', async () => {
    const { client } = fixture()
    expect(await canReadPublicFile(client, 'link', 'foreign')).toBe(false)
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
