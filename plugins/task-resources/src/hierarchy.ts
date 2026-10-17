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

import type { Ref } from '@hcengineering/core'
import type { TaskType } from '@hcengineering/task'

export interface AncestorLevel {
  // "any type" level, the chain ends here
  any: boolean
  types: TaskType[]
}

export function getParentTypes (type: TaskType, taskTypes: TaskType[]): TaskType[] {
  if (type.allowAnyParent === true) return taskTypes
  const allowed = new Set(type.allowedAsChildOf ?? [])
  return taskTypes.filter((t) => allowed.has(t._id))
}

/** Ancestor levels above the direct parents, topmost first. Each type appears once, at its first (closest) level. */
export function getAncestorLevels (type: TaskType, taskTypes: TaskType[]): AncestorLevel[] {
  if (type.allowAnyParent === true) return []
  const seen = new Set([type._id])
  let frontier = getParentTypes(type, taskTypes)
  frontier.forEach((t) => seen.add(t._id))

  const levels: AncestorLevel[] = []
  while (frontier.length > 0) {
    if (frontier.some((t) => t.allowAnyParent === true)) {
      levels.push({ any: true, types: [] })
      break
    }
    const next = [...new Map(frontier.flatMap((t) => getParentTypes(t, taskTypes)).map((t) => [t._id, t])).values()]
    const fresh = next.filter((t) => !seen.has(t._id))
    fresh.forEach((t) => seen.add(t._id))
    if (fresh.length > 0) levels.push({ any: false, types: fresh })
    frontier = fresh
  }
  return levels.reverse()
}

export function getChildTypes (type: TaskType, taskTypes: TaskType[]): TaskType[] {
  return taskTypes.filter((t) => t.allowAnyParent === true || (t.allowedAsChildOf ?? []).includes(type._id))
}

export interface ParentsUpdate {
  allowAnyParent: boolean
  allowedAsChildOf: Array<Ref<TaskType>>
}

/** Update of `type` that makes `parentId` one of its parents. All types selected means "any type". */
export function addParentTo (type: TaskType, parentId: Ref<TaskType>, taskTypes: TaskType[]): ParentsUpdate {
  const current = type.allowedAsChildOf ?? []
  const ids = current.includes(parentId) ? current : [...current, parentId]
  return { allowAnyParent: ids.length === taskTypes.length, allowedAsChildOf: ids }
}

/** Update of `type` that drops `parentId` from its parents; "any type" is expanded into the explicit rest. */
export function removeParentFrom (type: TaskType, parentId: Ref<TaskType>, taskTypes: TaskType[]): ParentsUpdate {
  const source = type.allowAnyParent === true ? taskTypes.map((t) => t._id) : (type.allowedAsChildOf ?? [])
  return { allowAnyParent: false, allowedAsChildOf: source.filter((id) => id !== parentId) }
}
