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
  generateId,
  TxOperations,
  type Class,
  type Doc,
  type Ref,
  type Space
} from '@hcengineering/core'
import { LiveQuery } from '..'
import {
  lookupFields,
  lookupProjection,
  projectionAt,
  touchedAttributes,
  txTouchesProjected,
  withLiveQueryFields,
  withLiveQueryOptions
} from '../projection'
import { connect } from './connection'
import { test } from './minmodel'

// A query with `$lookup.<path>.<field>` projection keys: the joined documents of a document added later
// are fetched with those fields, and a tx on a joined document wakes the callback only when it
// touches a field the projection keeps. The base document is left whole by lookup-only keys.
describe('LiveQuery lookup projection', () => {
  describe('helpers', () => {
    it('adds the live query fields to an inclusion of the base document only', () => {
      expect(withLiveQueryFields({ message: 1 })).toEqual({ message: 1, _class: 1, space: 1, modifiedOn: 1 })
      expect(withLiveQueryFields({ '$lookup.space.name': 1 })).toEqual({ '$lookup.space.name': 1 })
      expect(withLiveQueryFields({ message: 0, modifiedOn: 0 })).toEqual({ message: 0 })
      // Nothing left of an exclusion: no projection at all, not an empty inclusion.
      expect(withLiveQueryFields({ modifiedOn: 0, space: 0 })).toBeUndefined()
      expect(withLiveQueryOptions({ limit: 5, projection: { modifiedOn: 0 } } as any)).toEqual({ limit: 5 })
      expect(withLiveQueryOptions({ limit: 5 })).toEqual({ limit: 5 })
      expect(withLiveQueryOptions(undefined)).toBeUndefined()
      expect(withLiveQueryFields({ message: 1, '$lookup.space.name': 1 })).toEqual({
        message: 1,
        '$lookup.space.name': 1,
        _class: 1,
        space: 1,
        modifiedOn: 1
      })
      expect(withLiveQueryFields(undefined)).toBeUndefined()
    })

    it('cuts the projection of one lookup and of one nesting level', () => {
      const projection = {
        message: 1,
        '$lookup.space.name': 1,
        '$lookup.attachedTo.message': 1,
        '$lookup.attachedTo.$lookup.space.name': 1
      }
      expect(lookupProjection(projection, 'space')).toEqual({ name: 1 })
      expect(lookupProjection(projection, 'attachedTo')).toEqual({ message: 1, '$lookup.space.name': 1 })
      expect(lookupProjection(projection, 'participants')).toBeUndefined()
      expect(projectionAt(projection, '$lookup.attachedTo')).toEqual({ message: 1, '$lookup.space.name': 1 })
      expect(projectionAt(projection, '')).toBe(projection)
    })

    it('reads the fields of a lookup in its own mode', () => {
      expect(lookupFields({ '$lookup.space.name': 1, '$lookup.space.archived': 0 }, '', 'space')).toEqual({
        fields: new Set(['name']),
        exclude: false
      })
      expect(lookupFields({ '$lookup.space.name': 0, '$lookup.space.archived': 0 }, '', 'space')).toEqual({
        fields: new Set(['name', 'archived']),
        exclude: true
      })
      expect(lookupFields({ '$lookup.attachedTo.$lookup.space.name': 1 }, '$lookup.attachedTo', 'space')).toEqual({
        fields: new Set(['name']),
        exclude: false
      })
      // The nested lookup's keys are not fields of the outer one.
      expect(lookupFields({ '$lookup.attachedTo.$lookup.space.name': 1 }, '', 'attachedTo')).toBeUndefined()
      expect(lookupFields({ message: 1 }, '', 'space')).toBeUndefined()
      expect(lookupFields(undefined, '', 'space')).toBeUndefined()
    })

    it('lists the attributes a tx touches, operators and mixins included', () => {
      const update = {
        _class: core.class.TxUpdateDoc,
        operations: { name: 'x', $inc: { count: 1 }, $push: { members: 'a' }, $unset: { topic: '' } }
      } as any
      expect(touchedAttributes(update).sort()).toEqual(['count', 'members', 'name', 'topic'])
      const mixin = { _class: core.class.TxMixin, mixin: 'test:mixin:TestMixin', attributes: { arr: [] } } as any
      expect(touchedAttributes(mixin)).toEqual(['arr', 'test:mixin:TestMixin.arr'])
    })

    it('tells whether a tx changes what the projection keeps', () => {
      const include = { fields: new Set(['name', 'icon']), exclude: false }
      const exclude = { fields: new Set(['description']), exclude: true }
      const tx = (operations: any): any => ({ _class: core.class.TxUpdateDoc, operations })
      expect(txTouchesProjected(include, tx({ name: 'a' }))).toBe(true)
      expect(txTouchesProjected(include, tx({ description: 'a' }))).toBe(false)
      expect(txTouchesProjected(include, tx({ 'icon.asset': 'a' }))).toBe(true)
      expect(txTouchesProjected(exclude, tx({ description: 'a' }))).toBe(false)
      expect(txTouchesProjected(exclude, tx({ name: 'a' }))).toBe(true)
      expect(txTouchesProjected(exclude, tx({ description: 'a', name: 'b' }))).toBe(true)
    })
  })

  describe('with a live query', () => {
    async function getClient (): Promise<{
      liveQuery: LiveQuery
      factory: TxOperations
      findAll: jest.Mock
      close: () => Promise<void>
    }> {
      const storage = await createClient(connect)
      const original = storage.findAll.bind(storage)
      const findAll = jest.fn(async (_class: any, query: any, options: any) => await original(_class, query, options))
      storage.findAll = findAll as any
      const liveQuery = new LiveQuery(storage)
      storage.notify = (...tx) => {
        void liveQuery.tx(...tx)
      }
      return {
        liveQuery,
        factory: new TxOperations(storage, core.account.System),
        findAll,
        close: async () => {
          await liveQuery.close()
        }
      }
    }

    async function subscribe<T extends Doc> (
      liveQuery: LiveQuery,
      _class: Ref<Class<T>>,
      query: any,
      options?: any
    ): Promise<{ mock: jest.Mock, unsubscribe: () => void }> {
      const mock = jest.fn()
      let unsubscribe: () => void = () => {}
      await new Promise<void>((resolve) => {
        let resolved = false
        unsubscribe = liveQuery.query<T>(
          _class,
          query,
          (res) => {
            mock(res)
            if (!resolved) {
              resolved = true
              resolve()
            }
          },
          options
        )
      })
      return { mock, unsubscribe }
    }

    async function waitForNextCall (mock: jest.Mock, from: number, timeoutMs = 2000): Promise<any[]> {
      const start = Date.now()
      while (mock.mock.calls.length <= from) {
        if (Date.now() - start > timeoutMs) {
          throw new Error('timed out waiting for a LiveQuery callback')
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      return mock.mock.calls[mock.mock.calls.length - 1][0]
    }

    const settle = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }

    async function createSpace (factory: TxOperations, name: string): Promise<Ref<Space>> {
      return await factory.createDoc(core.class.Space, core.space.Model, {
        name,
        description: 'initial',
        private: false,
        members: [],
        archived: false
      })
    }

    it('sends lookup-only keys to the server without touching the base projection', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const space = await createSpace(factory, 'base-whole')
      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'base-whole'
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'base-whole' },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.name': 1 } }
      )
      const call = findAll.mock.calls.find((it) => it[0] === test.class.TestComment)
      expect(call?.[2]?.projection).toEqual({ '$lookup.space.name': 1 })
      // The mock storage ignores projections: the point is what was asked for.
      expect(mock.mock.calls[0][0][0].$lookup.space.name).toBe('base-whole')

      await close()
    })

    it('keeps an exclusion of the base document an exclusion', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const space = await createSpace(factory, 'exclusion')
      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'exclusion'
      })

      await subscribe(liveQuery, test.class.TestComment, { message: 'exclusion' }, { projection: { collection: 0 } })
      const call = findAll.mock.calls.find((it) => it[0] === test.class.TestComment)
      expect(call?.[2]?.projection).toEqual({ collection: 0 })

      await close()
    })

    it('sends no projection when an exclusion names only the live query fields', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const space = await createSpace(factory, 'exclusion-empty')
      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'exclusion-empty'
      })

      await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'exclusion-empty' },
        { projection: { modifiedOn: 0 } }
      )
      const call = findAll.mock.calls.find((it) => it[0] === test.class.TestComment)
      expect(call?.[2]).toBeDefined()
      expect('projection' in (call?.[2] ?? {})).toBe(false)

      await close()
    })

    it('fetches the lookup of a document added later with the projected fields', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const space = await createSpace(factory, 'added-later')

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'added-later' },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.name': 1 } }
      )
      const before = mock.mock.calls.length
      findAll.mockClear()

      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'added-later'
      })
      const result = await waitForNextCall(mock, before)
      expect(result[0].$lookup?.space?.name).toBe('added-later')

      // Space is a model-domain class in the test model: the fetch goes to the client as is.
      const lookupCall = findAll.mock.calls.find((it) => it[0] === core.class.Space)
      expect(lookupCall?.[1]).toEqual({ _id: space })
      expect(lookupCall?.[2]?.projection).toEqual({ name: 1 })

      await close()
    })

    it('fetches a nested lookup of a document added later with its own fields', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const space = await createSpace(factory, 'nested-later')
      const parent = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'nested-parent'
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'nested-later' },
        {
          lookup: { attachedTo: [test.class.TestComment, { space: core.class.Space }] },
          projection: { '$lookup.attachedTo.message': 1, '$lookup.attachedTo.$lookup.space.name': 1 }
        }
      )
      const before = mock.mock.calls.length
      findAll.mockClear()

      await factory.addCollection(test.class.TestComment, space, parent, test.class.TestComment, 'comments', {
        message: 'nested-later'
      })
      const result = await waitForNextCall(mock, before)
      expect(result[0].$lookup?.attachedTo?.message).toBe('nested-parent')
      expect(result[0].$lookup?.attachedTo?.$lookup?.space?.name).toBe('nested-later')

      const parentCall = findAll.mock.calls.find((it) => it[0] === test.class.TestComment && it[1]._id === parent)
      expect(parentCall?.[2]?.projection).toEqual({
        message: 1,
        '$lookup.space.name': 1,
        _class: 1,
        space: 1,
        modifiedOn: 1
      })
      const spaceCall = findAll.mock.calls.find((it) => it[0] === core.class.Space)
      expect(spaceCall?.[2]?.projection).toEqual({ name: 1 })

      await close()
    })

    it('fetches a reverse lookup of a document added later with the projected fields', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const space = await createSpace(factory, 'reverse-later')
      const parent = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'reverse-parent'
      })
      await factory.addCollection(test.class.TestComment, space, parent, test.class.TestComment, 'comments', {
        message: 'reverse-kid'
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'reverse-parent-2' },
        { lookup: { _id: { kids: test.class.TestComment } }, projection: { '$lookup.kids.message': 1 } }
      )
      const before = mock.mock.calls.length
      findAll.mockClear()

      // A reverse lookup is fetched only for a document whose collection counter is set.
      const second = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'reverse-parent-2',
        kids: 1
      } as any)
      await waitForNextCall(mock, before)

      const kidsCall = findAll.mock.calls.find((it) => it[0] === test.class.TestComment && it[1].attachedTo === second)
      expect(kidsCall?.[2]?.projection).toEqual({ message: 1, _class: 1, space: 1, modifiedOn: 1 })

      await close()
    })

    it('wakes the callback only for a change of a projected lookup field', async () => {
      const { liveQuery, factory, close } = await getClient()
      const space = await createSpace(factory, 'notify')
      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'notify'
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'notify' },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.name': 1 } }
      )
      const before = mock.mock.calls.length

      await factory.updateDoc(core.class.Space, core.space.Model, space, { description: 'changed' })
      await settle()
      expect(mock.mock.calls.length).toBe(before)

      await factory.updateDoc(core.class.Space, core.space.Model, space, { name: 'renamed' })
      const result = await waitForNextCall(mock, before)
      expect(result[0].$lookup?.space?.name).toBe('renamed')
      // The silent change was still applied to the joined document.
      expect(result[0].$lookup?.space?.description).toBe('changed')

      await close()
    })

    it('wakes the callback for any field but the excluded ones', async () => {
      const { liveQuery, factory, close } = await getClient()
      const space = await createSpace(factory, 'notify-exclude')
      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'notify-exclude'
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'notify-exclude' },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.description': 0 } }
      )
      const before = mock.mock.calls.length

      await factory.updateDoc(core.class.Space, core.space.Model, space, { description: 'changed' })
      await settle()
      expect(mock.mock.calls.length).toBe(before)

      await factory.updateDoc(core.class.Space, core.space.Model, space, { name: 'renamed' })
      const result = await waitForNextCall(mock, before)
      expect(result[0].$lookup?.space?.name).toBe('renamed')

      await close()
    })

    it('wakes the callback for every change of a lookup without a projection, as before', async () => {
      const { liveQuery, factory, close } = await getClient()
      const space = await createSpace(factory, 'notify-all')
      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'notify-all'
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: 'notify-all' },
        { lookup: { space: core.class.Space } }
      )
      const before = mock.mock.calls.length

      await factory.updateDoc(core.class.Space, core.space.Model, space, { description: 'changed' })
      const result = await waitForNextCall(mock, before)
      expect(result[0].$lookup?.space?.description).toBe('changed')

      await close()
    })

    it('wakes the callback for a projected field of a reverse lookup element only', async () => {
      const { liveQuery, factory, close } = await getClient()
      const space = await createSpace(factory, 'reverse-notify')
      const parent = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: 'reverse-notify'
      })
      const kid = await factory.addCollection(
        test.class.TestComment,
        space,
        parent,
        test.class.TestComment,
        'comments',
        {
          message: 'kid'
        }
      )

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { _id: parent },
        { lookup: { _id: { kids: test.class.TestComment } }, projection: { '$lookup.kids.message': 1 } }
      )
      const before = mock.mock.calls.length

      await factory.updateCollection(test.class.TestComment, space, kid, parent, test.class.TestComment, 'comments', {
        extra: generateId()
      } as any)
      await settle()
      expect(mock.mock.calls.length).toBe(before)

      await factory.updateCollection(test.class.TestComment, space, kid, parent, test.class.TestComment, 'comments', {
        message: 'kid-renamed'
      })
      const result = await waitForNextCall(mock, before)
      expect((result[0].$lookup as any).kids[0].message).toBe('kid-renamed')

      await close()
    })
  })
})
