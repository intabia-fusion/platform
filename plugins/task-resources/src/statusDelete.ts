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

import type { Status } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import task, { getProjectTypeStates, type ProjectType } from '@hcengineering/task'
import { showPopup } from '@hcengineering/ui'
import { statusStore } from '@hcengineering/view-resources'
import { get } from 'svelte/store'
import DeleteStateConfirmationPopup from './components/state/DeleteStateConfirmationPopup.svelte'
import { taskTypeStore, typeStore } from '.'
import { removeStatusFromType, loadWorkflowUsage } from './statusUsage'

/**
 * Deletes a status from a project type. Unused (no tasks, no workflow transitions): a plain confirmation.
 * Otherwise the dialog asks for the status the tasks and transitions move to, and the server merge runs
 * in transfer mode. `onDone` runs after the deletion.
 * @public
 */
export async function deleteProjectTypeStatus (type: ProjectType, status: Status, onDone?: () => void): Promise<void> {
  const client = getClient()
  const taskTypes = [...get(taskTypeStore).values()].filter((it) => it.parent === type._id)
  const tasks = (await client.findAll(task.class.Task, { status: status._id }, { limit: 1, total: true })).total
  const workflows = (await loadWorkflowUsage(client, type._id, taskTypes)).get(status._id)?.length ?? 0
  const candidates = getProjectTypeStates(type._id, get(typeStore), get(statusStore).byId).filter(
    (it) => it._id !== status._id && it.ofAttribute === status.ofAttribute
  )
  showPopup(
    DeleteStateConfirmationPopup,
    {
      object: status,
      type,
      taskTypes,
      tasks,
      workflows,
      selectableStates: candidates,
      deleteAction: async () => {
        await removeStatusFromType(
          client,
          type,
          status,
          taskTypes,
          [...get(typeStore).values()],
          [...get(taskTypeStore).values()]
        )
        onDone?.()
      },
      transferDone: onDone
    },
    undefined
  )
}
