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

import type { Doc, Ref, Status } from '@hcengineering/core'
import type { ProjectType, TaskType } from '@hcengineering/task'
import { getProjectStatusFilterValues } from '../statusFilter'

const ref = <T extends Doc>(id: string): Ref<T> => id as Ref<T>
const backlog = { _id: ref<Status>('backlog'), name: 'Backlog' } as unknown as Status
const otherBacklog = { _id: ref<Status>('other-backlog'), name: 'Backlog' } as unknown as Status
const shared = { _id: ref<Status>('shared'), name: 'Done' } as unknown as Status
const unused = { _id: ref<Status>('unused'), name: 'Unused' } as unknown as Status
const statuses = new Map([backlog, otherBacklog, shared, unused].map((status) => [status._id, status]))
function projectType (id: string, name: string, ids: Status[]): ProjectType {
  return {
    _id: ref<ProjectType>(id),
    name,
    statuses: ids.map((status) => ({ _id: status._id, taskType: ref<TaskType>(id + '-task') }))
  } as unknown as ProjectType
}
const first = projectType('first', 'Первый тип', [backlog, shared])
const second = projectType('second', 'Второй тип', [otherBacklog, shared])

describe('board status filter project scope', () => {
  it('offers only statuses of the included project type, even when other types have identical names', () => {
    expect(getProjectStatusFilterValues([first], statuses).values).toEqual([backlog, shared])
    expect(getProjectStatusFilterValues([second], statuses).values).toEqual([otherBacklog, shared])
  })

  it('shows no type labels for multiple projects of the same type', () => {
    const result = getProjectStatusFilterValues([first, first], statuses)
    expect(result.values).toEqual([backlog, shared])
    expect(result.typeNames.size).toBe(0)
  })

  it('distinguishes identical names and lists all owners of a shared status for different types', () => {
    const result = getProjectStatusFilterValues([first, second], statuses)
    expect(result.values).toEqual([backlog, shared, otherBacklog])
    expect(result.typeNames.get(backlog._id)).toBe('Первый тип')
    expect(result.typeNames.get(otherBacklog._id)).toBe('Второй тип')
    expect(result.typeNames.get(shared._id)).toBe('Первый тип, Второй тип')
  })

  it('does not fall back to workspace statuses for an empty or unavailable project scope', () => {
    expect(getProjectStatusFilterValues([], statuses).values).toEqual([])
    expect(getProjectStatusFilterValues([projectType('empty', 'Empty', [])], statuses).values).toEqual([])
  })

  it('ignores unassigned and missing statuses and duplicate placements within a type', () => {
    const type = projectType('first', 'First', [backlog, backlog, { _id: ref<Status>('missing') } as unknown as Status])
    type.statuses.push({ _id: unused._id })
    const result = getProjectStatusFilterValues([type, second], statuses)
    expect(result.values).toEqual([backlog, otherBacklog, shared])
    expect(result.typeNames.get(backlog._id)).toBe('First')
  })

  it('recalculates available values and labels after removing a project type', () => {
    const before = getProjectStatusFilterValues([first, second], statuses)
    const after = getProjectStatusFilterValues([first], statuses)
    expect(before.values).toContain(otherBacklog)
    expect(after.values).not.toContain(otherBacklog)
    expect(after.typeNames.size).toBe(0)
  })
})
