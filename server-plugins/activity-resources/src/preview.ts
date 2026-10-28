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
  type Class,
  type Doc,
  type DocPreview,
  type DocumentUpdate,
  groupByArray,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxUpdateDoc,
  TxProcessor
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import {
  findPreviewsByDoc,
  getIconPresenter,
  getIdentifierPresenter,
  getLabelPresenter,
  getPreviewData,
  getPropsPresenter,
  getTitleKey,
  getTitlePresenter,
  hasPreview,
  type Icon,
  type IconPresenterFn,
  previewKey,
  previewSpace,
  previewUpdate
} from '@hcengineering/server-activity'

// In the creating transaction: the chat of a collaborator and the notify contexts point at it right after.
export async function OnDocCreated (txes: TxCreateDoc<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  for (const tx of txes) {
    if (!hasPreview(control, tx.objectClass)) continue
    const doc = TxProcessor.createDoc2Doc(tx)
    res.push(
      control.txFactory.createTxCreateDoc(
        core.class.DocPreview,
        previewSpace(control, doc),
        await getPreviewData(control, doc)
      )
    )
  }
  return res
}

// The attributes a tx touches, with the head of every dotted path, as the presenters read them.
function touchedKeys (tx: TxUpdateDoc<Doc>): Set<string> {
  const keys = new Set<string>()
  const add = (key: string): void => {
    keys.add(key)
    keys.add(key.split('.')[0])
  }
  for (const [key, value] of Object.entries(tx.operations)) {
    if (key.startsWith('$')) {
      if (value != null && typeof value === 'object') Object.keys(value).forEach(add)
    } else {
      add(key)
    }
  }
  return keys
}

// Whether a tx changes what the preview shows.
function showsChange (tx: TxUpdateDoc<Doc>, control: TriggerControl): boolean {
  const { hierarchy } = control
  const keys = touchedKeys(tx)
  const presenters = [
    getTitlePresenter(tx.objectClass, hierarchy),
    getIdentifierPresenter(tx.objectClass, hierarchy),
    getIconPresenter(tx.objectClass, hierarchy),
    getLabelPresenter(tx.objectClass, hierarchy),
    getPropsPresenter(tx.objectClass, hierarchy)
  ]
  const titleKey = getTitleKey(hierarchy, tx.objectClass)
  return (
    presenters.some((it) => it?.triggerFields.some((key) => keys.has(key)) === true) ||
    (titleKey != null && keys.has(titleKey)) ||
    (hierarchy.isDerived(tx.objectClass, core.class.Space) && keys.has('archived'))
  )
}

interface Ask {
  objectId: Ref<Doc>
  objectClass: Ref<Class<Doc>>
}

async function findDocs (control: TriggerControl, asks: Ask[]): Promise<Map<Ref<Doc>, Doc>> {
  const docById = new Map<Ref<Doc>, Doc>()
  for (const [_class, group] of groupByArray(asks, (it) => it.objectClass)) {
    const ids = group.map((it) => it.objectId)
    for (const doc of await control.findAll(control.ctx, _class, { _id: { $in: ids } })) docById.set(doc._id, doc)
  }
  return docById
}

// Creates nothing: concurrent requests would insert the same preview twice; the backfill covers old documents.
export async function OnDocUpdated (txes: TxUpdateDoc<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const { hierarchy } = control
  // Several txes of a batch on one document merge
  const asks = new Map<string, Ask>()
  for (const tx of txes) {
    if (!hasPreview(control, tx.objectClass) || !showsChange(tx, control)) continue
    asks.set(previewKey(hierarchy.getDomain(tx.objectClass), tx.objectId), {
      objectId: tx.objectId,
      objectClass: tx.objectClass
    })
  }
  if (asks.size === 0) return []

  const previewByDoc = await findPreviewsByDoc(control, Array.from(asks.values()))
  const docById = await findDocs(
    control,
    Array.from(asks.entries())
      .filter(([key]) => previewByDoc.has(key))
      .map(([, it]) => it)
  )

  const res: Tx[] = []
  for (const [key, { objectId }] of asks) {
    const preview = previewByDoc.get(key)
    const doc = docById.get(objectId)
    if (preview == null || doc == null) continue
    const ops = previewUpdate(preview, await getPreviewData(control, doc))
    if (Object.keys(ops).length === 0) continue
    res.push(control.txFactory.createTxUpdateDoc(preview._class, preview.space, preview._id, ops))
  }
  return res
}

// In the request of the change: an asynchronous trigger of an older move could come last and leave the preview in a space its document has left
export async function OnDocPreviewMoved (txes: TxUpdateDoc<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const { hierarchy } = control
  const asks = new Map<string, Ask & { retyped: boolean }>()
  for (const tx of txes) {
    const objectClass: Ref<Class<Doc>> = (tx.operations as any)._class ?? tx.objectClass
    const retyped = objectClass !== tx.objectClass
    if (!retyped && tx.operations.space == null) continue
    if (!hasPreview(control, tx.objectClass) && !hasPreview(control, objectClass)) continue
    const key = previewKey(hierarchy.getDomain(tx.objectClass), tx.objectId)
    asks.set(key, { objectId: tx.objectId, objectClass, retyped: retyped || asks.get(key)?.retyped === true })
  }
  if (asks.size === 0) return []

  const previewByDoc = await findPreviewsByDoc(control, Array.from(asks.values()))
  const docById = await findDocs(
    control,
    Array.from(asks.entries())
      .filter(([key, it]) => previewByDoc.has(key) || it.retyped)
      .map(([, it]) => it)
  )

  const res: Tx[] = []
  for (const [key, { objectId, objectClass, retyped }] of asks) {
    const preview = previewByDoc.get(key)
    const doc = docById.get(objectId)
    if (doc == null) continue
    if (preview == null) {
      // A class that gains a preview makes it
      if (retyped && hasPreview(control, objectClass)) {
        const data = await getPreviewData(control, doc)
        res.push(control.txFactory.createTxCreateDoc(core.class.DocPreview, previewSpace(control, doc), data))
      }
      continue
    }
    const ops: DocumentUpdate<DocPreview> = retyped ? previewUpdate(preview, await getPreviewData(control, doc)) : {}
    // From the document: a parallel request may have moved it again
    const space = previewSpace(control, doc)
    if (space !== preview.space) ops.space = space
    if (Object.keys(ops).length === 0) continue
    // A tx goes to the readers of its space: a moved preview reaches the new space's members
    res.push(control.txFactory.createTxUpdateDoc(preview._class, space, preview._id, ops))
  }
  return res
}

// The icon component reads `value`: the document cut to the fields the presenter watches.
export const FieldsIconPresenter: IconPresenterFn = async (doc, control): Promise<Icon> => {
  const value: Record<string, any> = { _id: doc._id, _class: doc._class }
  for (const field of getIconPresenter(doc._class, control.hierarchy)?.triggerFields ?? []) {
    value[field] = (doc as any)[field]
  }
  return { props: { value } }
}
