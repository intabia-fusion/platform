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

import activity, { type ActivityMessage, type AppletInstance, type DocUpdateMessage } from '@hcengineering/activity'
import core, {
  type Class,
  type Doc,
  type DocumentUpdate,
  type Ref,
  type Tx,
  type TxCUD,
  TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import { findPreviewsByDoc, hasPreview } from '@hcengineering/server-activity'

import { ReferenceTrigger } from './references'
import { FieldsIconPresenter, OnDocCreated, OnDocPreviewMoved, OnDocUpdated } from './preview'

async function OnDocRemoved (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const removed = txes.filter((tx) => tx._class === core.class.TxRemoveDoc)
  const result: Tx[] = []
  for (const tx of removed) {
    const activityDocMixin = control.hierarchy.classHierarchyMixin(tx.objectClass, activity.mixin.ActivityDoc)
    if (activityDocMixin === undefined) continue

    const messages = await control.findAll(
      control.ctx,
      activity.class.ActivityMessage,
      { attachedTo: tx.objectId },
      { projection: { _id: 1, _class: 1, space: 1 } }
    )

    result.push(
      ...messages.map((message) => control.txFactory.createTxRemoveDoc(message._class, message.space, message._id))
    )
  }
  return result
}

// A bulk removal (a calendar disconnect) brings many documents at once
async function OnDocPreviewRemoved (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const docs = txes.filter((tx) => hasPreview(control, tx.objectClass))
  if (docs.length === 0) return []
  const previews = await findPreviewsByDoc(control, docs, { projection: { _id: 1, _class: 1, space: 1, objectId: 1 } })
  return Array.from(previews.values(), (it) => control.txFactory.createTxRemoveDoc(it._class, it.space, it._id))
}

// Bookmarks belong to every user who saved the message, not only to the one removing it.
export async function OnActivityMessageRemoved (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const removed = txes.filter((tx) => tx._class === core.class.TxRemoveDoc).map((tx) => tx.objectId)
  if (removed.length === 0) return []

  const saved = await control.findAll(
    control.ctx,
    activity.class.SavedMessage,
    { attachedTo: { $in: removed as Ref<ActivityMessage>[] } },
    { projection: { _id: 1, _class: 1, space: 1 } }
  )
  return saved.map((it) => control.txFactory.createTxRemoveDoc(it._class, it.space, it._id))
}

// The removed instance is gone and a tx may name the base class: dependents of every kind are looked up.
export async function OnAppletRemoved (txes: TxRemoveDoc<AppletInstance>[], control: TriggerControl): Promise<Tx[]> {
  const removed = txes.map((tx) => tx.objectId)
  if (removed.length === 0) return []

  const applets = control.modelDb.findAllSync(activity.class.Applet, {})
  const dependents = new Set(applets.flatMap((it) => it.dependents ?? []))
  const result: Tx[] = []
  for (const _class of dependents) {
    const docs = await control.findAll(
      control.ctx,
      _class,
      { attachedTo: { $in: removed } },
      { projection: { _id: 1, _class: 1, space: 1 } }
    )
    result.push(...docs.map((it) => control.txFactory.createTxRemoveDoc(it._class, it.space, it._id)))
  }
  return result
}

export async function OnDocClassChanged (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []

  for (const tx of txes) {
    if (tx._class !== core.class.TxUpdateDoc) continue

    const objectClass = ((tx as TxUpdateDoc<Doc>).operations as any)._class as Ref<Class<Doc>> | undefined
    if (objectClass == null || objectClass === tx.objectClass) continue

    const messages = await control.findAll(control.ctx, activity.class.ActivityMessage, {
      attachedTo: tx.objectId
    })
    for (const message of messages) {
      const ops: DocumentUpdate<ActivityMessage> = {}
      if (message.attachedToClass !== objectClass) {
        ops.attachedToClass = objectClass
      }
      // DocUpdateMessage keeps its own copy of the class it describes.
      const own = (message as DocUpdateMessage).objectClass
      if (own != null && own !== objectClass) {
        ;(ops as DocumentUpdate<DocUpdateMessage>).objectClass = objectClass
      }
      if (Object.keys(ops).length === 0) continue
      result.push(control.txFactory.createTxUpdateDoc(message._class, message.space, message._id, ops))
    }
  }

  return result
}

export * from './references'
export * from './preview'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    ReferenceTrigger,
    OnDocCreated,
    OnDocUpdated,
    OnDocPreviewMoved,
    OnDocRemoved,
    OnDocPreviewRemoved,
    OnDocClassChanged,
    OnActivityMessageRemoved,
    OnAppletRemoved
  },
  function: {
    FieldsIconPresenter
  }
})
