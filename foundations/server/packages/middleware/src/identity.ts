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
  type Account,
  aiBotAccountEmail,
  type MeasureContext,
  SocialIdType,
  type Tx,
  systemAccountUuid,
  type SessionData,
  type TxApplyIf
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import {
  BaseMiddleware,
  type Middleware,
  type TxMiddlewareResult,
  type PipelineContext
} from '@hcengineering/server-core'

// The value alone matches a social id of any type; the bot is told by a confirmed email.
export function isAiBotAccount (account: Pick<Account, 'fullSocialIds'>): boolean {
  return account.fullSocialIds.some(
    (it) => it.type === SocialIdType.EMAIL && it.value === aiBotAccountEmail && it.verifiedOn != null
  )
}

/**
 * @public
 */
export class IdentityMiddleware extends BaseMiddleware implements Middleware {
  private constructor (context: PipelineContext, next?: Middleware) {
    super(context, next)
  }

  static async create (
    ctx: MeasureContext,
    context: PipelineContext,
    next: Middleware | undefined
  ): Promise<IdentityMiddleware> {
    return new IdentityMiddleware(context, next)
  }

  tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const account = ctx.contextData.account

    if (account.uuid === systemAccountUuid || isAiBotAccount(account)) {
      // TODO: We need to enhance allowed list in case of user service, on behalf of user activities.

      // We pass for system accounts and services.
      return this.provideTx(ctx, txes)
    }
    function checkTx (tx: Tx): void {
      const mxAccount = ctx.contextData.socialStringsToUsers.get(tx.modifiedBy)?.accountUuid
      if (mxAccount === undefined || mxAccount !== account.uuid) {
        const cud = tx as any
        ctx.warn('AccountMismatch on tx', {
          account: account.uuid,
          requiredAccount: mxAccount,
          modifiedBy: tx.modifiedBy,
          txClass: tx._class,
          txId: tx._id,
          objectClass: cud.objectClass,
          objectId: cud.objectId,
          mapSize: ctx.contextData.socialStringsToUsers.size,
          accountSocialIds: account.socialIds
        })
        throw new PlatformError(
          new Status(Severity.ERROR, platform.status.AccountMismatch, {
            account: account.uuid,
            requiredAccount: mxAccount
          })
        )
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
