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
  AccountRole,
  MeasureMetricsContext,
  type AccountUuid,
  type Class,
  type Doc,
  type Ref,
  type Space,
  toFindResult
} from '@hcengineering/core'
import { type Middleware, type PipelineContext } from '@hcengineering/server-core'
import { SpaceSecurityMiddleware } from '../spaceSecurity'

const me = 'me' as AccountUuid
const mine = 'space-mine' as Ref<Space>
const foreign = 'space-foreign' as Ref<Space>
const readStateClass = 'notification:class:ReadState' as Ref<Class<Doc>>

// The joined documents reach the filter as the adapter projects them: `_id`, `_class` and `space`
// always come, the rest only when the lookup projection lists it.
function joined (id: string, space: Ref<Space> | undefined): Doc {
  return { _id: id as Ref<Doc>, _class: readStateClass, space, latestMessageTimestamp: 1 } as unknown as Doc
}

async function middleware (rows: Doc[]): Promise<{ mw: any, ctx: MeasureMetricsContext }> {
  const context = {
    hierarchy: {
      isDerived: (a: Ref<Class<Doc>>, b: Ref<Class<Doc>>) => a === b,
      getDomain: () => 'space'
    }
  } as unknown as PipelineContext
  const next = { findAll: async () => toFindResult(rows, rows.length) } as unknown as Middleware
  const ctx = new MeasureMetricsContext('test', {})
  ctx.contextData = { account: { uuid: me, role: AccountRole.User } } as any
  const mw: any = await SpaceSecurityMiddleware.create(ctx, context, next)
  mw.wasInit = true
  for (const [space, members] of [
    [mine, [me]],
    [foreign, []]
  ] as const) {
    mw.spacesMap.set(space, {
      _id: space,
      _class: core.class.Space,
      members: new Set(members),
      owners: new Set(),
      private: true,
      archived: false,
      autoJoin: false,
      systemCreated: false
    })
  }
  return { mw, ctx }
}

describe('SpaceSecurityMiddleware lookup filter', () => {
  it('keeps a projected joined document by its space and drops one of a foreign space', async () => {
    const rows = [
      { _id: 'a', _class: 'chunter:class:Chat', space: mine, $lookup: { readState: joined('rs-a', mine) } },
      { _id: 'b', _class: 'chunter:class:Chat', space: mine, $lookup: { readState: joined('rs-b', foreign) } }
    ] as unknown as Doc[]
    const { mw, ctx } = await middleware(rows)

    const result = await mw.findAll(ctx, 'chunter:class:Chat', {}, { lookup: { readState: readStateClass } })

    expect(result[0].$lookup.readState).toEqual(joined('rs-a', mine))
    expect(result[1].$lookup.readState).toBeUndefined()
  })

  it('drops a joined document that comes without a space, so the projection must keep it', async () => {
    const rows = [
      { _id: 'a', _class: 'chunter:class:Chat', space: mine, $lookup: { readState: joined('rs-a', undefined) } }
    ] as unknown as Doc[]
    const { mw, ctx } = await middleware(rows)

    const result = await mw.findAll(ctx, 'chunter:class:Chat', {}, { lookup: { readState: readStateClass } })

    expect(result[0].$lookup.readState).toBeUndefined()
  })

  it('keeps a joined space by its own id, and an array of joined documents by each space', async () => {
    const rows = [
      {
        _id: 'a',
        _class: 'chunter:class:Chat',
        space: mine,
        $lookup: {
          attachedTo: { _id: mine, _class: core.class.Space, space: core.space.Space },
          comments: [joined('c-1', mine), joined('c-2', foreign)]
        }
      }
    ] as unknown as Doc[]
    const { mw, ctx } = await middleware(rows)

    const result = await mw.findAll(
      ctx,
      'chunter:class:Chat',
      {},
      { lookup: { attachedTo: core.class.Space, _id: { comments: readStateClass } } }
    )

    expect(result[0].$lookup.attachedTo._id).toBe(mine)
    expect(result[0].$lookup.comments.map((it: Doc) => it._id)).toEqual(['c-1'])
  })
})
