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
import { setPlatformStatus, unknownError } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import { getProjectTypeStates, type ProjectType, type StatusUsageResult } from '@hcengineering/task'
import { showPopup } from '@hcengineering/ui'
import { statusStore } from '@hcengineering/view-resources'
import { get } from 'svelte/store'
import DeleteStateConfirmationPopup from './components/state/DeleteStateConfirmationPopup.svelte'
import { taskTypeStore, typeStore } from '.'
import { countStatusTasks, getStatusUsage } from './statusMergeApi'
import { removeStatusFromType, loadWorkflowUsage } from './statusUsage'

/**
 * Deletes a status from a project type, `onDone` runs after. Unused: a plain confirmation,
 * otherwise the dialog asks where tasks, defaults and workflows move and the server merges.
 * @public
 */
export async function deleteProjectTypeStatus (type: ProjectType, status: Status, onDone?: () => void): Promise<void> {
  const client = getClient()
  const taskTypes = [...get(taskTypeStore).values()].filter((it) => it.parent === type._id)
  let usage: StatusUsageResult | undefined
  // Server count: a client query misses archived spaces and spaces without the user
  try {
    usage = await getStatusUsage({ projectType: type._id, status: status._id })
  } catch (err) {
    await setPlatformStatus(unknownError(err))
  }
  if (usage === undefined) return
  const { projects, tasks: tasksEverywhere } = usage
  const tasks = countStatusTasks(usage)
  const workflows = (await loadWorkflowUsage(client, type._id, taskTypes)).get(status._id)?.length ?? 0
  const candidates = getProjectTypeStates(type._id, get(typeStore), get(statusStore).byId, true).filter(
    (it) => it._id !== status._id && it.ofAttribute === status.ofAttribute
  )
  showPopup(
    DeleteStateConfirmationPopup,
    {
      object: status,
      type,
      taskTypes,
      tasks,
      projects,
      workflows,
      selectableStates: candidates,
      deleteAction: async () => {
        await removeStatusFromType(client, type, status, taskTypes, {
          types: [...get(typeStore).values()],
          taskTypes: [...get(taskTypeStore).values()],
          tasks: tasksEverywhere
        })
        onDone?.()
      },
      transferDone: onDone
    },
    undefined
  )
}
