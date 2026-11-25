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

import core, { MeasureMetricsContext } from '@hcengineering/core'
import guest from '@hcengineering/guest'
import { PublicFileMiddleware } from '../publicFileMiddleware'
import { PublicFileAccessError } from '@hcengineering/datalake'

const mockClient = {
  state: jest.fn(),
  replace: jest.fn(),
  revoke: jest.fn(),
  activeLinks: jest.fn(async () => [])
}
jest.mock('@hcengineering/datalake', () => ({
  ...jest.requireActual('@hcengineering/datalake'),
  PublicFileAccessClient: jest.fn(() => mockClient)
}))
const root = 'document:class:Document'
const space = 'space'
let middleware: PublicFileMiddleware
let records: any[]
let state: any
let next: any
let ctx: any
let context: any
function match (record: any, query: any): boolean {
  return Object.entries(query).every(([key, value]: [string, any]) => {
    if (key === '$or') return value.some((part: any) => match(record, part)) === true
    if (value !== null && typeof value === 'object') {
      if (value.$in !== undefined) return value.$in.includes(record[key]) === true
      if (value.$gt !== undefined) return record[key] > value.$gt
    }
    return record[key] === value
  })
}
const update = (): any => ({
  _class: core.class.TxUpdateDoc,
  objectClass: root,
  objectId: 'doc',
  operations: { content: 'new' }
})
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  state = { revision: 1, revoked: false, blobs: ['old'] }
  records = [
    { _id: 'link', _class: guest.class.PublicLink, attachedTo: 'doc', attachedToClass: root, space },
    { _id: 'doc', _class: root, space, content: 'old' }
  ]
  mockClient.state.mockImplementation(async () => ({ ...state, blobs: [...state.blobs] }))
  mockClient.replace.mockImplementation(async (_ws, _id, revision, blobs) => {
    Object.assign(state, { revision, blobs })
  })
  mockClient.revoke.mockImplementation(async () => {
    state.revoked = true
    state.blobs = []
  })
  const hierarchy = {
    hasClass: (clazz: string) => [root, guest.class.PublicLink, core.class.Space].includes(clazz as any),
    getDomain: () => 'data',
    isMixin: () => false,
    isDerived: (clazz: string, base: string) => clazz === base,
    getDescendants: (clazz: string) => (clazz === core.class.AttachedDoc ? [] : [clazz]),
    getAllAttributes: (clazz: string) =>
      new Map(clazz === root ? [['content', { type: { _class: core.class.TypeCollaborativeDoc } }]] : [])
  }
  context = {
    workspace: { uuid: '11111111-1111-4111-8111-111111111111' },
    hierarchy,
    lowLevelStorage: {
      rawFindAll: jest.fn(async (_domain, query, options) =>
        records
          .filter((record) => match(record, query))
          .sort((a, b) => a._id.localeCompare(b._id))
          .slice(0, options?.limit)
      ),
      rawUpdate: jest.fn(async (_domain, query, fields) => {
        for (const record of records.filter((record) => match(record, query))) Object.assign(record, fields)
      })
    },
    storageAdapter: {
      read: jest.fn(async (_ctx, _ws, snapshot) => [
        Buffer.from(
          JSON.stringify({
            type: 'doc',
            content: [{ type: 'image', attrs: { 'file-id': snapshot } }]
          })
        )
      ])
    }
  }
  ctx = new MeasureMetricsContext('test', {}) as any
  ctx.contextData = { contextCache: new Map() }
  next = {
    tx: jest.fn(async (_ctx, txes) => {
      for (const tx of txes) {
        if (tx._class === core.class.TxRemoveDoc) records = records.filter((record) => record._id !== tx.objectId)
        else if (tx._class === core.class.TxCreateDoc) {
          records.push({ _id: tx.objectId, _class: tx.objectClass, space, ...tx.attributes })
        } else {
          Object.assign(
            records.find((record) => record._id === tx.objectId),
            tx.operations
          )
        }
      }
      return {}
    })
  }
  middleware = new PublicFileMiddleware(ctx, context, next, 'http://datalake')
})
afterEach(async () => {
  await middleware.close()
  jest.useRealTimers()
})
it('does not acknowledge removal until the registry has confirmed it', async () => {
  await middleware.tx(ctx, [update()])
  expect(state.blobs).toEqual([])
  expect(records[0].publicFileSyncPending).toBe(false)
  expect(mockClient.replace).toHaveBeenCalledWith(context.workspace.uuid, 'link', 2, [])
})
it('keeps a durable pending marker on failure and repairs a no-op retry', async () => {
  mockClient.replace.mockRejectedValueOnce(new PublicFileAccessError(503))
  await expect(middleware.tx(ctx, [update()])).rejects.toMatchObject({ status: 503 })
  expect(records[0].publicFileSyncPending).toBe(true)
  expect(records[1].content).toBe('new') // Source write has happened, but no success was returned.
  await middleware.tx(ctx, [update()])
  expect(state.blobs).toEqual([])
  expect(records[0].publicFileSyncPending).toBe(false)
})
it('repairs a pending reduction after reconstructing the middleware', async () => {
  records[0].publicFileSyncPending = true
  records[1].content = 'new'
  await middleware.close()
  middleware = new PublicFileMiddleware(ctx, context, next, 'http://datalake')
  await middleware.tx(ctx, [update()])
  expect(state.blobs).toEqual([])
})
it('does not wait for the registry when only a new file is added', async () => {
  context.storageAdapter.read.mockImplementation(async (_ctx: any, _ws: any, snapshot: string) => [
    Buffer.from(
      JSON.stringify({
        type: 'doc',
        content: (snapshot === 'old' ? ['old'] : ['old', 'new']).map((id) => ({
          type: 'image',
          attrs: { 'file-id': id }
        }))
      })
    )
  ])
  mockClient.state.mockRejectedValue(new Error('control API unavailable'))
  await middleware.tx(ctx, [update()])
  expect(mockClient.state).not.toHaveBeenCalled()
  expect(records[0].publicFileSyncPending).toBe(false)
})
it('registers initial publication even when the URL is already filled', async () => {
  records = records.filter((record) => record._id !== 'link')
  state = { revision: 0, revoked: false, blobs: [] }
  await middleware.tx(ctx, [
    {
      _class: core.class.TxCreateDoc,
      objectClass: guest.class.PublicLink,
      objectId: 'link',
      attributes: { attachedTo: 'doc', attachedToClass: root, url: 'already-filled' }
    } as any
  ])
  expect(state.blobs).toEqual(['old'])
})
it('revokes deletion and invalidating moves', async () => {
  await middleware.tx(ctx, [{ ...update(), operations: { space: 'another-space' } }])
  expect(state.revoked).toBe(true)
})
it('rejects attempts by a client to clear the server-owned marker', async () => {
  await expect(
    middleware.tx(ctx, [
      {
        ...update(),
        objectClass: guest.class.PublicLink,
        objectId: 'link',
        operations: { publicFileSyncPending: false }
      }
    ])
  ).rejects.toThrow('server-owned')
  expect(next.tx).not.toHaveBeenCalled()
})
it('does not deadlock a derived transaction in the same request context', async () => {
  next.tx.mockImplementationOnce(async () => {
    await middleware.tx(ctx, [{ ...update(), operations: { content: 'old' } }])
    return {}
  })
  await middleware.tx(ctx, [update()])
  expect(next.tx).toHaveBeenCalledTimes(2)
})

