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

import core, { MeasureMetricsContext, type Doc, type TxApplyIf } from '@hcengineering/core'
import type { Middleware, PipelineContext } from '@hcengineering/server-core'
import { ApplyTxMiddleware } from '../applyTx'

const ctx = new MeasureMetricsContext('test', {})

function applyIf (scope: string): TxApplyIf {
  const tx: Partial<TxApplyIf> = {
    _class: core.class.TxApplyIf,
    scope,
    match: [{ _class: core.class.Doc, query: {} }],
    txes: []
  }
  return tx as TxApplyIf
}

async function createMiddleware (findAll: () => Promise<Doc[]>): Promise<ApplyTxMiddleware> {
  const next: Partial<Middleware> = { findAll: findAll as any }
  const context: Partial<PipelineContext> = {}
  return (await ApplyTxMiddleware.create(ctx, context as PipelineContext, next as Middleware)) as ApplyTxMiddleware
}

describe('ApplyTxMiddleware.verifyApplyIf', () => {
  it('releases the scope when the match check throws', async () => {
    let fail = true
    const mw = await createMiddleware(async () => {
      if (fail) throw new Error('db down')
      return [{} as any]
    })

    await expect(mw.verifyApplyIf(ctx, applyIf('s'))).rejects.toThrow('db down')

    fail = false
    const res = await mw.verifyApplyIf(ctx, applyIf('s'))
    expect(res.passed).toBe(true)
    res.onEnd()
    expect(mw.scopes.size).toBe(0)
  })

  it('runs applies of one scope one at a time, in order', async () => {
    const mw = await createMiddleware(async () => [{} as any])
    const log: string[] = []
    let inside = 0

    const run = async (name: string): Promise<void> => {
      const res = await mw.verifyApplyIf(ctx, applyIf('s'))
      inside++
      expect(inside).toBe(1)
      log.push(name)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inside--
      res.onEnd()
    }

    await Promise.all([run('a'), run('b'), run('c')])
    expect(log).toEqual(['a', 'b', 'c'])
    expect(mw.scopes.size).toBe(0)
  })

  it('does not block other scopes', async () => {
    const mw = await createMiddleware(async () => [{} as any])
    const first = await mw.verifyApplyIf(ctx, applyIf('a'))
    const second = await mw.verifyApplyIf(ctx, applyIf('b'))
    expect(second.passed).toBe(true)
    first.onEnd()
    second.onEnd()
  })
})
