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

import core, {
  createClient,
  TxOperations,
  type Client,
  type Doc,
  type Ref,
  type Space,
  type Tx
} from '@hcengineering/core'
import { LiveQuery } from '..'
import { Refs } from '../refs'
import { connect } from './connection'
import { test } from './minmodel'

// What the cache of held documents keeps of a query with a projection: nothing of a projection of
// the base document, the whole base document of a projection of the joins alone, served without
// its cut joins to a reader that asks for no lookup and to nobody who asks for one.
describe('Refs and projections', () => {
  const lookup = { space: core.class.Space }
  const noLookupKey = `${test.class.TestComment}:{}:{}`
  const lookupKey = `${test.class.TestComment}:${JSON.stringify(lookup)}:{}`

  async function getRefs (): Promise<{ refs: Refs, storage: Client }> {
    const storage = await createClient(connect)
    return { refs: new Refs(() => storage.getHierarchy()), storage }
  }

  function comment (id: string, joins: boolean): Doc & Record<string, any> {
    return {
      _id: id as Ref<Doc>,
      _class: test.class.TestComment,
      space: 'space-1' as Ref<Space>,
      modifiedOn: 1,
      modifiedBy: core.account.System,
      message: `message of ${id}`,
      ...(joins ? { $lookup: { space: { _id: 'space-1', _class: core.class.Space, name: 'the space' } } } : {})
    }
  }

  const query = (options: any): any => ({ id: Math.floor(Math.random() * 1e9), options })
  const keys = (refs: Refs): string[] => Array.from((refs as any).documentRefs.keys())

  it('keeps the base documents of a lookup-only projected query under the key without lookup', async () => {
    const { refs } = await getRefs()
    refs.updateDocuments(query({ lookup, projection: { '$lookup.space.name': 1 } }), [comment('c1', true)])

    expect(keys(refs)).toEqual([noLookupKey])
    expect((refs as any).documentRefs.get(noLookupKey).get('c1')).toBeDefined()
  })

  it('keeps nothing of a query with a projection of the base document', async () => {
    const { refs } = await getRefs()
    refs.updateDocuments(query({ projection: { message: 1 } }), [comment('c1', false)])
    refs.updateDocuments(query({ projection: { message: 0 } }), [comment('c2', false)])
    refs.updateDocuments(query({ lookup, projection: { message: 1, '$lookup.space.name': 1 } }), [comment('c3', true)])
    refs.updateDocuments(query({ lookup, projection: { message: 0, '$lookup.space.name': 1 } }), [comment('c4', true)])

    expect(keys(refs)).toEqual([])
  })

  it('serves a reader without lookup the document by its id, the cut joins stripped', async () => {
    const { refs } = await getRefs()
    refs.updateDocuments(query({ lookup, projection: { '$lookup.space.name': 1 } }), [comment('c1', true)])

    const byId = refs.findFromDocs(test.class.TestComment, { _id: 'c1' as Ref<Doc> })
    expect(byId?.[0]).toMatchObject({ _id: 'c1', message: 'message of c1' })
    expect(byId?.[0]).not.toHaveProperty('$lookup')

    const first = refs.findFromDocs(test.class.TestComment, { message: 'message of c1' }, { limit: 1 })
    expect(first?.[0]._id).toBe('c1')
    expect(first?.[0]).not.toHaveProperty('$lookup')
  })

  it('serves a reader who asks for the same lookup nothing of it', async () => {
    const { refs } = await getRefs()
    refs.updateDocuments(query({ lookup, projection: { '$lookup.space.name': 1 } }), [comment('c1', true)])

    expect(refs.findFromDocs(test.class.TestComment, { _id: 'c1' as Ref<Doc> }, { lookup })).toBeNull()
    expect(refs.findFromDocs(test.class.TestComment, { message: 'message of c1' }, { limit: 1, lookup })).toBeNull()
    expect(
      refs.findFromDocs(test.class.TestComment, { _id: 'c1' as Ref<Doc> }, { associations: [['assoc', 1]] as any })
    ).toBeNull()
  })

  it('serves a reader with lookup the whole joins of a query without projection', async () => {
    const { refs } = await getRefs()
    refs.updateDocuments(query({ lookup }), [comment('c1', true)])

    expect(keys(refs)).toEqual([lookupKey])
    const withJoins = refs.findFromDocs(test.class.TestComment, { _id: 'c1' as Ref<Doc> }, { lookup })
    expect(withJoins?.[0].$lookup?.space).toMatchObject({ name: 'the space' })

    // The same document to a reader without lookup: found by the scan of the class, joins stripped.
    const bare = refs.findFromDocs(test.class.TestComment, { message: 'message of c1' }, { limit: 1 })
    expect(bare?.[0]._id).toBe('c1')
    expect(bare?.[0]).not.toHaveProperty('$lookup')
  })

  it('hands out a clone, never the held object', async () => {
    const { refs } = await getRefs()
    const held = comment('c1', true)
    refs.updateDocuments(query({ lookup, projection: { '$lookup.space.name': 1 } }), [held])

    const served = refs.findFromDocs(test.class.TestComment, { _id: 'c1' as Ref<Doc> })?.[0] as any
    served.message = 'changed by the reader'
    expect(held.message).toBe('message of c1')
    expect(held.$lookup).toBeDefined()
  })

  it('shares the entry with a query without lookup and lets go of it with the last holder', async () => {
    const { refs } = await getRefs()
    const projected = query({ lookup, projection: { '$lookup.space.name': 1 } })
    const plain = query({})
    refs.updateDocuments(projected, [comment('c1', true)])
    refs.updateDocuments(plain, [comment('c1', false)])

    const entry = (refs as any).documentRefs.get(noLookupKey).get('c1')
    expect(entry.queries).toEqual(new Set([projected.id, plain.id]))

    refs.updateDocuments(projected, [comment('c1', true)], true)
    expect(refs.findFromDocs(test.class.TestComment, { _id: 'c1' as Ref<Doc> })?.[0]._id).toBe('c1')

    refs.updateDocuments(plain, [comment('c1', false)], true)
    expect(refs.findFromDocs(test.class.TestComment, { _id: 'c1' as Ref<Doc> })).toBeNull()
  })

  describe('through a live query', () => {
    async function getClient (): Promise<{ liveQuery: LiveQuery, factory: TxOperations, findAll: jest.Mock }> {
      const storage = await createClient(connect)
      const originalAll = storage.findAll.bind(storage)
      const findAll = jest.fn(async (_class: any, q: any, options: any) => await originalAll(_class, q, options))
      storage.findAll = findAll as any
      const liveQuery = new LiveQuery(storage)
      storage.notify = (...tx: Tx[]) => {
        void liveQuery.tx(...tx)
      }
      return { liveQuery, factory: new TxOperations(storage, core.account.System), findAll }
    }

    async function subscribe (liveQuery: LiveQuery, space: Ref<Space>, options: any): Promise<() => void> {
      let unsubscribe: () => void = () => {}
      await new Promise<void>((resolve) => {
        unsubscribe = liveQuery.query(
          test.class.TestComment,
          { space },
          () => {
            resolve()
          },
          options
        )
      })
      return unsubscribe
    }

    it('serves the held document through its updates, the unsubscribed query included', async () => {
      const { liveQuery, factory, findAll } = await getClient()
      const tag = 'refs-live-' + Date.now()
      const space = await factory.createDoc(core.class.Space, core.space.Model, {
        name: 'a-space',
        description: 'initial',
        private: false,
        members: [],
        archived: false
      })
      const comment = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: tag
      })
      // Filtered by the space, so an edit of the message keeps the comment in the result.
      const unsubscribe = await subscribe(liveQuery, space, { lookup, projection: { '$lookup.space.name': 1 } })

      findAll.mockClear()
      expect((await liveQuery.findOne(test.class.TestComment, { _id: comment }))?.message).toBe(tag)
      expect(findAll).not.toHaveBeenCalled()

      // The held object is the one the live query patches: the next read sees the change.
      await factory.updateDoc(test.class.TestComment, space, comment, { message: tag + ' edited' })
      await new Promise((resolve) => setTimeout(resolve, 50))
      findAll.mockClear()
      expect((await liveQuery.findOne(test.class.TestComment, { _id: comment }))?.message).toBe(tag + ' edited')
      expect(findAll).not.toHaveBeenCalled()

      // An unsubscribed query lingers in the queue of the live query, its documents with it.
      unsubscribe()
      await new Promise((resolve) => setTimeout(resolve, 50))
      findAll.mockClear()
      expect((await liveQuery.findOne(test.class.TestComment, { _id: comment }))?.message).toBe(tag + ' edited')
      expect(findAll).not.toHaveBeenCalled()

      await liveQuery.close()
    })
  })
})
