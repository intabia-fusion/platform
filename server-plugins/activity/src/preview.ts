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

import activity from '@hcengineering/activity'
import core, {
  type Class,
  type Data,
  type Doc,
  type DocPreview,
  type DocumentUpdate,
  type Domain,
  type FindOptions,
  getClassCollaborators,
  type Ref,
  type Space
} from '@hcengineering/core'

import { serverActivityPlugin as serverActivity } from './plugin'
import type { PresenterControl } from './types'
import { getDocIcon, getDocIdentifier, getDocLabel, getDocProps, getDocTitle, isActivityDoc } from './utils'

export function hasPreview (control: Pick<PresenterControl, 'hierarchy' | 'modelDb'>, _class: Ref<Class<Doc>>): boolean {
  const { hierarchy, modelDb } = control
  if (hierarchy.isMixin(_class) || hierarchy.isDerived(_class, activity.class.ActivityMessage)) return false
  if (isActivityDoc(_class, hierarchy)) return true
  return (
    getClassCollaborators(modelDb, hierarchy, _class) != null &&
    hierarchy.classHierarchyMixin(_class, serverActivity.mixin.NoPreview) == null
  )
}

// A failing presenter leaves its field empty: the preview must exist for the chats to point at.
export async function getPreviewData (control: PresenterControl, doc: Doc): Promise<Data<DocPreview>> {
  const isSpace = control.hierarchy.isDerived(doc._class, core.class.Space)
  const field = async <T>(name: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn()
    } catch (err: any) {
      control.ctx.error('preview field failed', { field: name, _id: doc._id, _class: doc._class, err })
    }
  }
  const [title, identifier, label, icon, props] = await Promise.all([
    field('title', () => getDocTitle(control, doc)),
    field('identifier', () => getDocIdentifier(control, doc)),
    field('label', () => getDocLabel(control, doc)),
    field('icon', () => getDocIcon(control, doc)),
    field('props', () => getDocProps(control, doc))
  ])
  return {
    objectId: doc._id,
    objectClass: doc._class,
    objectDomain: control.hierarchy.getDomain(doc._class),
    title: title ?? '',
    identifier,
    label,
    icon,
    archived: isSpace && (doc as Partial<Space>).archived === true,
    props
  }
}

// The domain is not here: with the id it is the key a preview is found by
const previewFields = ['objectClass', 'title', 'identifier', 'label', 'icon', 'archived', 'props'] as const

// `$unset` for a field that went away: an absent key would leave the old value.
export function previewUpdate (preview: DocPreview, data: Data<DocPreview>): DocumentUpdate<DocPreview> {
  const ops: DocumentUpdate<DocPreview> = {}
  for (const field of previewFields) {
    const next = data[field]
    if (sameValue(next, preview[field])) continue
    if (next == null) {
      ops.$unset = { ...ops.$unset, [field]: '' }
    } else {
      ;(ops as any)[field] = next
    }
  }
  return ops
}

// A stored object comes back with its keys in the database's order: compared regardless of it
function sameValue (a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return a == null && b == null
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = (it: object): string[] => Object.keys(it).filter((key) => (it as any)[key] !== undefined)
  const [ka, kb] = [keys(a), keys(b)]
  return ka.length === kb.length && ka.every((key) => sameValue((a as any)[key], (b as any)[key]))
}

export const previewKey = (objectDomain: Domain, objectId: Ref<Doc>): string => `${objectDomain}:${objectId}`

// One query per domain: the unique index leads with it, and a batch brings many documents at once
export async function findPreviewsByDoc (
  control: Pick<PresenterControl, 'hierarchy' | 'ctx' | 'findAll'>,
  docs: Array<{ objectClass: Ref<Class<Doc>>, objectId: Ref<Doc> }>,
  options?: FindOptions<DocPreview>
): Promise<Map<string, DocPreview>> {
  const idsByDomain = new Map<Domain, Set<Ref<Doc>>>()
  for (const { objectClass, objectId } of docs) {
    const domain = control.hierarchy.findDomain(objectClass)
    if (domain != null) idsByDomain.set(domain, (idsByDomain.get(domain) ?? new Set()).add(objectId))
  }
  const res = new Map<string, DocPreview>()
  for (const [objectDomain, ids] of idsByDomain) {
    const query = { objectDomain, objectId: { $in: Array.from(ids) } }
    for (const it of await control.findAll(control.ctx, core.class.DocPreview, query, options)) {
      res.set(previewKey(objectDomain, it.objectId), it)
    }
  }
  return res
}

// The space a preview lives in, for its readers: the document's, or a space its own.
export function previewSpace (control: Pick<PresenterControl, 'hierarchy'>, doc: Doc): Ref<Space> {
  return control.hierarchy.isDerived(doc._class, core.class.Space) ? (doc._id as Ref<Space>) : doc.space
}
