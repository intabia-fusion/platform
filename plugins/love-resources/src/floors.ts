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
//
// Ordering of the office floors. The navigator shows the floors in the order the user dragged
// them into, so the position lives on the document (`Floor.order`) and nothing else.
//

import type { Ref, TxOperations } from '@hcengineering/core'
import type { Floor } from '@hcengineering/love'
import { moveItem, orderOf } from './groups'

/** New order of floor ids after `moved` is dropped onto `target`; unchanged order if either is unknown. */
export function reorderFloors (floors: Floor[], moved: Ref<Floor>, target: Ref<Floor>): Array<Ref<Floor>> {
  const ids = floors.map((it) => it._id)
  const from = ids.indexOf(moved)
  const to = ids.indexOf(target)
  return from === -1 || to === -1 ? ids : moveItem(ids, from, to)
}

/** Writes `order` for the floors whose position actually changed - one write per moved floor. */
export async function persistFloorOrder (
  client: TxOperations,
  floors: Floor[],
  ids: Array<Ref<Floor>>
): Promise<void> {
  for (const { id, order } of orderOf(ids)) {
    const floor = floors.find((it) => it._id === id)
    if (floor === undefined || floor.order === order) continue
    await client.diffUpdate(floor, { order })
  }
}
