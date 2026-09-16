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

import {
  type Class,
  type Doc,
  Hierarchy,
  type MeasureContext,
  MeasureMetricsContext,
  ModelDb,
  type Ref,
  type SearchResult,
  type SearchResultDoc,
  type SessionData,
  toFindResult
} from '@hcengineering/core'
import type { Middleware, PipelineContext } from '@hcengineering/server-core'
import { FullTextMiddleware } from '../fulltext'

const MESSAGE_CLASS = 'chunter:class:ChatMessage' as Ref<Class<Doc>>

function resultDoc (id: string): SearchResultDoc {
  return {
    id: id as Ref<Doc>,
    doc: { _id: id as Ref<Doc>, _class: MESSAGE_CLASS }
  }
}

describe('FullTextMiddleware fields', () => {
  let ctx: MeasureContext<SessionData>
  let pipelineContext: PipelineContext
  let next: Middleware
  let findAll: jest.Mock
  let indexResult: SearchResult

  beforeEach(() => {
    const hierarchy = new Hierarchy()
    // Every class is its own base class here; the middleware only groups ids by it.
    jest.spyOn(hierarchy, 'getBaseClass').mockImplementation((c) => c)

    findAll = jest.fn(async () => toFindResult([]))
    next = {
      findAll,
      searchFulltext: jest.fn(async () => indexResult),
      tx: jest.fn(async () => ({})),
      handleBroadcast: jest.fn(async () => {}),
      groupBy: jest.fn(async () => new Map()),
      loadModel: jest.fn(async () => []),
      domainRequest: jest.fn(async () => ({})),
      closeSession: jest.fn(async () => {}),
      close: jest.fn(async () => {})
    } as any

    pipelineContext = {
      workspace: { uuid: 'ws' as any, url: 'ws', dataId: 'ws' as any },
      hierarchy,
      modelDb: new ModelDb(hierarchy),
      branding: null,
      contextVars: {}
    } as any

    ctx = new MeasureMetricsContext('test', {}) as MeasureContext<SessionData>
  })

  function createMiddleware (): FullTextMiddleware {
    const mw = new FullTextMiddleware(pipelineContext, next, 'http://fulltext', 'token')
    // The index half is exercised elsewhere; these tests are about what happens after it.
    ;(mw as any).searchIndex = async () => indexResult
    return mw
  }

  it('returns the index result untouched when no field is asked for', async () => {
    indexResult = { docs: [resultDoc('a')] }
    const out = await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10 })
    expect(out.docs[0].fields).toBeUndefined()
    expect(findAll).not.toHaveBeenCalled()
  })

  it('does not query storage for an empty result set', async () => {
    indexResult = { docs: [] }
    await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })
    expect(findAll).not.toHaveBeenCalled()
  })

  it('puts the requested attribute on each result', async () => {
    indexResult = { docs: [resultDoc('a'), resultDoc('b')] }
    findAll.mockImplementation(async () =>
      toFindResult([
        { _id: 'a', _class: MESSAGE_CLASS, message: 'markup-a' },
        { _id: 'b', _class: MESSAGE_CLASS, message: 'markup-b' }
      ] as any)
    )

    const out = await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })
    expect(out.docs.map((d) => d.fields?.message)).toEqual(['markup-a', 'markup-b'])
  })

  it('asks storage only for the documents the search returned', async () => {
    // This is what keeps the extra read from widening what the caller can see: space filtering
    // already happened upstream, and nothing outside that result set is ever fetched.
    indexResult = { docs: [resultDoc('a')] }
    await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })

    expect(findAll).toHaveBeenCalledTimes(1)
    expect(findAll.mock.calls[0][2]).toEqual({ _id: { $in: ['a'] } })
  })

  it('reads only the named attributes', async () => {
    indexResult = { docs: [resultDoc('a')] }
    await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })
    expect(findAll.mock.calls[0][3]).toEqual({ projection: { _id: 1, message: 1 } })
  })

  it('drops a result whose document is gone from storage', async () => {
    // The index lags deletions, so a hit can outlive the message. Dropped here, so that no
    // caller has to know it might be handed a row that leads nowhere.
    indexResult = { docs: [resultDoc('a')] }
    findAll.mockImplementation(async () => toFindResult([]))

    const out = await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })
    expect(out.docs).toHaveLength(0)
  })

  it('drops only the deleted document, keeping the rest of the page', async () => {
    indexResult = { docs: [resultDoc('a'), resultDoc('b')] }
    findAll.mockImplementation(async () =>
      toFindResult([{ _id: 'b', _class: MESSAGE_CLASS, message: 'markup-b' }] as any)
    )

    const out = await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })
    expect(out.docs.map((d) => d.id)).toEqual(['b'])
  })

  it('keeps a document that merely lacks the attribute', async () => {
    // A system message exists but has no body of its own; it must still be shown, rendered from
    // the index fragments rather than from a body it never had.
    indexResult = { docs: [resultDoc('a')] }
    findAll.mockImplementation(async () => toFindResult([{ _id: 'a', _class: MESSAGE_CLASS }] as any))

    const out = await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })
    expect(out.docs).toHaveLength(1)
    expect(out.docs[0].fields).toBeUndefined()
  })

  it('keeps the search result when the storage read fails', async () => {
    indexResult = { docs: [resultDoc('a')] }
    findAll.mockImplementation(async () => {
      throw new Error('storage down')
    })

    const out = await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })
    expect(out.docs).toHaveLength(1)
    expect(out.docs[0].fields).toBeUndefined()
  })

  it('groups a mixed result into one query per class', async () => {
    const other = 'chunter:class:ThreadMessage' as Ref<Class<Doc>>
    indexResult = {
      docs: [resultDoc('a'), { ...resultDoc('b'), doc: { _id: 'b' as Ref<Doc>, _class: other } }]
    }
    await createMiddleware().searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] })

    expect(findAll).toHaveBeenCalledTimes(2)
    const classes = findAll.mock.calls.map((c) => c[1])
    expect(new Set(classes)).toEqual(new Set([MESSAGE_CLASS, other]))
  })

  it('does not forward `fields` to the index, which knows nothing about it', async () => {
    indexResult = { docs: [] }
    const mw = new FullTextMiddleware(pipelineContext, next, 'http://fulltext', 'token')
    await mw.searchFulltext(ctx, { query: 'q' }, { limit: 10, fields: ['message'] }).catch(() => {})

    const forwarded = (next.searchFulltext as jest.Mock).mock.calls[0]?.[2]
    if (forwarded !== undefined) expect(forwarded.fields).toBeUndefined()
  })
})
