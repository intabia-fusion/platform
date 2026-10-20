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

import core, { type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import view, { type FilteredView, type FilteredViewPreference } from '@hcengineering/view'

export function applySavedViewOrder (views: FilteredView[], order: Array<Ref<FilteredView>>): FilteredView[] {
  const positions = new Map<Ref<FilteredView>, number>(order.map((id, index) => [id, index]))
  return [...views].sort((a, b) => {
    const pa = positions.get(a._id)
    const pb = positions.get(b._id)
    if (pa !== undefined || pb !== undefined) {
      if (pa === undefined) return 1
      if (pb === undefined) return -1
      if (pa !== pb) return pa - pb
    }
    const createdDiff = (a.createdOn ?? 0) - (b.createdOn ?? 0)
    if (createdDiff !== 0) return createdDiff
    return a._id.localeCompare(b._id)
  })
}

export async function setSavedViewOrder (
  alias: string,
  order: Array<Ref<FilteredView>>,
  preference?: FilteredViewPreference
): Promise<void> {
  const client = getClient()
  const target =
    preference ??
    (await client.findOne<FilteredViewPreference>(view.class.FilteredViewPreference, {
      attachedTo: alias
    }))

  if (target === undefined) {
    await client.createDoc(view.class.FilteredViewPreference, core.space.Workspace, {
      attachedTo: alias,
      views: order
    })
  } else {
    await client.update(target, { views: order })
  }
}
