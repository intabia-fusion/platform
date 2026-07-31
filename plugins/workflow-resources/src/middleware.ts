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
// See the License for the specific language governing permissions and
// limitations under the License.
//

import core, {
  type Client,
  getCurrentAccount,
  notEmpty,
  type Ref,
  type Tx,
  type TxResult,
  type TxUpdateDoc,
  TxOperations,
  type WithLookup
} from '@hcengineering/core'
import { BasePresentationMiddleware, type PresentationMiddleware } from '@hcengineering/presentation'
import task, { type Project, type Task } from '@hcengineering/task'
import {
  type ProjectWorkflow,
  type Screen,
  type ScreenTab,
  type Workflow,
  type WorkflowTransition
} from '@hcengineering/workflow'
import { showPopup } from '@hcengineering/ui'

import plugin from './plugin'
import ScreenModal from './components/screen/ScreenModal.svelte'
import { type ScreenModalResult } from './types'

export class WorkflowMiddleware extends BasePresentationMiddleware implements PresentationMiddleware {
  private readonly txFactory = new TxOperations(this.client, getCurrentAccount().primarySocialId).txFactory

  private constructor (client: Client, next?: PresentationMiddleware) {
    super(client, next)
  }

  static create (client: Client, next?: PresentationMiddleware): WorkflowMiddleware {
    return new WorkflowMiddleware(client, next)
  }

  async notifyTx (...tx: Tx[]): Promise<void> {
    await this.provideNotifyTx(...tx)
  }

  async close (): Promise<void> {
    await this.provideClose()
  }

  async tx (tx: Tx): Promise<TxResult> {
    if (tx._class !== core.class.TxUpdateDoc) return await this.provideTx(tx)

    const updateTx = tx as TxUpdateDoc<Task>
    const hierarchy = this.client.getHierarchy()

    if (!hierarchy.isDerived(updateTx.objectClass, task.class.Task)) return await this.provideTx(tx)

    const shouldProceed = await this.handleStatusTransition(updateTx)
    if (!shouldProceed) {
      const canceledResult: TxResult = { status: 400, error: 'Transition canceled by user' }
      return canceledResult
    }

    return await this.provideTx(tx)
  }

  private async handleStatusTransition (updateTx: TxUpdateDoc<Task>): Promise<boolean> {
    const hierarchy = this.client.getHierarchy()
    const toStatus = updateTx.operations.status
    if (toStatus == null) return true

    const taskDoc = await this.client.findOne(task.class.Task, { _id: updateTx.objectId })

    if (taskDoc == null || taskDoc.status === toStatus) return true

    const workflow = await this.getWorkflowForTask(taskDoc)
    if (workflow == null) return true

    const fromStatus = taskDoc.status
    const transitions = (workflow.$lookup?.transitions ?? []) as WorkflowTransition[]

    const matchingTransitions = transitions.filter((t) => t.to === toStatus)
    const transition =
      matchingTransitions.find((t) => t.from != null && t.from.includes(fromStatus)) ??
      matchingTransitions.find((t) => t.from == null || t.from.length === 0)

    if (transition == null) return false

    const screenRequests = (transition.requests ?? []).filter((r) => r.request === plugin.request.ScreenRequest)
    if (screenRequests.length === 0) return true

    const clone = hierarchy.clone(taskDoc)

    const screenIds = screenRequests.map((it) => it.props?.screen as Ref<Screen> | undefined).filter(notEmpty)

    if (screenIds.length === 0) return true

    const screens = await this.client.findAll(
      plugin.class.Screen,
      { _id: { $in: screenIds } },
      {
        lookup: {
          _id: { tabs: plugin.class.ScreenTab }
        }
      }
    )

    if (screens.length === 0) return true

    const tabs = screens.flatMap((it) => (it.$lookup?.tabs ?? []) as ScreenTab[])
    const tabIds = tabs.map((t) => t._id)
    const allFields = await this.client.findAll(plugin.class.ScreenField, { attachedTo: { $in: tabIds } })
    if (allFields.length === 0) return true

    for (const screen of screens) {
      const _tabs = tabs.filter((it) => it.attachedTo === screen._id)
      const _tabIds = new Set(_tabs.map((t) => t._id))
      const _fields = allFields.filter((it) => _tabIds.has(it.attachedTo))

      const res = await new Promise<ScreenModalResult<Task> | null>((resolve) => {
        showPopup(
          ScreenModal,
          {
            screen,
            tabs: _tabs,
            fields: _fields,
            object: clone
          },
          'center',
          (result) => {
            resolve(result as ScreenModalResult<Task> | null)
          }
        )
      })

      if (res == null) return false

      if (res.update != null) {
        Object.assign(updateTx.operations, res.update)
      }

      if (res.txes != null && res.txes.length > 0) {
        const applyTx = this.txFactory.createTxApplyIf(core.space.Tx, 'workflow', [], [], res.txes, 'workflow')
        await this.client.tx(applyTx)
      }
    }

    return true
  }

  private async getWorkflowForTask (taskDoc: Task): Promise<WithLookup<Workflow> | undefined> {
    const hierarchy = this.client.getHierarchy()
    const taskType = taskDoc.kind

    const project = await this.client.findOne(task.class.Project, { _id: taskDoc.space as unknown as Ref<Project> })

    if (project == null) return undefined
    if (!hierarchy.hasMixin(project, plugin.mixin.ProjectWorkflow)) return undefined

    const projectWorkflow = hierarchy.as<Project, ProjectWorkflow>(project, plugin.mixin.ProjectWorkflow)
    const mappedWorkflowId = projectWorkflow?.workflows?.[taskType]
    if (mappedWorkflowId != null) {
      return await this.client.findOne(
        plugin.class.Workflow,
        { _id: mappedWorkflowId },
        {
          lookup: {
            _id: { transitions: plugin.class.WorkflowTransition }
          }
        }
      )
    }
  }
}
