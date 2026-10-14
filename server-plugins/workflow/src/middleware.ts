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
  TxProcessor,
  MeasureContext,
  SessionData,
  type TxCreateDoc,
  type TxUpdateDoc,
  DocumentUpdate,
  TxMixin,
  type Status as DocStatus
} from '@hcengineering/core'
import task, { Project, type Task, type TaskType } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import {
  getResource,
  type IntlString,
  PlatformError,
  Severity,
  Status,
  StatusDisplay,
  type StatusOptions
} from '@hcengineering/platform'
import {
  type ProjectWorkflow,
  type Workflow,
  type WorkflowValidator,
  type WorkflowTransition,
  type ValidatorClient,
  type ConflictInfo,
  getStatusNameList,
  getTransitionConflict,
  hasSelfTransition
} from '@hcengineering/workflow'

import serverWorkflow, { type ValidatorImpl } from './index'

const StatusBarError: StatusOptions = { propagate: true, timeout: 3 * 1000 }

function notification (title: IntlString, code: string, target: string): StatusOptions {
  return {
    propagate: true,
    timeout: 10 * 1000,
    display: StatusDisplay.Notification,
    title,
    component: workflow.component.WorkflowErrorNotification,
    group: `${code}:${target}`
  }
}

export class WorkflowMiddleware extends BaseMiddleware {
  private readonly projectWorkflowsCache = new Map<Ref<Project>, Record<Ref<TaskType>, Ref<Workflow>> | null>()

  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new WorkflowMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    for (const t of txes) {
      if (TxProcessor.isExtendsCUD(t._class)) {
        const cud = t as TxCUD<Doc>

        this.updateCache(cud)

        if (this.context.hierarchy.isDerived(cud.objectClass, workflow.class.WorkflowTransition)) {
          await this.validateTransition(ctx, cud as TxCUD<WorkflowTransition>)
        }

        if (this.context.hierarchy.isDerived(cud.objectClass, task.class.Task)) {
          if (cud._class === core.class.TxCreateDoc) {
            await this.validateTaskCreate(ctx, cud as TxCreateDoc<Task>)
          } else if (cud._class === core.class.TxUpdateDoc) {
            await this.validateTaskUpdate(ctx, cud as TxUpdateDoc<Task>, txes)
          }
        }
      }
    }
    return await this.provideTx(ctx, txes)
  }

  private updateCache (cud: TxCUD<Doc>): void {
    if (
      cud._class === core.class.TxRemoveDoc &&
      this.context.hierarchy.isDerived(cud.objectClass, task.class.Project)
    ) {
      this.projectWorkflowsCache.delete(cud.objectId as Ref<Project>)
      return
    }

    if (cud._class === core.class.TxMixin && (cud as TxMixin<Doc, Doc>).mixin === workflow.mixin.ProjectWorkflow) {
      const mixinTx = cud as TxMixin<Project, ProjectWorkflow>
      const workflows = mixinTx.attributes?.workflows ?? {}
      this.projectWorkflowsCache.set(mixinTx.objectId, workflows)
      return
    }

    if (
      cud._class === core.class.TxUpdateDoc &&
      this.context.hierarchy.isDerived(cud.objectClass, task.class.Project)
    ) {
      const updateTx = cud as TxUpdateDoc<Project>
      const updatedWorkflows = getUpdatedFieldValue(
        updateTx.operations,
        `${workflow.mixin.ProjectWorkflow}.workflows` as any
      )
      if (updatedWorkflows != null) {
        this.projectWorkflowsCache.set(cud.objectId as Ref<Project>, updatedWorkflows)
      }
    }
  }

  private async getWorkflowRef (
    ctx: MeasureContext<SessionData>,
    projectId: Ref<Project>,
    taskTypeRef: Ref<TaskType>
  ): Promise<Ref<Workflow> | undefined> {
    if (this.projectWorkflowsCache.has(projectId)) {
      const workflows = this.projectWorkflowsCache.get(projectId)
      return workflows?.[taskTypeRef]
    }

    const project = (await this.provideFindAll(ctx, task.class.Project, { _id: projectId }, { limit: 1 }))[0]

    if (project == null || !this.context.hierarchy.hasMixin(project, workflow.mixin.ProjectWorkflow)) {
      this.projectWorkflowsCache.set(projectId, null)
      return undefined
    }

    const projectWorkflow = this.context.hierarchy.as<Project, ProjectWorkflow>(project, workflow.mixin.ProjectWorkflow)
    const workflows = projectWorkflow.workflows ?? {}
    this.projectWorkflowsCache.set(projectId, workflows)
    return workflows[taskTypeRef]
  }

  private async validateTaskCreate (ctx: MeasureContext<SessionData>, createTx: TxCreateDoc<Task>): Promise<void> {
    const task = TxProcessor.createDoc2Doc(createTx)
    const projectId = task.space as Ref<Project>

    const workflowRef = await this.getWorkflowRef(ctx, projectId, task.kind)
    if (workflowRef !== undefined) {
      const wf = (await this.provideFindAll(ctx, workflow.class.Workflow, { _id: workflowRef }, { limit: 1 }))[0]
      if (wf?.initialStatuses != null && wf.initialStatuses.length > 0) {
        if (!wf.initialStatuses.includes(task.status)) {
          const names = await getStatusNameList(this.validatorClient(ctx), wf.initialStatuses)
          throw new PlatformError(
            new Status(
              Severity.ERROR,
              workflow.status.InitialStatusNotAllowed,
              {
                status: task.status,
                initialStatuses: names.join(', '),
                count: names.length
              },
              undefined,
              notification(workflow.string.TaskNotCreatedTitle, workflow.status.InitialStatusNotAllowed, task.space)
            )
          )
        }
      }
    }
  }

  private async validateTaskUpdate (
    ctx: MeasureContext<SessionData>,
    updateTx: TxUpdateDoc<Task>,
    txes: Tx[]
  ): Promise<void> {
    const toStatus = getUpdatedFieldValue(updateTx.operations, 'status')
    if (toStatus == null) return

    const projectId = updateTx.objectSpace as Ref<Project>
    if (this.projectWorkflowsCache.has(projectId) && this.projectWorkflowsCache.get(projectId) === null) {
      return
    }

    const oldTask = (await this.provideFindAll(ctx, task.class.Task, { _id: updateTx.objectId }, { limit: 1 }))[0]
    if (oldTask == null) return

    const fromStatus = oldTask.status
    updateTx.meta ??= {}
    updateTx.meta.fromStatus = fromStatus
    updateTx.meta.fromKind = oldTask.kind

    if (fromStatus === toStatus) return

    // A type change moves the task between workflows, so neither graph describes this transition.
    // Only a real change is exempt: a `kind` repeating the current one would wave anything through.
    const toKind = getUpdatedFieldValue(updateTx.operations, 'kind')
    if (toKind != null && toKind !== oldTask.kind) return

    const workflowRef = await this.getWorkflowRef(ctx, oldTask.space as Ref<Project>, oldTask.kind)
    if (workflowRef == null) return

    const transitions = await this.provideFindAll(ctx, workflow.class.WorkflowTransition, {
      attachedTo: workflowRef
    })

    const allowedTransitions = transitions.filter((t) => {
      return (t.from == null || t.from.length === 0 || t.from.includes(fromStatus)) && t.to === toStatus
    })

    if (allowedTransitions.length === 0) {
      throw await this.forbiddenTransition(ctx, oldTask, toStatus)
    }

    const transition =
      allowedTransitions.find((t) => t.from?.includes(fromStatus) === true) ??
      allowedTransitions.find((t) => t.from == null || t.from.length === 0)

    if (transition === undefined) {
      throw await this.forbiddenTransition(ctx, oldTask, toStatus)
    }

    const updatedTask = TxProcessor.updateDoc2Doc(oldTask, updateTx)
    await this.validateTransitionValidators(ctx, transition, updatedTask, txes)
  }

  private async forbiddenTransition (
    ctx: MeasureContext<SessionData>,
    oldTask: Task,
    toStatus: Ref<DocStatus>
  ): Promise<PlatformError<any>> {
    const [fromName, toName] = await getStatusNameList(this.validatorClient(ctx), [oldTask.status, toStatus])
    return new PlatformError(
      new Status(
        Severity.ERROR,
        workflow.status.ForbiddenTransition,
        {
          from: oldTask.status,
          to: toStatus,
          fromName,
          toName,
          task: oldTask.identifier,
          refs: { task: oldTask._id }
        },
        undefined,
        notification(workflow.string.StatusChangeError, workflow.status.ForbiddenTransition, oldTask._id)
      )
    )
  }

  private async transitionConflict (
    ctx: MeasureContext<SessionData>,
    conflict: ConflictInfo,
    to: Ref<DocStatus>
  ): Promise<PlatformError<any>> {
    const anyFrom = conflict.status === 'null'
    const [toName, fromName] = await getStatusNameList(
      this.validatorClient(ctx),
      anyFrom ? [to] : [to, conflict.status]
    )
    return new PlatformError(
      new Status(
        Severity.ERROR,
        workflow.status.TransitionConflict,
        {
          from: anyFrom ? 'any' : conflict.status,
          to,
          fromName: fromName ?? '',
          toName,
          name: conflict.transition.name
        },
        undefined,
        StatusBarError
      )
    )
  }

  private validatorClient (ctx: MeasureContext<SessionData>): ValidatorClient {
    return {
      getHierarchy: () => this.context.hierarchy,
      getModel: () => this.context.modelDb,
      findAll: (_class, query, options) => this.provideFindAll(ctx, _class, query, options),
      findOne: async (_class, query, options) => (await this.provideFindAll(ctx, _class, query, options))[0]
    }
  }

  private async validateTransitionValidators (
    ctx: MeasureContext<SessionData>,
    transition: WorkflowTransition,
    taskDoc: Task,
    txes: Tx[]
  ): Promise<void> {
    const validatorConfigs = transition.validators
    if (validatorConfigs == null || validatorConfigs.length === 0) return

    const client = this.validatorClient(ctx)

    const validatorIds = Array.from(new Set(validatorConfigs.map((v) => v.rule)))
    const validators = await this.provideFindAll(ctx, workflow.class.WorkflowValidator, { _id: { $in: validatorIds } })
    const validatorMap = new Map(validators.map((v) => [v._id as Ref<WorkflowValidator>, v as WorkflowValidator]))

    for (const config of validatorConfigs) {
      const validator = validatorMap.get(config.rule)
      if (validator == null) continue

      const validatorImpl = this.context.hierarchy.as<WorkflowValidator, ValidatorImpl>(
        validator,
        serverWorkflow.mixin.ValidatorImpl
      )
      const executorFn = await getResource(validatorImpl.serverExecutor)
      if (executorFn == null) continue

      const res = await executorFn(client, taskDoc, transition, config.props, {
        txes
      })
      if (!res.ok) {
        const code = res.reasonIntl ?? workflow.status.ValidationFailed
        throw new PlatformError(
          new Status(
            Severity.ERROR,
            code,
            {
              reason: res.reason,
              task: taskDoc.identifier,
              space: taskDoc.space,
              ...res.intlParams,
              refs: { ...res.intlParams?.refs, task: taskDoc._id }
            },
            res.intlParamsNotLocalized,
            notification(workflow.string.StatusChangeError, code, taskDoc._id)
          )
        )
      }
    }
  }

  private async validateTransition (ctx: MeasureContext<SessionData>, cud: TxCUD<WorkflowTransition>): Promise<void> {
    if (cud._class === core.class.TxCreateDoc) {
      const createTx = cud as TxCreateDoc<WorkflowTransition>
      const transition = TxProcessor.createDoc2Doc(createTx)
      if (hasSelfTransition(transition)) {
        throw new PlatformError(
          new Status(
            Severity.ERROR,
            workflow.status.SelfTransitionNotAllowed,
            { status: transition.to },
            undefined,
            StatusBarError
          )
        )
      }
      const workflowRef = transition.attachedTo
      if (workflowRef == null) {
        throw new PlatformError(
          new Status(Severity.ERROR, workflow.status.WorkflowNotFound, {}, undefined, StatusBarError)
        )
      }

      const currentTransitions = await this.provideFindAll(ctx, workflow.class.WorkflowTransition, {
        attachedTo: workflowRef
      })
      const conflict = getTransitionConflict(transition, currentTransitions)
      if (conflict != null) {
        throw await this.transitionConflict(ctx, conflict, transition.to)
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
            throw new PlatformError(
              new Status(
                Severity.ERROR,
                workflow.status.SelfTransitionNotAllowed,
                { status: updated.to },
                undefined,
                StatusBarError
              )
            )
          }
          const workflowRef = updated.attachedTo ?? transition.attachedTo
          const existingTransitions = await this.provideFindAll(ctx, workflow.class.WorkflowTransition, {
            attachedTo: workflowRef
          })
          const conflict = getTransitionConflict(updated, existingTransitions)
          if (conflict != null) {
            throw await this.transitionConflict(ctx, conflict, updated.to)
          }
        }
      }
    }
  }
}

function getUpdatedFieldValue<T extends Doc, K extends keyof T> (
  operations: DocumentUpdate<T>,
  field: K
): T[K] | undefined {
  if (field in operations) {
    return (operations as any)[field]
  }
  const setOps = (operations as any).$set
  if (setOps != null && typeof setOps === 'object' && field in setOps) {
    return setOps[field]
  }
  return undefined
}

function isFieldModified<T extends Doc> (operations: DocumentUpdate<T>, field: string): boolean {
  if (field in operations) return true
  for (const key of Object.keys(operations)) {
    if (key.startsWith('$') && (operations as any)[key] != null && typeof (operations as any)[key] === 'object') {
      if (field in (operations as any)[key]) return true
    }
  }
  return false
}
