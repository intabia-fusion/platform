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

import core, { type MeasureContext, type SessionData, type Tx } from '@hcengineering/core'
import type { PipelineContext } from '@hcengineering/server-core'

import { UserStatusMiddleware } from '../userStatus'

describe('UserStatusMiddleware', () => {
  const ctx = { contextData: {} } as unknown as MeasureContext<SessionData>

  async function withMiddleware (): Promise<{
    context: Partial<PipelineContext>
    tx: (txes: Tx[]) => Promise<unknown>
  }> {
    const context: Partial<PipelineContext> = {}
    const middleware = await UserStatusMiddleware.create(ctx, context as PipelineContext, undefined)
    return { context, tx: async (txes) => await middleware.tx(ctx, txes) }
  }

  const createTx = (attributes: Record<string, unknown>): Tx =>
    ({
      _class: core.class.TxCreateDoc,
      objectClass: core.class.UserStatus,
      objectId: 'us-1',
      attributes
    }) as unknown as Tx

  const updateTx = (operations: Record<string, unknown>): Tx =>
    ({
      _class: core.class.TxUpdateDoc,
      objectClass: core.class.UserStatus,
      objectId: 'us-1',
      operations
    }) as unknown as Tx

  it('records a created status with its away flag, absent reads as not away', async () => {
    const { context, tx } = await withMiddleware()

    await tx([createTx({ user: 'acc-1', online: true, away: true })])
    expect(context.userStatusMap?.get('us-1' as any)).toEqual({ online: true, away: true, user: 'acc-1' })

    await tx([createTx({ user: 'acc-1', online: true })])
    expect(context.userStatusMap?.get('us-1' as any)).toEqual({ online: true, away: false, user: 'acc-1' })
  })

  it('applies an update of either flag and keeps the other', async () => {
    const { context, tx } = await withMiddleware()
    await tx([createTx({ user: 'acc-1', online: true, away: false })])

    await tx([updateTx({ away: true })])
    expect(context.userStatusMap?.get('us-1' as any)).toEqual({ online: true, away: true, user: 'acc-1' })

    await tx([updateTx({ online: false, away: false })])
    expect(context.userStatusMap?.get('us-1' as any)).toEqual({ online: false, away: false, user: 'acc-1' })
  })

  it('ignores an update for a status it has not seen', async () => {
    const { context, tx } = await withMiddleware()
    await tx([updateTx({ away: true })])
    expect(context.userStatusMap?.get('us-1' as any)).toBeUndefined()
  })
})
