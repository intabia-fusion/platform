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

import {
  type AccountUuid,
  type DocPreview,
  DOMAIN_DOC_PREVIEW,
  DOMAIN_SPACE,
  type Ref,
  type Space,
  toPreviewSnapshot
} from '@hcengineering/core'
import { type MigrationClient, type MigrationUpdate, updateEach } from '@hcengineering/model'
import { type DocNotifyContext } from '@hcengineering/notification'

import { DOMAIN_DOC_NOTIFY } from '../index'

type SnapshotContext = Pick<
  DocNotifyContext,
  '_id' | 'user' | 'objectId' | 'objectSpace' | 'preview' | 'previewSnapshot'
>

// The snapshots and spaces the triggers keep, for contexts made before them: the preview's space, as `objectSpace` stayed behind a moved document
export async function fillPreviewSnapshots (client: MigrationClient): Promise<void> {
  const counters = { snapshots: 0, moved: 0, failed: 0 }
  const spaces = await client.find<Space>(DOMAIN_SPACE, { private: true }, { projection: { _id: 1, members: 1 } })
  const membersOf = new Map(spaces.map((it) => [it._id, new Set<AccountUuid>(it.members)]))

  const iterator = await client.traverse<DocNotifyContext>(
    DOMAIN_DOC_NOTIFY,
    { preview: { $exists: true } },
    { projection: { _id: 1, user: 1, objectId: 1, objectSpace: 1, preview: 1, previewSnapshot: 1 } }
  )
  try {
    while (true) {
      const contexts = ((await iterator.next(500)) ?? []) as SnapshotContext[]
      if (contexts.length === 0) break
      const ids = [...new Set(contexts.map((it) => it.preview as Ref<DocPreview>))]
      const previews = await client.find<DocPreview>(DOMAIN_DOC_PREVIEW, { _id: { $in: ids } })
      const byId = new Map(previews.map((it) => [it._id, it]))

      const updates: Array<MigrationUpdate<DocNotifyContext>> = []
      for (const context of contexts) {
        const preview = byId.get(context.preview as Ref<DocPreview>)
        if (preview == null) continue
        const update: Partial<DocNotifyContext> = {}
        // A document's and its threads' contexts follow it; the chat of a space keeps the space it was made in
        if (preview.objectId !== preview.space && context.objectSpace !== preview.space) {
          update.objectSpace = preview.space
        }
        const members = membersOf.get(preview.space)
        if (context.previewSnapshot == null && members != null && !members.has(context.user)) {
          update.previewSnapshot = toPreviewSnapshot(preview)
        }
        if (Object.keys(update).length === 0) continue
        if (update.objectSpace != null) counters.moved++
        if (update.previewSnapshot != null) counters.snapshots++
        updates.push({ filter: { _id: context._id }, update })
      }
      const done = await updateEach(client, DOMAIN_DOC_NOTIFY, updates)
      counters.failed += updates.length - done
    }
  } finally {
    await iterator.close()
  }
  client.logger.log('preview snapshots', counters)
}
