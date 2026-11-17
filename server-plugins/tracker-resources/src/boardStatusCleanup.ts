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

import core, { type Tx, type TxCUD, type Doc, type TxUpdateDoc } from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import task, { type ProjectType } from '@hcengineering/task'
import tracker, { pruneStatusCondition } from '@hcengineering/tracker'

function changesProjectTypeStatuses (tx: Tx): boolean {
  if (tx._class !== core.class.TxUpdateDoc || (tx as TxCUD<Doc>).objectClass !== task.class.ProjectType) return false
  const operations = (tx as TxUpdateDoc<ProjectType>).operations
  const isStatusField = (key: string): boolean => key === 'statuses' || key.startsWith('statuses.')
  return Object.entries(operations).some(
    ([key, value]) =>
      isStatusField(key) ||
      (key.startsWith('$') && value !== null && typeof value === 'object' && Object.keys(value).some(isStatusField))
  )
}

/** Recheck saved board conditions after project type status lists change, including status merges. */
export async function OnProjectTypeStatusesChanged (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const changed = new Set(txes.filter(changesProjectTypeStatuses).map((tx) => (tx as TxCUD<Doc>).objectId))
  if (changed.size === 0) return []
  const projects = await control.findAll(control.ctx, tracker.class.Project, {}, { showArchived: true })
  const affected = new Set(projects.filter((p) => changed.has(p.type)).map((p) => p._id))
  if (affected.size === 0) return []
  const types = control.modelDb.findAllSync(task.class.ProjectType, {})
  const byType = new Map(types.map((type) => [type._id, type]))
  const byProject = new Map(projects.map((project) => [project._id, project]))
  const boards = await control.findAll(control.ctx, tracker.class.Board, { projects: { $in: [...affected] } })
  const result: Tx[] = []
  for (const board of boards) {
    if (board.projects.some((id) => !byProject.has(id))) continue
    const boardTypes = board.projects.map((id) => {
      const project = byProject.get(id)
      return project === undefined ? undefined : byType.get(project.type)
    })
    // Incomplete scope must never erase another project's settings.
    if (boardTypes.some((type) => type === undefined)) continue
    const allowed = new Set(
      boardTypes.flatMap((type) =>
        (type?.statuses ?? []).filter((entry) => entry.taskType !== undefined).map((entry) => entry._id)
      )
    )
    const patch = {
      filter: pruneStatusCondition(board.filter, allowed),
      quickFilters: board.quickFilters.map((rule) => ({
        ...rule,
        condition: pruneStatusCondition(rule.condition, allowed)
      })),
      swimlanes: board.swimlanes.map((rule) => ({
        ...rule,
        condition: pruneStatusCondition(rule.condition, allowed)
      })),
      colorRules: board.colorRules.map((rule) => ({
        ...rule,
        condition: pruneStatusCondition(rule.condition, allowed)
      }))
    }
    if (
      patch.filter !== board.filter ||
      JSON.stringify(patch.swimlanes) !== JSON.stringify(board.swimlanes) ||
      JSON.stringify(patch.quickFilters) !== JSON.stringify(board.quickFilters) ||
      JSON.stringify(patch.colorRules) !== JSON.stringify(board.colorRules)
    ) {
      result.push(control.txFactory.createTxUpdateDoc(board._class, board.space, board._id, patch))
    }
  }
  return result
}
