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
import core, { MeasureMetricsContext, type Ref, type Space, type Tx } from '@hcengineering/core'
import { type PipelineContext } from '@hcengineering/server-core'
import { SpacePermissionsMiddleware } from '../spacePermissions'

describe('SpacePermissionsMiddleware', () => {
  it('forgets a space after TxRemoveDoc', async () => {
    const context = { hierarchy: { isDerived: () => true } } as unknown as PipelineContext
    const ctx = new MeasureMetricsContext('test', {})
    const mw: any = await SpacePermissionsMiddleware.create(ctx, context, undefined)
    const id = 'sp1' as Ref<Space>
    mw.whitelistSpaces.add(id)
    mw.restrictedSpaces.add(id)
    mw.permissionsBySpace[id] = {}

    mw.processPermissionsUpdatesFromTx(ctx, {
      _class: core.class.TxRemoveDoc,
      objectClass: core.class.Space,
      objectId: id
    } as unknown as Tx)

    expect(mw.whitelistSpaces.has(id)).toBe(false)
    expect(mw.restrictedSpaces.has(id)).toBe(false)
    expect(mw.permissionsBySpace[id]).toBeUndefined()
  })

  it('loads spaces without the request context and retries init after a failure', async () => {
    const context = { hierarchy: { isDerived: () => true } } as unknown as PipelineContext
    const ctx = new MeasureMetricsContext('test', {})
    ctx.contextData = { account: 'first-user' } as any
    const seen: any[] = []
    let fail = true
    const next: any = {
      findAll: async (c: any) => {
        seen.push(c.contextData)
        if (fail) throw new Error('boom')
        return []
      }
    }
    const mw: any = await SpacePermissionsMiddleware.create(ctx, context, next)

    await expect(mw.init(ctx)).rejects.toThrow('boom')
    fail = false
    await mw.init(ctx)

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBeUndefined()
  })
})
