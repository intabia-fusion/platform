//
// Copyright © 2023 Hardcore Engineering Inc.
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

import core, {
  type Class,
  type Doc,
  type DocPreview,
  type Domain,
  DOMAIN_DOC_PREVIEW,
  DOMAIN_MODEL,
  generateId,
  groupByArray,
  notEmpty,
  type Ref,
  toFindResult
} from '@hcengineering/core'
import {
  tryMigrate,
  type MigrateOperation,
  type MigrationClient,
  type MigrationUpgradeClient,
  type MigrateMode,
  createEach,
  updateEach,
  written
} from '@hcengineering/model'
import {
  getPreviewData,
  hasPreview,
  previewSpace,
  serverActivityId,
  type PresenterControl
} from '@hcengineering/server-activity'

const DOMAIN_CHUNTER_DOC = 'chunter-doc' as Domain
const BATCH = 500

interface ChatRefs extends Doc {
  attachedTo: Ref<Doc>
  attachedToClass: Ref<Class<Doc>>
}

interface DocRef {
  domain: Domain
  id: Ref<Doc>
}

const refKey = (ref: DocRef): string => `${ref.domain}:${ref.id}`

function presenterControl (client: MigrationClient): PresenterControl {
  const { hierarchy } = client
  return {
    hierarchy,
    modelDb: client.model,
    ctx: client.ctx as PresenterControl['ctx'],
    branding: null,
    workspace: client.wsIds,
    findAll: async (_ctx, _class, query, options) => {
      const base = hierarchy.isMixin(_class) ? hierarchy.getBaseClass(_class) : _class
      const domain = hierarchy.findDomain(base)
      if (domain == null) return toFindResult([])
      if (domain === DOMAIN_MODEL) return await client.model.findAll(_class, query, options)
      const classes = hierarchy.getDescendants(base)
      return toFindResult(await client.find(domain, { ...query, _class: { $in: classes } }, options))
    }
  }
}

function previewClasses (client: MigrationClient): Ref<Class<Doc>>[] {
  const { hierarchy } = client
  const control = presenterControl(client)
  return hierarchy.getDescendants(core.class.Doc).filter((_class) => {
    const domain = hierarchy.findDomain(_class)
    return domain != null && domain !== DOMAIN_MODEL && hasPreview(control, _class)
  })
}

async function newPreview (control: PresenterControl, doc: Doc): Promise<DocPreview> {
  const now = Date.now()
  return {
    _id: generateId(),
    _class: core.class.DocPreview,
    space: previewSpace(control, doc),
    modifiedOn: now,
    modifiedBy: core.account.System,
    createdOn: now,
    createdBy: core.account.System,
    ...(await getPreviewData(control, doc))
  }
}

// A preview for every document of the class that has none: the unique index forbids a second one
async function createDocPreviews (client: MigrationClient, _class: Ref<Class<Doc>>): Promise<void> {
  const control = presenterControl(client)
  const domain = client.hierarchy.getDomain(_class)
  const counters = { done: 0, failed: 0 }
  const iterator = await client.traverse<Doc>(domain, { _class })
  try {
    while (true) {
      const docs = (await iterator.next(BATCH)) ?? []
      if (docs.length === 0) break

      // A failed step starts over on every upgrade: a bad batch is logged and skipped instead
      await written(client, 'doc previews: batch skipped', { domain, from: docs[0]._id }, async () => {
        const existing = new Set(
          (
            await client.find<DocPreview>(
              DOMAIN_DOC_PREVIEW,
              { objectDomain: domain, objectId: { $in: docs.map((it) => it._id) } },
              { projection: { objectId: 1 } }
            )
          ).map((it) => it.objectId)
        )
        const previews: DocPreview[] = []
        for (const doc of docs) {
          if (!existing.has(doc._id)) previews.push(await newPreview(control, doc))
        }
        const created = await createEach(client, DOMAIN_DOC_PREVIEW, previews)
        counters.done += created
        counters.failed += previews.length - created
      })
    }
  } finally {
    await iterator.close()
  }
  client.logger.log('doc previews', { _class, ...counters })
}

