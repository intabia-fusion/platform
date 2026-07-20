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

import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import core, {
  type Doc,
  type Tx,
  type TxCUD,
  TxProcessor,
  AccountRole,
  MeasureContext,
  SessionData
} from '@hcengineering/core'
import workflow from '@hcengineering/model-workflow'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'

export class WorkflowMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new WorkflowMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const account = ctx.contextData.account
    for (const t of txes) {
      if (TxProcessor.isExtendsCUD(t._class)) {
        const cud = t as TxCUD<Doc>

        if (cud.modifiedBy === core.account.System) {
          continue
        }

        if (cud.objectClass === workflow.class.Workflow || cud.objectClass === workflow.class.WorkflowTransition) {
          if (account == null || (account.role !== AccountRole.Owner && account.role !== AccountRole.Admin)) {
            throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
          }
        }
      }
    }
    return await this.provideTx(ctx, txes)
  }
}
