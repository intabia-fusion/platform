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

import activity, { type ActivityReference } from '@hcengineering/activity'
import { notEmpty, type Doc, type Domain } from '@hcengineering/core'
import type { MigrationClient, MigrationDocumentQuery, MigrateUpdate } from '@hcengineering/model'

// The domains are supplied by migration.ts to avoid importing the model's index during its initialization.
export async function migrateTaskReferenceClasses (
  client: MigrationClient,
  taskDomain: Domain,
  activityDomain: Domain
): Promise<void> {
  const iterator = await client.traverse<ActivityReference>(activityDomain, {
    _class: activity.class.ActivityReference
  }, {
    projection: {
      _id: 1,
      attachedTo: 1,
      attachedToClass: 1,
      srcDocId: 1,
      srcDocClass: 1,
      attachedDocId: 1,
      attachedDocClass: 1
    }
  })
  try {
    while (true) {
      const references = (await iterator.next(500)) ?? []

      if (references.length === 0) break

      const ids = [...new Set(references.flatMap((ref) => [ref.srcDocId, ref.attachedTo, ref.attachedDocId])
        .filter(notEmpty))]

      const tasks = await client.find<Doc>(taskDomain, { _id: { $in: ids } }, {
        projection: { _id: 1, _class: 1 }
      })

      const classes = new Map(tasks.filter((doc) => client.hierarchy.hasClass(doc._class))
        .map((doc) => [doc._id, doc._class]))

      const operations: {
        filter: MigrationDocumentQuery<ActivityReference>
        update: MigrateUpdate<ActivityReference>
      }[] = []

      for (const reference of references) {
        const update: MigrateUpdate<ActivityReference> = {}
        const pointers = [
          [reference.srcDocId, 'srcDocClass'],
          [reference.attachedTo, 'attachedToClass'],
          [reference.attachedDocId, 'attachedDocClass']
        ] as const

        for (const [id, key] of pointers) {
          const clazz = id !== undefined ? classes.get(id) : undefined

          if (clazz !== undefined && reference[key] !== clazz) update[key] = clazz
        }

        if (Object.keys(update).length > 0) operations.push({ filter: { _id: reference._id }, update })
      }

      if (operations.length > 0) await client.bulk(activityDomain, operations)
    }
  } finally {
    await iterator.close()
  }
}
