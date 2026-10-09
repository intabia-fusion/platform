/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import core, {
  type Attribute,
  type Class,
  ClassifierKind,
  type Doc,
  type DocumentQuery,
  Hierarchy,
  type MeasureContext,
  MeasureMetricsContext,
  ModelDb,
  type Ref,
  type SessionData,
  toFindResult,
  TxFactory
} from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import type { IndexedDoc, Middleware, PipelineContext } from '@hcengineering/server-core'
import { FullTextMiddleware } from '../fulltext'

const ISSUE = 'test:class:Issue' as Ref<Class<Doc>>
const COMMENT = 'test:class:Comment' as Ref<Class<Doc>>

/** An issue with a comments collection. */
function buildHierarchy (): Hierarchy {
  const hierarchy = new Hierarchy()
  const txFactory = new TxFactory(core.account.System)
  const createClass = (_id: Ref<Class<Doc>>, data: Record<string, any>): void => {
    hierarchy.tx(
      txFactory.createTxCreateDoc(
        core.class.Class,
        core.space.Model,
        { label: 'class' as IntlString, kind: ClassifierKind.CLASS, ...data },
        _id
      )
    )
  }
  createClass(core.class.Obj, {})
  createClass(core.class.Doc, { extends: core.class.Obj })
  createClass(core.class.AttachedDoc, { extends: core.class.Doc })
  createClass(ISSUE, { extends: core.class.Doc })
  createClass(COMMENT, { extends: core.class.AttachedDoc })
  hierarchy.tx(
    txFactory.createTxCreateDoc(
      core.class.Attribute,
      core.space.Model,
      {
        attributeOf: ISSUE,
        name: 'comments',
        label: 'comments' as IntlString,
        type: { _class: core.class.Collection, label: 'comments' as IntlString, of: COMMENT } as any
      },
      (ISSUE + '_comments') as Ref<Attribute<any>>
    )
  )
  // The middleware only needs the descendants
  jest.spyOn(hierarchy, 'getBaseClass').mockImplementation((c) => c)
  return hierarchy
}

describe('FullTextMiddleware $searchIn', () => {
  let ctx: MeasureContext<SessionData>
  let findAll: jest.Mock
  let mw: FullTextMiddleware
  let searches: Array<{ classes: Array<Ref<Class<Doc>>>, query: DocumentQuery<Doc> }>
  let addExtraFind: jest.Mock
  let found: IndexedDoc[]
  let foundAttached: IndexedDoc[]

  beforeEach(() => {
    const hierarchy = buildHierarchy()
    findAll = jest.fn(async () => toFindResult([]))
    const next: Middleware = { findAll } as any
    const pipelineContext: PipelineContext = {
      workspace: { uuid: 'ws' as any, url: 'ws', dataId: 'ws' as any },
      hierarchy,
      modelDb: new ModelDb(hierarchy),
      branding: null,
      contextVars: {}
    } as any
    ctx = new MeasureMetricsContext('test', {}) as MeasureContext<SessionData>

    mw = new FullTextMiddleware(pipelineContext, next, 'http://fulltext', 'token')
    searches = []
    // Record what goes to the pod
    jest.spyOn(mw, 'search').mockImplementation(async (ctx, classes, query): Promise<IndexedDoc[]> => {
      searches.push({ classes: classes as Array<Ref<Class<Doc>>>, query: query as DocumentQuery<Doc> })
      return classes.includes(ISSUE) ? found : classes.includes(COMMENT) ? foundAttached : []
    })
    found = [{ id: 'i1', _class: [ISSUE], _score: 1 } as any]
    foundAttached = []
    addExtraFind = jest.fn()
    mw.addExtraFind = addExtraFind
  })

  it('searches the attached documents when $searchIn is not given', async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release' })

    expect(searches.map((it) => it.classes)).toEqual([[ISSUE], [COMMENT]])
    expect(addExtraFind).toHaveBeenCalled()
  })

  it('leaves the attached documents out when $searchIn does not name them', async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release', $searchIn: ['title', 'identifier', 'content'] })

    expect(searches).toHaveLength(1)
    expect(searches[0].classes).toEqual([ISSUE])
    expect(searches[0].query.$searchIn).toEqual(['title', 'identifier', 'content'])
    expect(addExtraFind).not.toHaveBeenCalled()
  })

  it("searches everything, attached documents too, when $searchIn names 'all'", async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release', $searchIn: ['all'] })

    expect(searches.map((it) => it.classes)).toEqual([[ISSUE], [COMMENT]])
    expect(addExtraFind).toHaveBeenCalled()
  })

  it('searches everything, attached documents too, when $searchIn is null', async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release', $searchIn: null as any })

    expect(searches.map((it) => it.classes)).toEqual([[ISSUE], [COMMENT]])
  })

  it("searches the attached documents when $searchIn names 'attached'", async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release', $searchIn: ['title', 'attached'] })

    expect(searches.map((it) => it.classes)).toEqual([[ISSUE], [COMMENT]])
  })

  it('restricts the index to the ids of a re-check, for the documents and their attached ones', async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release', _id: 'i1' as Ref<Doc> })

    expect(searches.map((it) => it.query.$filter)).toEqual([{ id: ['i1'] }, { attachedTo: ['i1'] }])
  })

  it('does not restrict the index by an id list longer than fullTextLimit', async () => {
    // limit 1: fullTextLimit is 100
    const many = Array.from({ length: 101 }, (_, i) => `i${i}` as Ref<Doc>)
    await mw.findAll(ctx, ISSUE, { $search: 'release', _id: { $in: many } }, { limit: 1 })

    expect(searches.map((it) => it.query.$filter)).toEqual([undefined, undefined])
  })

  it('does not restrict the index without known ids', async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release', _id: { $nin: ['i2' as Ref<Doc>] } })

    expect(searches.map((it) => it.query.$filter)).toEqual([undefined, undefined])
  })

  it('does not pass $searchIn on to the database', async () => {
    await mw.findAll(ctx, ISSUE, { $search: 'release', $searchIn: ['title'] })

    expect(findAll).toHaveBeenCalledTimes(1)
    const query = findAll.mock.calls[0][2]
    expect(query).toEqual({ _id: { $in: ['i1'] } })
  })

  it('scores a document by its own best attached match, not by any other', async () => {
    found = [
      { id: 'i1', _class: [ISSUE], _score: 10 },
      { id: 'i2', _class: [ISSUE], _score: 2 }
    ] as any
    foundAttached = [
      { id: 'c1', _class: [COMMENT], _score: 8, attachedTo: 'i2', attachedToClass: ISSUE },
      { id: 'c2', _class: [COMMENT], _score: 3, attachedTo: 'i2', attachedToClass: ISSUE },
      { id: 'c3', _class: [COMMENT], _score: 1, attachedTo: 'i3', attachedToClass: ISSUE }
    ] as any
    findAll.mockImplementation(async (ctx, _class, query) =>
      toFindResult(query._id.$in.map((_id: string) => ({ _id }) as unknown as Doc))
    )

    const result = await mw.findAll(ctx, ISSUE, { $search: 'release', $searchIn: ['title', 'attached'] })

    const scores = Object.fromEntries(result.map((it) => [it._id, it.$source?.$score]))
    expect(scores).toEqual({ i1: 10, i2: 8, i3: 1 })
  })

  it('keeps $searchIn away from the database without a search', async () => {
    await mw.findAll(ctx, ISSUE, { $searchIn: ['title'], space: 'sp' as any })

    expect(findAll).toHaveBeenCalledTimes(1)
    expect(findAll.mock.calls[0][2]).toEqual({ space: 'sp' })
  })
})
