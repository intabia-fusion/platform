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
  type Ref,
  Hierarchy,
  TxProcessor,
  AccountRole,
  MeasureContext,
  SessionData,
  type TxCreateDoc,
  type TxUpdateDoc,
  DocumentUpdate
} from '@hcengineering/core'
import task, { Project, type Task, type TaskType } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import platform, { getResource, PlatformError, Severity, Status } from '@hcengineering/platform'
import {
  type ProjectWorkflow,
  type Workflow,
  type WorkflowValidator,
  type WorkflowTransition,
  type ValidatorClient,
  getTransitionConflict,
  hasSelfTransition
} from '@hcengineering/workflow'

import serverWorkflow, { type ValidatorImpl } from './index'

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

        if (this.context.hierarchy.isDerived(cud.objectClass, task.class.Task)) {
          if (cud._class === core.class.TxCreateDoc) {
            await this.validateTaskCreate(ctx, cud as TxCreateDoc<Task>)
          } else if (cud._class === core.class.TxUpdateDoc) {
            await this.validateTaskUpdate(ctx, cud as TxUpdateDoc<Task>)
          }
        }
      }
    }
    return await this.provideTx(ctx, txes)
  }

  private async validateTaskCreate (ctx: MeasureContext<SessionData>, createTx: TxCreateDoc<Task>): Promise<void> {
    const status = createTx.attributes.status
    if (status == null) return

    const project = (
      await this.provideFindAll(ctx, task.class.Project, { _id: createTx.objectSpace as Ref<Project> }, { limit: 1 })
    )[0]
    if (project == null) return

    const workflowRef = findWorkflowForTaskType(this.context.hierarchy, project, createTx.attributes.kind)
    if (workflowRef !== undefined) {
      const transitions = await this.provideFindAll(ctx, workflow.class.WorkflowTransition, {
        attachedTo: workflowRef
      })
      const allowed = transitions.some((t) => (t.from == null || t.from.length === 0) && t.to === status)
      if (!allowed) {
        throw new Error(`Initial status "${status}" is not allowed in the workflow for creating a new task.`)
      }
    }
  }

  private async validateTaskUpdate (ctx: MeasureContext<SessionData>, updateTx: TxUpdateDoc<Task>): Promise<void> {
    const toStatus = updateTx.operations.status
    if (toStatus == null) return

    const oldTask = (await this.provideFindAll(ctx, task.class.Task, { _id: updateTx.objectId }, { limit: 1 }))[0]
    if (oldTask == null) return

    const fromStatus = oldTask.status
    if (updateTx.meta == null) {
      updateTx.meta = {}
    }
    updateTx.meta.fromStatus = fromStatus

    if (fromStatus === toStatus) return

    const project = (
      await this.provideFindAll(ctx, task.class.Project, { _id: oldTask.space as Ref<Project> }, { limit: 1 })
    )[0]
    if (project == null) return

    const workflowRef = findWorkflowForTaskType(this.context.hierarchy, project, oldTask.kind)
    if (workflowRef == null) return

    const transitions = await this.provideFindAll(ctx, workflow.class.WorkflowTransition, {
      attachedTo: workflowRef
    })

    const allowedTransitions = transitions.filter((t) => {
      return (t.from == null || t.from.includes(fromStatus)) && t.to === toStatus
    })

    if (allowedTransitions.length === 0) {
      throw new Error(`Transition from status "${fromStatus}" to "${toStatus}" is forbidden by the workflow rules.`)
    }

    const transition =
      allowedTransitions.find((t) => t.from != null && t.from.includes(fromStatus)) ??
      allowedTransitions.find((t) => t.from == null || t.from.length === 0)

    if (transition === undefined) {
      throw new Error(`Transition from status "${fromStatus}" to "${toStatus}" is forbidden by the workflow rules.`)
    }

    const updatedTask = TxProcessor.updateDoc2Doc(oldTask, updateTx)
    await this.validateTransitionValidators(ctx, transition, updatedTask)
  }

  private async validateTransitionValidators (
    ctx: MeasureContext<SessionData>,
    transition: WorkflowTransition,
    task: Task
  ): Promise<void> {
    const validators = transition.validators
    if (validators == null || validators.length === 0) return

    const client: ValidatorClient = {
      getHierarchy: () => this.context.hierarchy,
      getModel: () => this.context.modelDb,
      findAll: (_class, query, options) => this.provideFindAll(ctx, _class, query, options),
      findOne: async (_class, query, options) => (await this.provideFindAll(ctx, _class, query, options))[0]
    }

    for (const validatorConfig of validators) {
      const validator = (
        await this.provideFindAll(
          ctx,
          workflow.class.WorkflowValidator,
          { _id: validatorConfig.validator },
          { limit: 1 }
        )
      )[0] as WorkflowValidator | undefined

      if (validator == null) return

      const validatorImpl = this.context.hierarchy.as<WorkflowValidator, ValidatorImpl>(
        validator,
        serverWorkflow.mixin.ValidatorImpl
      )
      const executorFn = await getResource(validatorImpl.serverExecutor)
      if (executorFn == null) return

      const res = await executorFn(client, task, transition, validatorConfig.props)
      if (!res.ok) {
        throw new Error(res.reason ?? 'Validation failed')
      }
    }
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

function findWorkflowForTaskType (
  h: Hierarchy,
  project: Project,
  taskTypeRef: Ref<TaskType>
): Ref<Workflow> | undefined {
  if (!h.hasMixin(project, workflow.mixin.ProjectWorkflow)) return undefined
  const projectWorkflow = h.as<Project, ProjectWorkflow>(project, workflow.mixin.ProjectWorkflow)
  return projectWorkflow.workflows?.[taskTypeRef]
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
