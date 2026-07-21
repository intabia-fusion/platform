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
  SessionData,
  type TxCreateDoc,
  type TxUpdateDoc,
  DocumentUpdate
} from '@hcengineering/core'
import workflow from '@hcengineering/model-workflow'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { type WorkflowTransition, getTransitionConflict, hasSelfTransition } from '@hcengineering/workflow'

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

        if (cud.objectClass === workflow.class.WorkflowTransition) {
          await this.validateTransition(ctx, cud as TxCUD<WorkflowTransition>)
        }
      }
    }
    return await this.provideTx(ctx, txes)
  }

  private async validateTransition (ctx: MeasureContext<SessionData>, cud: TxCUD<WorkflowTransition>): Promise<void> {
    if (cud._class === core.class.TxCreateDoc) {
      const transition = (cud as TxCreateDoc<WorkflowTransition>).attributes
      if (hasSelfTransition(transition)) {
        throw new Error(`Transition from status "${transition.to}" to itself is not allowed.`)
      }
      const workflowRef = transition.attachedTo
      if (workflowRef != null) {
        const existing = await this.provideFindAll(ctx, workflow.class.WorkflowTransition, { attachedTo: workflowRef })
        const conflict = getTransitionConflict(transition, existing)
        if (conflict != null) {
          const fromStatus = conflict.status === 'null' ? 'any status' : conflict.status
          throw new Error(
            `Transition to status "${transition.to}" from status "${fromStatus}" already exists in transition "${conflict.transition.name}".`
          )
        }
      }
    } else if (cud._class === core.class.TxUpdateDoc) {
      const updateTx = cud as TxUpdateDoc<WorkflowTransition>
      if (isFieldModified(updateTx.operations, 'from') || isFieldModified(updateTx.operations, 'to')) {
        const transition = (
          await this.provideFindAll(ctx, workflow.class.WorkflowTransition, { _id: updateTx.objectId }, { limit: 1 })
        )[0]
        if (transition != null) {
          const updated = TxProcessor.updateDoc2Doc(transition, updateTx)
          if (hasSelfTransition(updated)) {
            throw new Error(`Transition from status "${updated.to}" to itself is not allowed.`)
          }
          const workflowRef = transition.attachedTo
          const existingTransitions = await this.provideFindAll(ctx, workflow.class.WorkflowTransition, {
            attachedTo: workflowRef
          })
          const conflict = getTransitionConflict(updated, existingTransitions)
          if (conflict != null) {
            const fromStatus = conflict.status === 'null' ? 'any status' : conflict.status
            throw new Error(
              `Transition to status "${updated.to}" from status "${fromStatus}" already exists in transition "${conflict.transition.name}".`
            )
          }
        }
      }
    }
  }
}

function isFieldModified (operations: DocumentUpdate<WorkflowTransition>, field: string): boolean {
  if (field in operations) return true
  for (const key of Object.keys(operations)) {
    if (key.startsWith('$') && (operations as any)[key] != null && typeof (operations as any)[key] === 'object') {
      if (field in (operations as any)[key]) return true
    }
  }
  return false
}