async function findPreviews (client: MigrationClient, refs: DocRef[]): Promise<Map<string, Ref<DocPreview>>> {
  const res = new Map<string, Ref<DocPreview>>()
  for (const [domain, ids] of groupByDomain(refs)) {
    const previews = await client.find<DocPreview>(
      DOMAIN_DOC_PREVIEW,
      { objectDomain: domain, objectId: { $in: ids } },
      { projection: { _id: 1, objectId: 1 } }
    )
    for (const it of previews) res.set(refKey({ domain, id: it.objectId }), it._id)
  }
  return res
}

async function findGone (client: MigrationClient, refs: DocRef[]): Promise<Set<string>> {
  const gone = new Set<string>()
  for (const [domain, ids] of groupByDomain(refs)) {
    const found = new Set(
      (await client.find<Doc>(domain, { _id: { $in: ids } }, { projection: { _id: 1 } })).map((it) => it._id)
    )
    for (const id of ids) {
      if (!found.has(id)) gone.add(refKey({ domain, id }))
    }
  }
  return gone
}

function groupByDomain (refs: DocRef[]): Map<Domain, Array<Ref<Doc>>> {
  const groups = groupByArray(refs, (it) => it.domain)
  return new Map(Array.from(groups, ([domain, group]) => [domain, Array.from(new Set(group.map((it) => it.id)))]))
}

async function fillChatRefs (client: MigrationClient): Promise<void> {
  const { hierarchy } = client
  const iterator = await client.traverse<ChatRefs>(
    DOMAIN_CHUNTER_DOC,
    { preview: { $exists: false } },
    { projection: { _id: 1, attachedTo: 1, attachedToClass: 1 } }
  )
  const counters = { done: 0, orphans: 0, failed: 0 }
  try {
    while (true) {
      const chats = (await iterator.next(BATCH)) ?? []
      if (chats.length === 0) break

      await written(client, 'chat preview refs: batch skipped', { from: chats[0]._id }, async () => {
        const refOf = (chat: ChatRefs): DocRef | undefined => {
          const domain = hierarchy.findDomain(chat.attachedToClass)
          return domain != null ? { domain, id: chat.attachedTo } : undefined
        }
        const refs = chats.map(refOf).filter(notEmpty)
        const previews = await findPreviews(client, refs)
        const gone = await findGone(
          client,
          refs.filter((it) => !previews.has(refKey(it)))
        )

        const updates = []
        const orphans: Ref<Doc>[] = []
        for (const chat of chats) {
          const ref = refOf(chat)
          const preview = ref != null ? previews.get(refKey(ref)) : undefined
          if (preview == null) {
            // The chat of a document that is gone goes too; one of a document without a preview stays hidden
            if (ref != null && gone.has(refKey(ref))) orphans.push(chat._id)
            else counters.failed++
            continue
          }
          updates.push({ filter: { _id: chat._id }, update: { preview } })
        }
        const updated = await updateEach(client, DOMAIN_CHUNTER_DOC, updates)
        counters.done += updated
        counters.failed += updates.length - updated
        if (orphans.length > 0) {
          if (
            await written(client, 'orphan chats not removed', { from: orphans[0] }, () =>
              client.deleteMany(DOMAIN_CHUNTER_DOC, { _id: { $in: orphans } })
            )
          ) {
            counters.orphans += orphans.length
          } else {
            counters.failed += orphans.length
          }
        }
      })
      client.logger.log('chat preview refs', counters)
    }
  } finally {
    await iterator.close()
  }
}

export const activityServerOperation: MigrateOperation = {
  async migrate (client: MigrationClient, mode: MigrateMode): Promise<void> {
    // A state per class: a class that gains a preview later gets its backfill with the next upgrade.
    const previews = previewClasses(client).map((_class) => ({
      state: `doc-previews-v3:${_class}`,
      mode: 'upgrade' as const,
      func: async (client: MigrationClient) => {
        await createDocPreviews(client, _class)
      }
    }))
    await tryMigrate(mode, client, serverActivityId, [
      ...previews,
      {
        state: 'chat-preview-refs-v1',
        mode: 'upgrade',
        func: fillChatRefs
      }
    ])
  },
  async upgrade (state: Map<string, Set<string>>, client: () => Promise<MigrationUpgradeClient>): Promise<void> {}
}