it('does not write the entity when the write-ahead marker cannot be saved', async () => {
  context.lowLevelStorage.rawUpdate.mockRejectedValue(new Error('database unavailable'))
  await expect(middleware.tx(ctx, [update()])).rejects.toThrow('database unavailable')
  expect(next.tx).not.toHaveBeenCalled()
})
it('keeps the marker if the source mutation fails', async () => {
  next.tx.mockRejectedValue(new Error('write failed'))
  await expect(middleware.tx(ctx, [update()])).rejects.toThrow('write failed')
  expect(records[0].publicFileSyncPending).toBe(true)
  expect(records[1].content).toBe('old')
})
it('revokes an explicitly deleted link even if its text snapshot is broken', async () => {
  context.storageAdapter.read.mockRejectedValue(new Error('snapshot missing'))
  await middleware.tx(ctx, [
    { _class: core.class.TxRemoveDoc, objectClass: guest.class.PublicLink, objectId: 'link' } as any
  ])
  expect(state.revoked).toBe(true)
})
it('does not call the registry if a saved text snapshot has the same file references', async () => {
  context.storageAdapter.read.mockImplementation(async () => [
    Buffer.from(
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'image', attrs: { 'file-id': 'old' } }]
      })
    )
  ])
  await middleware.tx(ctx, [update()])
  expect(mockClient.state).not.toHaveBeenCalled()
})

it('targets avatar changes by actual person references and ignores unrelated published documents', async () => {
  const personClass = 'contact:class:Person'
  const contactClass = 'contact:class:Contact'
  const original = context.hierarchy.getAllAttributes
  context.hierarchy.hasClass = (clazz: string) =>
    [root, guest.class.PublicLink, core.class.Space, personClass, contactClass].includes(clazz)
  context.hierarchy.isDerived = (clazz: string, base: string) =>
    clazz === base || (clazz === personClass && base === contactClass)
  context.hierarchy.getAllAttributes = (clazz: string) => {
    const attrs = original(clazz)
    if (clazz === root) attrs.set('assignee', { type: { _class: core.class.RefTo, to: personClass } })
    return attrs
  }
  records[1].assignee = 'person'
  records.push({ _id: 'person', _class: personClass, avatar: 'old-avatar' })
  records.push({ _id: 'unrelated', _class: root, space, content: 'broken' })
  records.push({
    _id: 'unrelated-link',
    _class: guest.class.PublicLink,
    space,
    attachedTo: 'unrelated',
    attachedToClass: root
  })
  state.blobs = ['old', 'old-avatar']
  await middleware.tx(ctx, [
    {
      _class: core.class.TxUpdateDoc,
      objectClass: contactClass,
      objectId: 'person',
      operations: { avatar: 'new-avatar' }
    } as any
  ])
  expect(state.blobs).toEqual(['old'])
  expect(mockClient.replace).toHaveBeenCalledTimes(1)
  expect(context.storageAdapter.read).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'broken')
})
it('does not mistake ordinary text mentioning the marker name for a protected update', async () => {
  await middleware.tx(ctx, [{ ...update(), operations: { title: 'publicFileSyncPending' } }])
  expect(next.tx).toHaveBeenCalledTimes(1)
})
