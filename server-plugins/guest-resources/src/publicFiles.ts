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

import core, {
  type AnyAttribute,
  type ArrOf,
  type Class,
  type Client,
  type Doc,
  type Ref,
  type RefTo
} from '@hcengineering/core'

interface Person extends Doc {
  avatar?: string
}
interface Identity extends Doc {
  attachedTo: Ref<Person>
}
const personClass = 'contact:class:Person' as Ref<Class<Person>>
const identityClass = 'contact:class:SocialIdentity' as Ref<Class<Identity>>

/**
 * Collects the file scope of an already-authorized publication target. The caller must
 * validate PublicLink and its current space before publishing this set to Datalake.
 * No permissions are written here. Snapshot/read failures propagate: never publish a partial set.
 */
export async function collectPublicFiles (
  client: Pick<Client, 'findAll' | 'getHierarchy'>,
  doc: Doc,
  loadMarkup: (snapshot: string) => Promise<string>
): Promise<string[]> {
  const h = client.getHierarchy()
  const files = new Set<string>()
  const add = (value: unknown): void => {
    if (
      typeof value === 'string' &&
      value !== '' &&
      !value.includes('://') &&
      !value.startsWith('data:') &&
      !value.startsWith('blob:')
    ) {
      files.add(value)
    }
  }
  const valueOf = (object: Doc, name: string): unknown => (object as unknown as Record<string, unknown>)[name]
  const blobAttributes = (_class: Ref<Class<Doc>>): Array<[string, AnyAttribute]> =>
    [...h.getAllAttributes(_class)].filter(
      ([, attr]) =>
        attr.type._class === core.class.TypeBlob ||
        (attr.type._class === core.class.RefTo && (attr.type as RefTo<Doc>).to === core.class.Blob)
    )

  for (const [name] of blobAttributes(doc._class)) add(valueOf(doc, name))
  const owners = new Map<Ref<Class<Doc>>, Set<string>>()
  for (const _class of h.getDescendants(core.class.AttachedDoc)) {
    for (const [name, attr] of blobAttributes(_class as Ref<Class<Doc>>)) {
      const owner = attr.attributeOf as Ref<Class<Doc>>
      let names = owners.get(owner)
      if (names === undefined) owners.set(owner, (names = new Set()))
      names.add(name)
    }
  }
  for (const [owner, names] of owners) {
    const attached = await client.findAll(owner, {
      attachedTo: doc._id,
      attachedToClass: { $in: h.getAncestors(doc._class) }
    } as any)
    for (const child of attached) {
      for (const name of names) add(valueOf(child, name))
    }
  }

  for (const [name, attr] of h.getAllAttributes(doc._class)) {
    const value = valueOf(doc, name)
    if (typeof value !== 'string' || value === '') continue
    const markup =
      attr.type._class === core.class.TypeMarkup
        ? value
        : attr.type._class === core.class.TypeCollaborativeDoc
          ? await loadMarkup(value)
          : undefined
    if (markup === undefined || markup === '') continue
    const nodes: unknown[] = [JSON.parse(markup)]
    while (nodes.length > 0) {
      const node = nodes.pop()
      if (node === null || typeof node !== 'object') continue
      const { type, attrs, content } = node as { type?: string, attrs?: Record<string, unknown>, content?: unknown[] }
      if (type === 'image') add(attrs?.['file-id'])
      if (type === 'emoji' && attrs?.kind === 'image') add(attrs.image)
      if (Array.isArray(content)) nodes.push(...content)
    }
  }

  // Same person scope as SpaceSecurityMiddleware.getGuestScope: typed Person references
  // plus people owning the author's/editor's social identities, not all workspace contacts.
  if (h.hasClass(personClass)) {
    const people = new Set<Ref<Person>>()
    for (const [name, attr] of h.getAllAttributes(doc._class)) {
      const type = attr.type._class === core.class.ArrOf ? (attr.type as ArrOf<Doc>).of : attr.type
      if (type._class !== core.class.RefTo || !h.isDerived((type as RefTo<Doc>).to, personClass)) continue
      const value = valueOf(doc, name)
      for (const ref of Array.isArray(value) ? value : [value]) {
        if (typeof ref === 'string') people.add(ref as Ref<Person>)
      }
    }
    const authors = [doc.createdBy, doc.modifiedBy].filter((it) => it != null)
    if (authors.length > 0 && h.hasClass(identityClass)) {
      const identities = await client.findAll(identityClass, { _id: { $in: authors as unknown as Ref<Identity>[] } })
      for (const identity of identities) people.add(identity.attachedTo)
    }
    if (people.size > 0) {
      const persons = await client.findAll(personClass, { _id: { $in: [...people] } })
      for (const person of persons) add(person.avatar)
    }
  }
  return [...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
