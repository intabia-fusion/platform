//
// Copyright © 2025 Hardcore Engineering Inc.
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
  type MeasureContext,
  type Tx,
  TxProcessor,
  systemAccountUuid,
  type Doc,
  type SessionData,
  type TxApplyIf,
  type TxCUD
} from '@hcengineering/core'
import { ForbiddenKind } from '@hcengineering/platform'
import {
  BaseMiddleware,
  type Middleware,
  type TxMiddlewareResult,
  type PipelineContext
} from '@hcengineering/server-core'
import { isAiBotAccount } from './identity'

/**
 * @public
 */
export class PluginConfigurationMiddleware extends BaseMiddleware implements Middleware {
  private constructor (context: PipelineContext, next?: Middleware) {
    super(context, next)
  }

  static async create (
    ctx: MeasureContext,
    context: PipelineContext,
    next: Middleware | undefined
  ): Promise<PluginConfigurationMiddleware> {
    return new PluginConfigurationMiddleware(context, next)
  }

  tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const account = ctx.contextData.account
    if (account.uuid === systemAccountUuid || isAiBotAccount(account)) {
      // We pass for system accounts and services.
      return this.provideTx(ctx, txes)
    }
    const checkTx = (tx: Tx): void => {
      if (TxProcessor.isExtendsCUD(tx._class)) {
        const cud = tx as TxCUD<Doc>
        if (cud.objectClass === core.class.PluginConfiguration && ctx.contextData.account.role !== AccountRole.Owner) {
          throw this.forbiddenTx(
            ctx,
            ForbiddenKind.WorkspaceOwnerOnly,
            'Only workspace owners can change plugin configuration',
            cud
          )
        }
      }
    }
    for (const tx of txes) {
      checkTx(tx)
      if (tx._class === core.class.TxApplyIf) {
        const atx = tx as TxApplyIf
        atx.txes.forEach(checkTx)
      }
    }
    return this.provideTx(ctx, txes)
  }
}
