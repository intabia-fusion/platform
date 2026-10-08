//
// Copyright © 2024 Hardcore Engineering Inc.
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
  type MeasureContext,
  type Tx,
  type TxApplyIf,
  type TxApplyResult,
  type TxResult
} from '@hcengineering/core'
import type { Middleware, PipelineContext, TxMiddlewareResult } from '@hcengineering/server-core'
import { BaseMiddleware } from '@hcengineering/server-core'

/**
 * Will support apply tx
 * @public
 */
export class ApplyTxMiddleware extends BaseMiddleware implements Middleware {
  scopes = new Map<string, Promise<void>>()

  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new ApplyTxMiddleware(context, next)
  }

  async tx (ctx: MeasureContext, txes: Tx[]): Promise<TxMiddlewareResult> {
    const result: TxResult[] = []

    let part: Tx[] = []
    for (const tx of txes) {
      if (this.context.hierarchy.isDerived(tx._class, core.class.TxApplyIf)) {
        if (part.length > 0) {
          result.push(await this.provideTx(ctx, part))
          part = []
        }
        const applyIf = tx as TxApplyIf
        // Wait for scope promise if found
        const passed =
          applyIf.scope != null ? await this.verifyApplyIf(ctx, applyIf) : { passed: true, onEnd: () => {} }
        try {
          if (passed.passed) {
            const applyResult: TxApplyResult = {
              success: true,
              serverTime: 0
            }
            result.push(applyResult)

            const st = Date.now()
            const r = await this.provideTx(ctx, applyIf.txes)
            if (Object.keys(r).length > 0) {
              result.push(r)
            }
            applyResult.serverTime = Date.now() - st
          } else {
            ctx.warn('TxApplyIf failed', {
              scope: applyIf.scope,
              reason: passed.reason,
              measureName: applyIf.measureName,
              matchCount: applyIf.match?.length ?? 0,
              notMatchCount: applyIf.notMatch?.length ?? 0,
              txCount: applyIf.txes.length
            })
            result.push({
              success: false
            })
          }
        } finally {
          passed.onEnd()
        }
      } else {
        part.push(tx)
      }
    }
    if (part.length > 0) {
      result.push(await this.provideTx(ctx, part))
    }
    if (Array.isArray(result) && result.length === 1) {
      return result[0]
    }
    return result
  }

  /**
   * Verify if apply if is possible to apply.
   */
  async verifyApplyIf (
    ctx: MeasureContext,
    applyIf: TxApplyIf
  ): Promise<{
    onEnd: () => void
    passed: boolean
    reason?: string
  }> {
    if (applyIf.scope == null) {
      return { passed: true, onEnd: () => {} }
    }
    // Applies of one scope run one after another: each waits for the tail of the queue and becomes the new tail.
    const scope = applyIf.scope
    const prev = this.scopes.get(scope) ?? Promise.resolve()
    let release = (): void => {}
    const tail = prev.then(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    this.scopes.set(scope, tail)
    const onEnd = (): void => {
      release()
      if (this.scopes.get(scope) === tail) this.scopes.delete(scope)
    }
    await prev

    let passed = true
    let reason: string | undefined
    try {
      if (applyIf.match != null) {
        for (const { _class, query } of applyIf.match) {
          const res = await this.provideFindAll(ctx, _class, query, { limit: 1 })
          if (res.length === 0) {
            passed = false
            reason = `match query failed: class=${_class}, query=${JSON.stringify(query)}`
            break
          }
        }
      }
      if (passed && applyIf.notMatch != null) {
        for (const { _class, query } of applyIf.notMatch) {
          const res = await this.provideFindAll(ctx, _class, query, { limit: 1 })
          if (res.length > 0) {
            passed = false
            reason = `notMatch query failed: class=${_class}, query=${JSON.stringify(query)} (found ${res.length} matching document(s))`
            break
          }
        }
      }
    } catch (err: any) {
      onEnd()
      throw err
    }
    return { passed, onEnd, reason }
  }
}
