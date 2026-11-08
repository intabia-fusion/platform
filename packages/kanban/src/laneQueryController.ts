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

import { reduceCalls, toIdMap, type Class, type Doc, type FindOptions, type IdMap, type Ref } from '@hcengineering/core'
import { createQuery, type LiveQuery } from '@hcengineering/presentation'
import { mergeLaneDocs, planLaneQueries, type LaneDocs } from './laneQueries'
import type { DocWithRank } from './types'

export interface LaneQueryController {
  sync: (
    groups: Map<string, Array<Ref<Doc>>>,
    cls: Ref<Class<DocWithRank>>,
    options: FindOptions<DocWithRank> | undefined
  ) => void
  destroy: () => void
}

export function createLaneQueryController (
  publish: (docs: IdMap<DocWithRank>, keys: Set<string>) => void
): LaneQueryController {
  const queries = new Map<string, LaneDocs & { query: LiveQuery }>()
  let loadedDocs: IdMap<DocWithRank> = new Map()
  let loadedKeys = new Set<string>()
  let lastOptionsKey = ''
  let lastClass: Ref<Class<DocWithRank>> | undefined
  let disposed = false

  // A burst of lane answers needs one board-wide merge, using the latest map contents.
  const refresh = reduceCalls(async () => {
    if (disposed) return
    loadedDocs = mergeLaneDocs(queries.values(), loadedDocs)
    publish(loadedDocs, new Set(loadedKeys))
  })

  return {
    sync (
      groups: Map<string, Array<Ref<Doc>>>,
      cls: Ref<Class<DocWithRank>>,
      options: FindOptions<DocWithRank> | undefined
    ): void {
      if (disposed) return
      const optionsKey = JSON.stringify(options)
      const optionsChanged = optionsKey !== lastOptionsKey || cls !== lastClass
      if (optionsChanged) {
        lastOptionsKey = optionsKey
        lastClass = cls
        queries.forEach(({ query }) => {
          query.unsubscribe()
        })
        queries.clear()
        loadedKeys = new Set()
      }
      const plan = planLaneQueries(new Map(Array.from(queries, ([key, { ids }]) => [key, ids])), groups)
      for (const key of plan.drop) {
        queries.get(key)?.query.unsubscribe()
        queries.delete(key)
        loadedKeys.delete(key)
      }
      for (const [key, ids] of plan.run) {
        const entry = queries.get(key) ?? { query: createQuery(true), ids, docs: new Map(), pending: true }
        queries.set(key, entry)
        entry.ids = ids
        entry.pending = true
        entry.query.query(
          cls,
          { _id: { $in: ids as Array<Ref<DocWithRank>> } },
          (docs) => {
            if (disposed || queries.get(key) !== entry || entry.ids !== ids) return
            entry.docs = toIdMap(docs)
            entry.pending = false
            loadedKeys.add(key)
            void refresh()
          },
          { ...options, limit: ids.length }
        )
      }
      // Docs of dropped queries stay in loadedDocs until the next result, so cards do not blink.
      if (queries.size === 0) loadedDocs = new Map()
      if (plan.drop.length > 0 || queries.size === 0 || optionsChanged) publish(loadedDocs, new Set(loadedKeys))
    },
    destroy (): void {
      disposed = true
      queries.forEach(({ query }) => {
        query.unsubscribe()
      })
      queries.clear()
    }
  }
}
