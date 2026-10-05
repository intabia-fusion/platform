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
import core, { MeasureMetricsContext, type Tx } from '@hcengineering/core'
import { type Middleware, type PipelineContext } from '@hcengineering/server-core'
import { ApplyTxMiddleware } from '../applyTx'

describe('ApplyTxMiddleware', () => {
  it('passes txes preceding a TxApplyIf to the next middleware', async () => {
    const calls: Tx[][] = []
    const next = {
      tx: async (_ctx: any, txes: Tx[]) => {
        calls.push([...txes])
        return {}
      }
    } as unknown as Middleware
    const context = { hierarchy: { isDerived: (c: string, p: string) => c === p } } as unknown as PipelineContext
    const ctx = new MeasureMetricsContext('test', {})
    const mw = await ApplyTxMiddleware.create(ctx, context, next)

    const before = { _id: 'before', _class: core.class.TxCreateDoc } as unknown as Tx
    const applyIf = { _id: 'if', _class: core.class.TxApplyIf, txes: [] } as unknown as Tx
    await mw.tx(ctx as any, [before, applyIf])

    expect(calls[0]).toEqual([before])
  })
})
