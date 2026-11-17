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

import type { Ref, Status } from '@hcengineering/core'
import type { Board, BoardColumn, Project } from '@hcengineering/tracker'
import { pruneStatusCondition } from '@hcengineering/tracker'
export { pruneStatusCondition } from '@hcengineering/tracker'

export function pruneBoardColumns (columns: BoardColumn[], allowed: ReadonlySet<Ref<Status>>): BoardColumn[] {
  return columns.map((column) => ({ ...column, statuses: column.statuses.filter((id) => allowed.has(id)) }))
}

export function pruneBoardStatusFilters (
  board: Board,
  allowed: ReadonlySet<Ref<Status>>,
  onRemoved?: (count: number) => void
): Pick<Board, 'filter' | 'quickFilters' | 'swimlanes' | 'colorRules' | 'columns'> {
  return {
    columns: pruneBoardColumns(board.columns, allowed),
    filter: pruneStatusCondition(board.filter, allowed, onRemoved),
    quickFilters: board.quickFilters.map((rule) => ({
      ...rule,
      condition: pruneStatusCondition(rule.condition, allowed, onRemoved)
    })),
    swimlanes: board.swimlanes.map((rule) => ({
      ...rule,
      condition: pruneStatusCondition(rule.condition, allowed, onRemoved)
    })),
    colorRules: board.colorRules.map((rule) => ({
      ...rule,
      condition: pruneStatusCondition(rule.condition, allowed, onRemoved)
    }))
  }
}

/** Serialize project changes and keep the last selection made while a change is in flight. */
export function createBoardProjectUpdater (
  getBoard: () => Board,
  load: (ids: Array<Ref<Project>>) => Promise<Project[]>,
  getAllowed: (projects: Project[]) => ReadonlySet<Ref<Status>> | undefined,
  save: (patch: Partial<Board>, removed: number) => Promise<void>,
  onBusy: (busy: boolean) => void,
  isActive: () => boolean = () => true
): (ids: Array<Ref<Project>>) => Promise<void> {
  const boardId = getBoard()._id
  const ownsBoard = (): boolean => isActive() && getBoard()._id === boardId
  let busy = false
  let pending: Array<Ref<Project>> | undefined
  return async (ids) => {
    if (!ownsBoard()) return
    pending = [...ids]
    if (busy) return
    busy = true
    onBusy(true)
    try {
      while (pending !== undefined) {
        if (!ownsBoard()) return
        const ids = pending
        pending = undefined
        const current = getBoard().projects
        if (ids.length === current.length && ids.every((id, index) => id === current[index])) continue
        let patch: Partial<Board> = { projects: ids }
        let removed = 0
        if (getBoard().projects.some((id) => !ids.includes(id))) {
          const projects = await load(ids)
          if (!ownsBoard()) return
          if (pending !== undefined) continue
          // Missing projects or model data must not erase saved configuration.
          const allowed = ids.every((id) => projects.some((project) => project._id === id))
            ? getAllowed(projects)
            : undefined
          if (allowed !== undefined) {
            patch = {
              ...pruneBoardStatusFilters(getBoard(), allowed, (count) => {
                removed += count
              }),
              ...patch
            }
          }
        }
        await save(patch, removed)
      }
    } finally {
      pending = undefined
      busy = false
      onBusy(false)
    }
  }
}
