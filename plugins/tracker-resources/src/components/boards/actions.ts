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

import type { Ref, TxOperations } from '@hcengineering/core'
import { translate } from '@hcengineering/platform'
import { getStates } from '@hcengineering/task'
import { typeStore } from '@hcengineering/task-resources'
import type { Project } from '@hcengineering/tracker'
import { statusStore } from '@hcengineering/view-resources'
import { get } from 'svelte/store'
import { boardLocation, createBoard, projectBoardLocation, togglePinned } from '../../boards'
import tracker from '../../plugin'
import { activeProjects } from '../../utils'

// New board of a project with a column per status; opens its settings
// on the board page, or `inProject` - in place of the project issues view.
export async function newBoard (
  client: TxOperations,
  project: Ref<Project> | undefined,
  inProject: boolean = false
): Promise<void> {
  const projects = get(activeProjects)
  const target = (project !== undefined ? projects.get(project) : undefined) ?? projects.values().next().value
  const statuses = getStates(target, get(typeStore), get(statusStore).byId)
  const title = await translate(tracker.string.NewBoard, {})
  const id = await createBoard(client, title, target, statuses)
  if (inProject) {
    // Created from a project: on the bar of its author
    await togglePinned(client, id)
    projectBoardLocation(id, true)
  } else boardLocation(id, true, undefined, true)
}
