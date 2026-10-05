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
import core, { MeasureMetricsContext, type Doc, type Ref, type Tx, toFindResult } from '@hcengineering/core'
import { type Middleware, type PipelineContext } from '@hcengineering/server-core'
import { PrivateMiddleware } from '../private'

const PREF = 'preference:class:Pref' as Ref<any>

function tx (id: string, createdBy: string, objectClass: Ref<any>): Tx {
  return { _id: id, _class: core.class.TxCreateDoc, createdBy, objectClass } as unknown as Tx
}

describe('PrivateMiddleware.findAll', () => {
  it('drops foreign preference txes from the tx domain result', async () => {
    const own = tx('own', 'me', PREF)
    const foreign = tx('foreign', 'other', PREF)
    const unrelated = tx('unrelated', 'other', 'x:class:Other' as Ref<any>)
    const context = {
      hierarchy: {
        getDomain: () => 'tx',
        getDescendants: () => [PREF],
        findDomain: (c: Ref<any>) => (c === PREF ? 'preference' : 'other')
      }
    } as unknown as PipelineContext
    const next = {
      findAll: async () => toFindResult([own, foreign, unrelated] as unknown as Doc[], 7)
    } as unknown as Middleware
    const ctx = new MeasureMetricsContext('test', {})
    ;(ctx as any).contextData = { account: { uuid: 'u1', socialIds: ['me'] } }
    const mw = await PrivateMiddleware.create(ctx, context, next)

    const res = await mw.findAll(ctx as any, core.class.Tx, {})

    expect(res.map((p) => p._id)).toEqual(['own', 'unrelated'])
    expect(res.total).toBe(6)
  })

  it('keeps total -1 when total was not requested', async () => {
    const context = {
      hierarchy: {
        getDomain: () => 'tx',
        getDescendants: () => [PREF],
        findDomain: (c: Ref<any>) => (c === PREF ? 'preference' : 'other')
      }
    } as unknown as PipelineContext
    const next = {
      findAll: async () => toFindResult([tx('foreign', 'other', PREF)] as unknown as Doc[], -1)
    } as unknown as Middleware
    const ctx = new MeasureMetricsContext('test', {})
    ;(ctx as any).contextData = { account: { uuid: 'u1', socialIds: ['me'] } }
    const mw = await PrivateMiddleware.create(ctx, context, next)

    const res = await mw.findAll(ctx as any, core.class.Tx, {})

    expect(res).toHaveLength(0)
    expect(res.total).toBe(-1)
  })
})
