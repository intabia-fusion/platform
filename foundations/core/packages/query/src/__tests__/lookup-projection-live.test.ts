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
  SortingOrder,
  TxOperations,
  type Class,
  type Doc,
  type Ref,
  type Space
} from '@hcengineering/core'
import { LiveQuery } from '..'
import { lookupFields, touchedAttributes, txTouchesProjected, withLiveQueryFields } from '../projection'
import { connect } from './connection'
import { test, type AttachedComment, type TestMixin } from './minmodel'

// A live query sorted or filtered through `$lookup.` keys with a projection of the join: the order
// follows a change of the joined document, a changed reference fetches the new document with the
// projected fields, a reverse join tells about its members coming and going whatever the projection,
// and the plain `findAll`/`findOne` hand the projection to the storage as it is.
describe('LiveQuery lookup projection, live', () => {
  describe('helpers', () => {
    it('reads an empty projection as an inclusion of the live query fields', () => {
      expect(withLiveQueryFields({})).toEqual({ _class: 1, space: 1, modifiedOn: 1 })
    })

    it('keeps a base exclusion next to lookup keys', () => {
      expect(withLiveQueryFields({ description: 0, '$lookup.space.name': 1 })).toEqual({
        description: 0,
        '$lookup.space.name': 1
      })
      // An exclusion of the live query fields next to lookup keys: only the lookup keys remain.
      expect(withLiveQueryFields({ modifiedOn: 0, '$lookup.space.name': 1 })).toEqual({ '$lookup.space.name': 1 })
    })

    it('reads a nested jsonb path as one field', () => {
      expect(lookupFields({ '$lookup.space.icon.asset': 1 }, '', 'space')).toEqual({
        fields: new Set(['icon.asset']),
        exclude: false
      })
      const fields = lookupFields({ '$lookup.space.icon.asset': 1 }, '', 'space')
      const tx = (operations: any): any => ({ _class: core.class.TxUpdateDoc, operations })
      // A change of the whole key or of the nested path alike touches the projected field.
      expect(txTouchesProjected(fields as any, tx({ icon: { asset: 'x' } }))).toBe(true)
      expect(txTouchesProjected(fields as any, tx({ 'icon.asset': 'x' }))).toBe(true)
      expect(txTouchesProjected(fields as any, tx({ 'icon.emoji': 1 }))).toBe(false)
    })

    it('reads operators and mixins of a tx against the projected fields', () => {
      const include = { fields: new Set(['members', 'count']), exclude: false }
      const tx = (operations: any): any => ({ _class: core.class.TxUpdateDoc, operations })
      expect(txTouchesProjected(include, tx({ $push: { members: 'a' } }))).toBe(true)
      expect(txTouchesProjected(include, tx({ $inc: { count: 1 } }))).toBe(true)
      expect(txTouchesProjected(include, tx({ $pull: { tags: 'a' } }))).toBe(false)
      expect(txTouchesProjected(include, tx({ $unset: { members: '' } }))).toBe(true)

      const mixin = { _class: core.class.TxMixin, mixin: test.mixin.TestMixin, attributes: { arr: ['x'] } } as any
      expect(txTouchesProjected({ fields: new Set(['arr']), exclude: false }, mixin)).toBe(true)
      expect(txTouchesProjected({ fields: new Set([`${test.mixin.TestMixin}.arr`]), exclude: false }, mixin)).toBe(true)
      expect(txTouchesProjected({ fields: new Set(['name']), exclude: false }, mixin)).toBe(false)
      expect(txTouchesProjected({ fields: new Set(['arr']), exclude: true }, mixin)).toBe(false)
      // The projection in the mixin spelling, the tx in both: still the same attribute.
      expect(txTouchesProjected({ fields: new Set([`${test.mixin.TestMixin}.arr`]), exclude: true }, mixin)).toBe(false)
      expect(txTouchesProjected({ fields: new Set([`${test.mixin.TestMixin}.name`]), exclude: true }, mixin)).toBe(true)
      const prefixed = { _class: core.class.TxUpdateDoc, operations: { [`${test.mixin.TestMixin}.arr`]: [] } } as any
      expect(txTouchesProjected({ fields: new Set(['arr']), exclude: false }, prefixed)).toBe(true)
      expect(txTouchesProjected({ fields: new Set(['arr']), exclude: true }, prefixed)).toBe(false)
      expect(touchedAttributes({ _class: core.class.TxUpdateDoc } as any)).toEqual([])
    })
  })

  describe('with a live query', () => {
    async function getClient (): Promise<{
      liveQuery: LiveQuery
      factory: TxOperations
      findAll: jest.Mock
      findOne: jest.Mock
      close: () => Promise<void>
    }> {
      const storage = await createClient(connect)
      const originalAll = storage.findAll.bind(storage)
      const findAll = jest.fn(
        async (_class: any, query: any, options: any) => await originalAll(_class, query, options)
      )
      storage.findAll = findAll as any
      const originalOne = storage.findOne.bind(storage)
      const findOne = jest.fn(
        async (_class: any, query: any, options: any) => await originalOne(_class, query, options)
      )
      storage.findOne = findOne as any
      const liveQuery = new LiveQuery(storage)
      storage.notify = (...tx) => {
        void liveQuery.tx(...tx)
      }
      return {
        liveQuery,
        factory: new TxOperations(storage, core.account.System),
        findAll,
        findOne,
        close: async () => {
          await liveQuery.close()
        }
      }
    }

    // Every read of `_class` by `_id`, through findAll or findOne, with the projection it carried.
    function readsOf (mocks: jest.Mock[], _class: Ref<Class<Doc>>, _id: Ref<Doc>): any[] {
      return mocks
        .flatMap((mock) => mock.mock.calls)
        .filter((it) => it[0] === _class && (it[1]._id === _id || it[1]._id?.$in?.includes(_id) === true))
        .map((it) => it[2]?.projection)
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

    async function createProject (factory: TxOperations, prjName: string): Promise<Ref<Space>> {
      return await factory.createDoc(test.class.TestProject, core.space.Model, {
        name: prjName,
        prjName,
        description: 'initial',
        private: false,
        members: [],
        archived: false
      })
    }

    it('re-sorts by a projected lookup field when the joined document changes', async () => {
      const { liveQuery, factory, close } = await getClient()
      const tag = 'sort-' + Date.now()
      const first = await createSpace(factory, 'a-first')
      const second = await createSpace(factory, 'b-second')
      const one = await factory.addCollection(test.class.TestComment, first, first, core.class.Space, 'comments', {
        message: tag
      })
      const two = await factory.addCollection(test.class.TestComment, second, second, core.class.Space, 'comments', {
        message: tag
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag },
        {
          lookup: { space: core.class.Space },
          projection: { '$lookup.space.name': 1 },
          sort: { '$lookup.space.name': SortingOrder.Descending }
        }
      )
      expect(mock.mock.calls[0][0].map((it: Doc) => it._id)).toEqual([two, one])
      const before = mock.mock.calls.length

      // The first space now sorts above the second: the callback brings the new order.
      await factory.updateDoc(core.class.Space, core.space.Model, first, { name: 'z-first' })
      const result = await waitForNextCall(mock, before)
      expect(result.map((it: Doc) => it._id)).toEqual([one, two])
      expect(result[0].$lookup?.space?.name).toBe('z-first')

      // A field the projection leaves out changes nothing, the order included.
      await factory.updateDoc(core.class.Space, core.space.Model, second, { description: 'other' })
      await settle()
      expect(mock.mock.calls.length).toBe(before + 1)

      await close()
    })

    it('places a document that starts matching after an update by the lookup sort', async () => {
      const { liveQuery, factory, close } = await getClient()
      const tag = 'match-' + Date.now()
      const low = await createSpace(factory, 'a-low')
      const mid = await createSpace(factory, 'm-mid')
      const high = await createSpace(factory, 'z-high')
      const first = await factory.addCollection(test.class.TestComment, high, high, core.class.Space, 'comments', {
        message: tag
      })
      const second = await factory.addCollection(test.class.TestComment, low, low, core.class.Space, 'comments', {
        message: tag
      })
      const later = await factory.addCollection(test.class.TestComment, mid, mid, core.class.Space, 'comments', {
        message: 'not yet'
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag },
        {
          lookup: { space: core.class.Space },
          projection: { '$lookup.space.name': 1 },
          sort: { '$lookup.space.name': SortingOrder.Descending }
        }
      )
      expect(mock.mock.calls[0][0].map((it: Doc) => it._id)).toEqual([first, second])
      const before = mock.mock.calls.length

      // The update touches `message` only, not the sort key: the document still lands in its place.
      await factory.updateDoc(test.class.TestComment, mid, later, { message: tag })
      const result = await waitForNextCall(mock, before)
      expect(result.map((it: Doc) => it._id)).toEqual([first, later, second])

      await close()
    })

    it('brings a document into a full window when its joined sort field passes the edge, by one request', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const tag = 'window-' + Date.now()
      const space = await createSpace(factory, 'space')
      const project = await createProject(factory, 'project')
      // Replies to comments make the window, sorted by the message of the comment they answer.
      const comment = async (
        message: string,
        on: Ref<Space> = space,
        onClass = core.class.Space
      ): Promise<Ref<AttachedComment>> =>
        await factory.addCollection(test.class.TestComment, space, on, onClass, 'comments', { message })
      const reply = async (to: Ref<AttachedComment>): Promise<Ref<AttachedComment>> =>
        await factory.addCollection(test.class.TestComment, space, to, test.class.TestComment, 'replies', {
          message: tag
        })
      const retitle = async (
        of: Ref<AttachedComment>,
        message: string,
        on: Ref<Space> = space,
        onClass = core.class.Space
      ): Promise<void> => {
        await factory.updateCollection(test.class.TestComment, space, of, on, onClass, 'comments', { message })
      }
      const low = await comment('a-low')
      const high = await comment('b-high')
      const foreign = await comment('c-foreign', project, test.class.TestProject)
      const one = await reply(low)
      const two = await reply(high)
      await reply(foreign)
      // The requests for the replies of a comment: what a window asks the server when one may enter.
      const asked = (of: Ref<AttachedComment>): number =>
        findAll.mock.calls.filter((it) => it[1].attachedTo === of).length

      const query = { message: tag, '$lookup.attachedTo.attachedToClass': { $in: [core.class.Space] } }
      const options = {
        lookup: { attachedTo: test.class.TestComment },
        projection: { '$lookup.attachedTo.message': 1 },
        sort: { '$lookup.attachedTo.message': SortingOrder.Descending },
        limit: 1
      }
      const { mock } = await subscribe(liveQuery, test.class.TestComment, query, options)
      expect(mock.mock.calls[0][0].map((it: Doc) => it._id)).toEqual([two])

      // The comment of the reply outside the window now sorts first: its replies are asked for once,
      // the matching one comes in, the window keeps its size.
      let before = mock.mock.calls.length
      await retitle(low, 'z-low')
      let result = await waitForNextCall(mock, before)
      expect(result.map((it: Doc) => it._id)).toEqual([one])
      expect(asked(low)).toBe(1)

      // A comment on another class, told by the tx: no reply of it can match, no request.
      before = mock.mock.calls.length
      await retitle(foreign, 'zz-foreign', project, test.class.TestProject)
      await settle()
      expect(asked(foreign)).toBe(0)
      expect(mock.mock.calls.length).toBe(before)

      // The same by a tx that does not name the parent: asked, and the answer matches nothing.
      await factory.updateDoc(test.class.TestComment, space, foreign, { message: 'zzz-foreign' })
      await settle()
      expect(asked(foreign)).toBe(1)
      expect(mock.mock.calls.length).toBe(before)

      // A value that stays beyond the edge of the window cannot bring a reply in: no request.
      await retitle(high, 'a-high')
      await settle()
      expect(asked(high)).toBe(0)
      expect(mock.mock.calls.length).toBe(before)

      // Two windows of the same query and joins, sorted apart: one request serves both.
      const twin = await subscribe(liveQuery, test.class.TestComment, query, {
        ...options,
        sort: { ...options.sort, _id: SortingOrder.Ascending }
      })
      expect(twin.mock.mock.calls[0][0].map((it: Doc) => it._id)).toEqual([one])
      before = mock.mock.calls.length
      const twinBefore = twin.mock.mock.calls.length
      await retitle(high, 'zz-high')
      result = await waitForNextCall(mock, before)
      expect(result.map((it: Doc) => it._id)).toEqual([two])
      result = await waitForNextCall(twin.mock, twinBefore)
      expect(result.map((it: Doc) => it._id)).toEqual([two])
      expect(asked(high)).toBe(1)

      // The joined document of the window itself is patched in place, without a request.
      before = mock.mock.calls.length
      await retitle(high, 'zzz-high')
      result = await waitForNextCall(mock, before)
      expect(result[0].$lookup?.attachedTo?.message).toBe('zzz-high')
      expect(asked(high)).toBe(1)

      await close()
    })

    it('asks the server again when a joined field the query filters by changes', async () => {
      const { liveQuery, factory, close } = await getClient()
      const tag = 'filter-' + Date.now()
      const first = await createSpace(factory, 'a-first')
      const second = await createSpace(factory, 'b-second')
      const one = await factory.addCollection(test.class.TestComment, first, first, core.class.Space, 'comments', {
        message: tag
      })
      const two = await factory.addCollection(test.class.TestComment, second, second, core.class.Space, 'comments', {
        message: tag
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag, '$lookup.space.archived': { $ne: true } },
        {
          lookup: { space: core.class.Space },
          projection: { '$lookup.space.name': 1 },
          sort: { '$lookup.space.name': SortingOrder.Ascending }
        }
      )
      expect(mock.mock.calls[0][0].map((it: Doc) => it._id)).toEqual([one, two])

      // Archived: out of the result; back when unarchived.
      let before = mock.mock.calls.length
      await factory.updateDoc(core.class.Space, core.space.Model, first, { archived: true })
      let result = await waitForNextCall(mock, before)
      expect(result.map((it: Doc) => it._id)).toEqual([two])

      before = mock.mock.calls.length
      await factory.updateDoc(core.class.Space, core.space.Model, first, { archived: false })
      result = await waitForNextCall(mock, before)
      expect(result.map((it: Doc) => it._id)).toEqual([one, two])

      // A joined field the query does not filter by is applied in place, as before.
      before = mock.mock.calls.length
      await factory.updateDoc(core.class.Space, core.space.Model, second, { name: 'c-second' })
      result = await waitForNextCall(mock, before)
      expect(result[1].$lookup?.space?.name).toBe('c-second')

      await close()
    })

    it('fetches a newly referenced document with the projected fields', async () => {
      const { liveQuery, factory, findAll, findOne, close } = await getClient()
      const tag = 'ref-' + Date.now()
      const from = await createSpace(factory, 'from')
      const to = await createSpace(factory, 'to')
      const comment = await factory.addCollection(test.class.TestComment, from, from, core.class.Space, 'comments', {
        message: tag
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag },
        { lookup: { attachedTo: core.class.Space }, projection: { '$lookup.attachedTo.name': 1 } }
      )
      expect(mock.mock.calls[0][0][0].$lookup?.attachedTo?.name).toBe('from')
      const before = mock.mock.calls.length
      // A tx of the same millisecond as the document is read back whole instead of patched
      await settle()
      findAll.mockClear()
      findOne.mockClear()

      await factory.updateCollection(test.class.TestComment, from, comment, from, core.class.Space, 'comments', {
        attachedTo: to
      } as any)
      const result = await waitForNextCall(mock, before)
      expect(result[0].$lookup?.attachedTo?._id).toBe(to)
      expect(result[0].$lookup?.attachedTo?.name).toBe('to')
      // Space is a model-domain class in the test model: the fetch goes to the client as is.
      expect(readsOf([findAll, findOne], core.class.Space, to)).toContainEqual({ name: 1 })

      await close()
    })

    it('fetches the documents pushed into a reference array with the projected fields', async () => {
      const { liveQuery, factory, findAll, findOne, close } = await getClient()
      const holderSpace = await createSpace(factory, 'holder')
      const p1 = await createProject(factory, 'Project One')
      const p2 = await createProject(factory, 'Project Two')
      const holder = await factory.createDoc(test.class.ParticipantsHolder, holderSpace, { participants: [] })

      const { mock } = await subscribe(
        liveQuery,
        test.class.ParticipantsHolder,
        { _id: holder },
        { lookup: { participants: test.class.TestProject }, projection: { '$lookup.participants.prjName': 1 } }
      )
      const before = mock.mock.calls.length
      await settle()
      findAll.mockClear()
      findOne.mockClear()

      await factory.updateDoc(test.class.ParticipantsHolder, holderSpace, holder, {
        $push: { participants: [p1, p2] }
      } as any)
      const result = await waitForNextCall(mock, before)
      const names = (result[0].$lookup?.participants ?? []).map((d: any) => d.prjName).sort()
      expect(names).toEqual(['Project One', 'Project Two'])

      // TestProject lives in a data domain: the live query adds its own fields to the inclusion.
      expect(readsOf([findAll, findOne], test.class.TestProject, p2)).toContainEqual({
        prjName: 1,
        _class: 1,
        space: 1,
        modifiedOn: 1
      })

      await close()
    })

    it('joins every reference of an array field of a document added later, with the projected fields', async () => {
      const { liveQuery, factory, findAll, findOne, close } = await getClient()
      const holderSpace = await createSpace(factory, 'holder-array')
      const p1 = await createProject(factory, 'Array One')
      const p2 = await createProject(factory, 'Array Two')

      const { mock } = await subscribe(
        liveQuery,
        test.class.ParticipantsHolder,
        { space: holderSpace },
        { lookup: { participants: test.class.TestProject }, projection: { '$lookup.participants.prjName': 1 } }
      )
      const before = mock.mock.calls.length
      findAll.mockClear()
      findOne.mockClear()

      await factory.createDoc(test.class.ParticipantsHolder, holderSpace, { participants: [p1, p2] })
      const result = await waitForNextCall(mock, before)
      const names = (result[0].$lookup?.participants ?? []).map((d: any) => d.prjName).sort()
      expect(names).toEqual(['Array One', 'Array Two'])
      // One read for the whole array, with the projection.
      expect(readsOf([findAll, findOne], test.class.TestProject, p1)).toEqual([
        { prjName: 1, _class: 1, space: 1, modifiedOn: 1 }
      ])

      await close()
    })

    it('joins an array field through the in-memory model of the initial result too', async () => {
      const { liveQuery, factory, close } = await getClient()
      const holderSpace = await createSpace(factory, 'holder-initial')
      const p1 = await createProject(factory, 'Initial One')
      const holder = await factory.createDoc(test.class.ParticipantsHolder, holderSpace, { participants: [p1] })

      const bySpace = await subscribe(
        liveQuery,
        test.class.ParticipantsHolder,
        { space: holderSpace },
        { lookup: { participants: test.class.TestProject } }
      )
      expect((bySpace.mock.mock.calls[0][0][0].$lookup?.participants ?? []).map((d: any) => d.prjName)).toEqual([
        'Initial One'
      ])
      const { mock } = await subscribe(
        liveQuery,
        test.class.ParticipantsHolder,
        { _id: holder },
        { lookup: { participants: test.class.TestProject } }
      )
      const names = (mock.mock.calls[0][0][0].$lookup?.participants ?? []).map((d: any) => d.prjName)
      expect(names).toEqual(['Initial One'])

      await close()
    })

    it('tells about a member of a reverse lookup coming and going, whatever the projection', async () => {
      const { liveQuery, factory, close } = await getClient()
      const tag = 'members-' + Date.now()
      const space = await createSpace(factory, tag)
      const parent = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: tag
      })

      const { mock } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { _id: parent },
        { lookup: { _id: { kids: test.class.TestComment } }, projection: { '$lookup.kids.message': 1 } }
      )
      let before = mock.mock.calls.length

      const kid = await factory.addCollection(
        test.class.TestComment,
        space,
        parent,
        test.class.TestComment,
        'comments',
        {
          message: 'kid',
          extra: 'not projected'
        } as any
      )
      let result = await waitForNextCall(mock, before)
      expect((result[0].$lookup as any).kids.map((it: Doc) => it._id)).toEqual([kid])
      before = mock.mock.calls.length

      await factory.removeCollection(test.class.TestComment, space, kid, parent, test.class.TestComment, 'comments')
      result = await waitForNextCall(mock, before)
      expect((result[0].$lookup as any).kids).toHaveLength(0)

      await close()
    })

    it('wakes the callback for a mixin change of a projected mixin field only', async () => {
      const { liveQuery, factory, close } = await getClient()
      const tag = 'mixin-' + Date.now()
      const space = await createSpace(factory, tag)
      await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: tag
      })

      const byName = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.name': 1 } }
      )
      const byArr = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.arr': 1 } }
      )
      const nameBefore = byName.mock.mock.calls.length
      const arrBefore = byArr.mock.mock.calls.length

      await factory.createMixin<Doc, TestMixin>(space, core.class.Space, core.space.Model, test.mixin.TestMixin, {
        arr: ['x']
      })
      const result = await waitForNextCall(byArr.mock, arrBefore)
      expect(result[0].$lookup?.space?.[test.mixin.TestMixin]?.arr).toEqual(['x'])
      await settle()
      expect(byName.mock.mock.calls.length).toBe(nameBefore)

      await close()
    })

    it('keeps projected documents out of the cache the other queries read from', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const tag = 'cache-' + Date.now()
      const space = await createSpace(factory, tag)
      const comment = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: tag
      })

      // A projected live query and a projected findAll: the storage cuts their joined documents.
      const { unsubscribe } = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.name': 1 } }
      )
      await liveQuery.findAll(
        test.class.TestComment,
        { message: tag },
        { lookup: { space: core.class.Space }, projection: { message: 1, '$lookup.space.name': 1 } }
      )

      // The cut joins feed no other read: the space and the comment with its join come from the
      // server, whole.
      findAll.mockClear()
      const whole = await liveQuery.findOne(core.class.Space, { _id: space })
      expect(whole?.description).toBe('initial')
      const joined = await liveQuery.findOne(
        test.class.TestComment,
        { _id: comment },
        { lookup: { space: core.class.Space } }
      )
      expect(joined?.$lookup?.space?.description).toBe('initial')
      expect(findAll.mock.calls.map((it) => it[0])).toEqual(
        expect.arrayContaining([core.class.Space, test.class.TestComment])
      )

      // The base document is whole, so a read that asks for no join takes it from the cache, joins stripped.
      findAll.mockClear()
      const bare = await liveQuery.findOne(test.class.TestComment, { _id: comment })
      expect(bare?.message).toBe(tag)
      expect(bare).not.toHaveProperty('$lookup')
      expect(findAll).not.toHaveBeenCalled()

      // An unprojected live query does not take over the projected one's result either.
      const full = await subscribe(
        liveQuery,
        test.class.TestComment,
        { message: tag },
        { lookup: { space: core.class.Space } }
      )
      expect(full.mock.mock.calls[0][0][0].$lookup?.space?.description).toBe('initial')
      full.unsubscribe()
      unsubscribe()

      await close()
    })

    it('hands the projection of a plain findAll and findOne to the storage as it is', async () => {
      const { liveQuery, factory, findAll, close } = await getClient()
      const tag = 'plain-' + Date.now()
      const space = await createSpace(factory, tag)
      const comment = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
        message: tag
      })
      findAll.mockClear()

      const docs = await liveQuery.findAll(
        test.class.TestComment,
        { message: tag },
        { lookup: { space: core.class.Space }, projection: { '$lookup.space.name': 1 } }
      )
      expect(docs[0].$lookup?.space?.name).toBe(tag)
      const all = findAll.mock.calls.find((it) => it[0] === test.class.TestComment)
      expect(all?.[2]?.projection).toEqual({ '$lookup.space.name': 1 })

      findAll.mockClear()
      const one = await liveQuery.findOne(
        test.class.TestComment,
        { _id: comment },
        { lookup: { space: core.class.Space }, projection: { message: 1, '$lookup.space.name': 1 } }
      )
      expect(one?.$lookup?.space?.name).toBe(tag)
      const single = findAll.mock.calls.find((it) => it[0] === test.class.TestComment)
      expect(single?.[2]?.projection).toEqual({
        message: 1,
        '$lookup.space.name': 1,
        _class: 1,
        space: 1,
        modifiedOn: 1
      })
      expect(single?.[2]?.limit).toBe(1)

      await close()
    })
  })
})
