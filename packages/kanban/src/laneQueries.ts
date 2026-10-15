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

import type { Doc, IdMap, Ref } from '@hcengineering/core'
import type { DocWithRank } from './types'

export interface LaneDocs {
  ids: Array<Ref<Doc>>
  docs: IdMap<DocWithRank>
  // The query for `ids` has not answered yet.
  pending: boolean
}

export interface LanePlan {
  drop: string[]
  run: Map<string, Array<Ref<Doc>>>
}

// Lane queries to drop and to (re)run: `current` holds the ids each lane queries now,
// `groups` the ids it must query.
export function planLaneQueries (current: Map<string, Array<Ref<Doc>>>, groups: Map<string, Array<Ref<Doc>>>): LanePlan {
  const drop: string[] = []
  const run = new Map<string, Array<Ref<Doc>>>()
  for (const key of current.keys()) {
    if ((groups.get(key)?.length ?? 0) === 0) drop.push(key)
  }
  for (const [key, ids] of groups) {
    if (ids.length === 0) continue
    if (current.get(key)?.join(',') !== ids.join(',')) run.set(key, ids)
  }
  return { drop, run }
}

// Docs of every lane. A pending lane keeps the previous copies of the ids it asks for:
// a card moving to another lane must not vanish until the lane it enters answers.
export function mergeLaneDocs (lanes: Iterable<LaneDocs>, previous: IdMap<DocWithRank>): IdMap<DocWithRank> {
  const all = Array.from(lanes)
  const merged: IdMap<DocWithRank> = new Map()
  for (const { docs } of all) docs.forEach((doc, id) => merged.set(id, doc))
  for (const { ids, pending } of all) {
    if (!pending) continue
    for (const id of ids as Array<Ref<DocWithRank>>) {
      const doc = previous.get(id)
      if (doc !== undefined && !merged.has(id)) merged.set(id, doc)
    }
  }
  return merged
}
