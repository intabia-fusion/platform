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

import attachment, { LINK_PREVIEW_TYPE, type Attachment } from '@hcengineering/attachment'
import { chatMessageFacet, type ChatMessage } from '@hcengineering/chunter'
import type { Doc, Hierarchy, MeasureContext, Ref } from '@hcengineering/core'
import type { SearchFacets, WithFind } from '@hcengineering/server-core'
import { extractLinks, isEmptyMarkup, markupToJSON } from '@hcengineering/text-core'

// A message pasting a long list of urls would otherwise flood the index with facets.
const MAX_LINKS = 100

// Previews of the whole indexing batch, loaded by the first message that needs them.
const batchPreviews = new WeakMap<Doc[], Promise<Map<Ref<Doc>, Attachment[]>>>()

async function loadPreviews (
  ctx: MeasureContext,
  storage: WithFind,
  batch: Doc[]
): Promise<Map<Ref<Doc>, Attachment[]>> {
  const ids = batch.filter((d) => ((d as ChatMessage).attachments ?? 0) > 0).map((d) => d._id)
  const result = new Map<Ref<Doc>, Attachment[]>()
  if (ids.length === 0) return result
  let previews: Attachment[] = []
  try {
    previews = await storage.findAll<Attachment>(
      ctx,
      attachment.class.Attachment,
      { attachedTo: { $in: ids }, type: LINK_PREVIEW_TYPE },
      { projection: { _id: 1, attachedTo: 1, metadata: 1 } }
    )
  } catch (err: any) {
    // Preview titles only add text; a failure must not take the link facets of the whole batch with it.
    ctx.error('failed to load link previews', { err })
  }
  for (const preview of previews) {
    const list = result.get(preview.attachedTo) ?? []
    list.push(preview)
    result.set(preview.attachedTo, list)
  }
  return result
}

/**
 * @public
 */
export async function ChatMessageSearchFacets (
  doc: Doc,
  _hierarchy: Hierarchy,
  ctx: MeasureContext,
  storage: WithFind,
  batch: Doc[] = [doc]
): Promise<SearchFacets> {
  const message = doc as ChatMessage
  if (message.message == null || message.message === '' || isEmptyMarkup(message.message))  return { values: [] }

  const links = extractLinks(markupToJSON(message.message), MAX_LINKS)
  if (links.length === 0) return { values: [] }

  const values = [chatMessageFacet.link]
  const extra = links.map((l) => l.url)

  // A preview is made from a link of the message, so only a message with links can have one.
  if ((message.attachments ?? 0) > 0) {
    let previews = batchPreviews.get(batch)
    if (previews === undefined) {
      previews = loadPreviews(ctx, storage, batch)
      batchPreviews.set(batch, previews)
    }
    for (const preview of (await previews).get(message._id) ?? []) {
      for (const value of [preview.metadata?.title, preview.metadata?.description]) {
        if (typeof value === 'string' && value !== '') extra.push(value)
      }
    }
  }

  return { values, extra: extra.join('\n') }
}
