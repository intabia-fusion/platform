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
import type { ProjectType } from '@hcengineering/task'

/** Statuses offered by an explicit project scope, with labels only when types need distinguishing. */
export function getProjectStatusFilterValues (
  projectTypes: ProjectType[],
  statuses: ReadonlyMap<Ref<Status>, Status>
): { values: Status[], typeNames: Map<Ref<Status>, string> } {
  const types = [...new Map(projectTypes.map((type) => [type._id, type])).values()]
  const names = new Map<Ref<Status>, string[]>()
  for (const type of types) {
    for (const id of new Set(type.statuses.filter((entry) => entry.taskType !== undefined).map((entry) => entry._id))) {
      if (!statuses.has(id)) continue
      const labels = names.get(id) ?? []
      labels.push(type.name)
      names.set(id, labels)
    }
  }
  return {
    values: [...names.keys()].map((id) => statuses.get(id) as Status),
    typeNames: types.length > 1 ? new Map([...names].map(([id, labels]) => [id, labels.join(', ')])) : new Map()
  }
}
