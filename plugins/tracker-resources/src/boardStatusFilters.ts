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
import type { Board, BoardColumn } from '@hcengineering/tracker'
import type { Filter } from '@hcengineering/view'

/** Remove unavailable statuses from saved conditions without changing unrelated filters. */
export function pruneStatusCondition (
  condition: string,
  allowed: ReadonlySet<Ref<Status>>,
  onRemoved?: (count: number) => void
): string {
  let filters: Filter[]
  try {
    filters = JSON.parse(condition)
  } catch {
    return condition
  }
  if (!Array.isArray(filters)) return condition
  let changed = false
  const kept = filters.flatMap((filter) => {
    if (filter?.key?.key !== 'status' || !Array.isArray(filter.value)) return [filter]
    const value = filter.value.filter((id) => id == null || allowed.has(id))
    if (value.length === filter.value.length) return [filter]
    onRemoved?.(filter.value.length - value.length)
    changed = true
    return value.length === 0 ? [] : [{ ...filter, value }]
  })
  return changed ? (kept.length === 0 ? '' : JSON.stringify(kept)) : condition
}

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
