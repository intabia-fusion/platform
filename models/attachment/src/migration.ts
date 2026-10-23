//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
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

import { type Attachment, type Drawing, type SavedAttachments } from '@hcengineering/attachment'
import { type Doc, type Domain, type Ref } from '@hcengineering/core'
import {
  tryMigrate,
  type MigrateOperation,
  type MigrationClient,
  type MigrationUpgradeClient
} from '@hcengineering/model'
import { removeOrphanPreferences } from '@hcengineering/model-preference'
import attachment, { attachmentId, DOMAIN_ATTACHMENT } from '.'

export const attachmentOperation: MigrateOperation = {
  async migrate (client: MigrationClient, mode): Promise<void> {
    await tryMigrate(mode, client, attachmentId, [
      {
        state: 'fix-attachedTo',
        mode: 'upgrade',
        func: async (client: MigrationClient): Promise<void> => {
          await client.update(
            DOMAIN_ATTACHMENT,
            { _class: attachment.class.Attachment, attachedToClass: 'chunter:class:Comment' },
            {
              attachedToClass: 'chunter:class:ChatMessage'
            }
          )
        }
      },
      {
        state: 'remove-orphan-saved-attachments-v1',
        mode: 'upgrade',
        func: async (client: MigrationClient): Promise<void> => {
          await removeOrphanPreferences(client, attachment.class.SavedAttachments, attachment.class.Attachment)
        }
      },
      {
        state: 'remove-orphan-attachments-v1',
        mode: 'upgrade',
        func: removeOrphanAttachments
      }
    ])
  },
  async upgrade (state: Map<string, Set<string>>, client: () => Promise<MigrationUpgradeClient>): Promise<void> {}
}

export async function removeOrphanAttachments (client: MigrationClient): Promise<void> {
  const { hierarchy } = client
  const iterator = await client.traverse<Attachment>(DOMAIN_ATTACHMENT, {
    _class: { $in: hierarchy.getDescendants(attachment.class.Attachment) }
  })
  let removed = 0
  try {
    while (true) {
      const files = (await iterator.next(500)) ?? []
      if (files.length === 0) break
      const orphans = await findOrphans(client, files)
      if (orphans.length > 0) {
        await removeAttachments(client, orphans)
        removed += orphans.length
      }
    }
  } finally {
    await iterator.close()
  }
  client.logger.log('orphan attachments removed', { removed })
}

async function findOrphans (client: MigrationClient, files: Attachment[]): Promise<Attachment[]> {
  const byDomain = new Map<Domain, Set<Ref<Doc>>>()
  for (const file of files) {
    // A class gone from the model leaves no domain to look in: its files go too.
    const domain = client.hierarchy.findDomain(file.attachedToClass)
    if (domain === undefined) continue
    const ids = byDomain.get(domain) ?? new Set()
    ids.add(file.attachedTo)
    byDomain.set(domain, ids)
  }
  const alive = new Set<Ref<Doc>>()
  for (const [domain, ids] of byDomain) {
    // By id only: a card that changed its type keeps its files under the old class.
    const found = await client.find<Doc>(domain, { _id: { $in: Array.from(ids) } }, { projection: { _id: 1 } })
    for (const doc of found) alive.add(doc._id)
  }
  return files.filter((it) => !alive.has(it.attachedTo))
}

// What removal by transaction does in `OnAttachmentDelete`, done by hand: raw deletion runs no triggers.
async function removeAttachments (client: MigrationClient, orphans: Attachment[]): Promise<void> {
  const ids = orphans.map((it) => it._id)
  const blobs = Array.from(new Set(orphans.map((it) => it.file)))
  // A copied file shares its blob with the copy: that one stays while another attachment points at it.
  const shared = await client.find<Attachment>(
    DOMAIN_ATTACHMENT,
    { file: { $in: blobs }, _id: { $nin: ids } },
    { projection: { file: 1 } }
  )
  const kept = new Set(shared.map((it) => it.file))
  const unused = blobs.filter((it) => !kept.has(it))

  await client.deleteMany<Attachment>(DOMAIN_ATTACHMENT, { _id: { $in: ids } })
  const savedDomain = client.hierarchy.findDomain(attachment.class.SavedAttachments)
  if (savedDomain !== undefined) {
    await client.deleteMany<SavedAttachments>(savedDomain, {
      _class: attachment.class.SavedAttachments,
      attachedTo: { $in: ids }
    })
  }
  if (unused.length > 0) {
    await client.deleteMany<Drawing>(DOMAIN_ATTACHMENT, { _class: attachment.class.Drawing, parent: { $in: unused } })
    await client.storageAdapter.remove(client.ctx, client.wsIds, unused)
  }
}
