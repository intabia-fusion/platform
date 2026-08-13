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

import { Ref } from '@hcengineering/core'
import { ProjectType, TaskType } from './index'
import { getAllowedChildTaskTypes, getAllowedParentTaskTypes } from './utils'

describe('Task type hierarchy helpers', () => {
  const projectType1 = 'proj-1' as Ref<ProjectType>
  const projectType2 = 'proj-2' as Ref<ProjectType>

  const epic = {
    _id: 'epic' as Ref<TaskType>,
    parent: projectType1,
    name: 'Epic',
    isRootTaskType: true
  } as any as TaskType

  const issue = {
    _id: 'issue' as Ref<TaskType>,
    parent: projectType1,
    name: 'Issue',
    isRootTaskType: false
  } as any as TaskType

  const subtask = {
    _id: 'subtask' as Ref<TaskType>,
    parent: projectType1,
    name: 'Subtask',
    isRootTaskType: false,
    allowedAsChildOf: ['issue' as Ref<TaskType>]
  } as any as TaskType

  const otherProjectTask = {
    _id: 'other-task' as Ref<TaskType>,
    parent: projectType2,
    name: 'Other Task'
  } as any as TaskType

  const allTaskTypes = [epic, issue, subtask, otherProjectTask]

  describe('getAllowedChildTaskTypes', () => {
    it('returns allowed child task types for a parent task type', () => {
      const allowed = getAllowedChildTaskTypes(projectType1, issue._id, allTaskTypes)
      expect(allowed).toEqual([issue, subtask])
    })

    it('does not return root task types as child task types', () => {
      const allowed = getAllowedChildTaskTypes(projectType1, epic._id, allTaskTypes)
      expect(allowed.find((t) => t._id === epic._id)).toBeUndefined()
    })

    it('filters out child task types with restricted parent list that excludes target task type', () => {
      const allowed = getAllowedChildTaskTypes(projectType1, subtask._id, allTaskTypes)
      expect(allowed).toEqual([issue])
    })
  })

  describe('getAllowedParentTaskTypes', () => {
    it('returns allowed parent task types for a subtask type', () => {
      const allowed = getAllowedParentTaskTypes(projectType1, subtask._id, allTaskTypes)
      expect(allowed).toEqual([issue])
    })

    it('returns allowed parent task types for a standard task type', () => {
      const allowed = getAllowedParentTaskTypes(projectType1, issue._id, allTaskTypes)
      expect(allowed).toEqual([epic, issue])
    })

    it('returns empty array for root task type', () => {
      const allowed = getAllowedParentTaskTypes(projectType1, epic._id, allTaskTypes)
      expect(allowed).toEqual([])
    })
  })
})
