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

import core, { type AnyAttribute, type Class, type Client, type Doc, type Ref, type RefTo } from '@hcengineering/core'

interface PublicLink extends Doc {
  attachedTo: Ref<Doc>
  attachedToClass?: Ref<Class<Doc>>
}

interface PersonWithAvatar extends Doc {
  avatar?: string
}

/** Uses the guest client, so revoked links and moved/deleted objects are filtered by the normal pipeline. */
export async function canReadPublicFile (
  client: Client,
  linkId: string,
  file: string,
  loadMarkup?: (blob: string) => Promise<string | undefined>
): Promise<boolean> {
  const link = await client.findOne('guest:class:PublicLink' as Ref<Class<PublicLink>>, {
    _id: linkId as Ref<PublicLink>
  })
  const hierarchy = client.getHierarchy()
  if (link?.attachedToClass === undefined || !hierarchy.hasClass(link.attachedToClass)) return false
  const doc = await client.findOne(link.attachedToClass, { _id: link.attachedTo })
  if (doc === undefined) return false

  const fileAttributes = (_class: Ref<Class<Doc>>): Array<[string, AnyAttribute]> =>
    Array.from(hierarchy.getAllAttributes(_class)).filter(
      ([, attr]) =>
        attr.type._class === core.class.TypeBlob ||
        (attr.type._class === core.class.RefTo && (attr.type as RefTo<Doc>).to === core.class.Blob)
    )

  for (const [name] of fileAttributes(doc._class)) {
    if ((doc as unknown as Record<string, unknown>)[name] === file) return true
  }
  // The schema identifies file-bearing attached classes; this covers Attachment and FileVersion
  // without coupling the endpoint to individual product plugins or accepting arbitrary string fields.
  const checkedFields = new Set<string>()
  for (const _class of hierarchy.getDescendants(core.class.AttachedDoc)) {
    for (const [name, attribute] of fileAttributes(_class as Ref<Class<Doc>>)) {
      const key = JSON.stringify([attribute.attributeOf, name])
      if (checkedFields.has(key)) continue
      checkedFields.add(key)
      const attachment = await client.findOne(
        attribute.attributeOf as Ref<Class<Doc>>,
        {
          attachedTo: doc._id,
          attachedToClass: { $in: hierarchy.getAncestors(doc._class) },
          [name]: file
        } as any
      )
      if (attachment !== undefined) return true
    }
  }
  // Author and assignee are in the guest's person scope. Query through that same client
  // so an avatar belonging to an unrelated person does not become public.
  const personClass = 'contact:class:Person' as Ref<Class<PersonWithAvatar>>
  if (hierarchy.hasClass(personClass) && (await client.findOne(personClass, { avatar: file })) !== undefined) {
    return true
  }
  for (const [name, attribute] of hierarchy.getAllAttributes(doc._class)) {
    const value = (doc as unknown as Record<string, unknown>)[name]
    if (typeof value !== 'string') continue
    let markup: string | undefined
    if (attribute.type._class === core.class.TypeMarkup) markup = value
    else if (attribute.type._class === core.class.TypeCollaborativeDoc) markup = await loadMarkup?.(value)
    if (markup !== undefined && markupHasFile(markup, file)) return true
  }
  return false
}

function markupHasFile (markup: string, file: string): boolean {
  let root: unknown
  try {
    root = JSON.parse(markup)
  } catch {
    return false
  }
  const nodes: unknown[] = [root]
  while (nodes.length > 0) {
    const value = nodes.pop()
    if (value === null || typeof value !== 'object') continue
    const node = value as { type?: string, attrs?: Record<string, unknown>, content?: unknown[] }
    if (node.type === 'image' && node.attrs?.['file-id'] === file) return true
    if (node.type === 'emoji' && node.attrs?.kind === 'image' && node.attrs.image === file) return true
    if (Array.isArray(node.content)) nodes.push(...node.content)
  }
  return false
}
