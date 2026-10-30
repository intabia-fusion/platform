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

import activity, { type ActivityMessage } from '@hcengineering/activity'
import { type Doc, type DocPreview, type Domain, DOMAIN_DOC_PREVIEW, type Ref } from '@hcengineering/core'
import { type MigrationClient, type MigrationUpdate, updateEach } from '@hcengineering/model'
import { DOMAIN_ACTIVITY } from '@hcengineering/model-activity'
import { type DocNotifyContext } from '@hcengineering/notification'

import { DOMAIN_DOC_NOTIFY } from '../index'

type ContextRef = Pick<DocNotifyContext, '_id' | 'objectId' | 'objectClass'>

// A thread context points at its parent document's preview; runs after every step that creates contexts.
export async function fillContextPreviews (client: MigrationClient): Promise<void> {
  const counters = { done: 0, missing: 0, failed: 0 }
  const iterator = await client.traverse<DocNotifyContext>(
    DOMAIN_DOC_NOTIFY,
    { preview: { $exists: false } },
    { projection: { _id: 1, objectId: 1, objectClass: 1 } }
  )
  try {
    while (true) {
      const contexts = (await iterator.next(500)) ?? []
      if (contexts.length === 0) break
      const refs = await documentRefs(client, contexts)
      const previews = await findPreviews(client, Array.from(refs.values()))
      const updates: Array<MigrationUpdate<DocNotifyContext>> = []
      for (const context of contexts) {
        const ref = refs.get(context._id)
        const preview = ref != null ? previews.get(ref) : undefined
        if (preview == null) counters.missing++
        else updates.push({ filter: { _id: context._id }, update: { preview } })
      }
      const done = await updateEach(client, DOMAIN_DOC_NOTIFY, updates)
      counters.done += done
      counters.failed += updates.length - done
    }
  } finally {
    await iterator.close()
  }
  client.logger.log('context previews', counters)
}

// `<domain>:<id>` of the document each context shows.
async function documentRefs (
  client: MigrationClient,
  contexts: ContextRef[]
): Promise<Map<Ref<DocNotifyContext>, string>> {
  const { hierarchy } = client
  const isThread = (it: ContextRef): boolean => hierarchy.isDerived(it.objectClass, activity.class.ActivityMessage)
  const threads = contexts.filter(isThread)
  const parents =
    threads.length > 0
      ? await client.find<ActivityMessage>(
        DOMAIN_ACTIVITY,
        { _id: { $in: threads.map((it) => it.objectId as Ref<ActivityMessage>) } },
        { projection: { _id: 1, attachedTo: 1, attachedToClass: 1 } }
      )
      : []
  const parentOf = new Map(parents.map((it) => [it._id as Ref<Doc>, it]))
  const res = new Map<Ref<DocNotifyContext>, string>()
  for (const context of contexts) {
    const parent = isThread(context) ? parentOf.get(context.objectId) : undefined
    const [_id, _class] = isThread(context)
      ? [parent?.attachedTo, parent?.attachedToClass]
      : [context.objectId, context.objectClass]
    const domain = _class != null ? hierarchy.findDomain(_class) : undefined
    if (_id != null && domain != null) res.set(context._id, `${domain}:${_id}`)
  }
  return res
}

// By `<domain>:<id>` of the document, one query per domain
export async function findPreviews (client: MigrationClient, refs: string[]): Promise<Map<string, Ref<DocPreview>>> {
  const idsByDomain = new Map<Domain, Set<Ref<Doc>>>()
  for (const ref of refs) {
    const at = ref.indexOf(':')
    const domain = ref.slice(0, at) as Domain
    idsByDomain.set(domain, (idsByDomain.get(domain) ?? new Set()).add(ref.slice(at + 1) as Ref<Doc>))
  }
  const res = new Map<string, Ref<DocPreview>>()
  for (const [objectDomain, ids] of idsByDomain) {
    const previews = await client.find<DocPreview>(
      DOMAIN_DOC_PREVIEW,
      { objectDomain, objectId: { $in: Array.from(ids) } },
      { projection: { _id: 1, objectId: 1 } }
    )
    for (const it of previews) res.set(`${objectDomain}:${it.objectId}`, it._id)
  }
  return res
}
