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
  type AccountUuid,
  type Class,
  type Doc,
  type DocPreview,
  readOnlyGuestAccountUuid,
  type Ref,
  type Space,
  toPreviewSnapshot,
  type Tx,
  type TxUpdateDoc
} from '@hcengineering/core'
import notification, { type DocNotifyContext } from '@hcengineering/notification'
import { findPreviewsByDoc, hasPreview } from '@hcengineering/server-activity'
import { type TriggerControl } from '@hcengineering/server-core'

type SnapshotContext = Pick<
  DocNotifyContext,
  '_id' | '_class' | 'space' | 'user' | 'objectSpace' | 'preview' | 'previewSnapshot'
>

const contextProjection = {
  _id: 1,
  _class: 1,
  space: 1,
  user: 1,
  objectSpace: 1,
  preview: 1,
  previewSnapshot: 1
} as const

// As SpaceSecurity reads it: the shared read-only guest sees only the spaces it is in; an unknown space takes no snapshot
function canRead (space: Space | undefined, user: AccountUuid): boolean {
  if (space == null || space.members.includes(user)) return true
  return !space.private && user !== readOnlyGuestAccountUuid
}

async function findSpace (control: TriggerControl, _id: Ref<Space>): Promise<Space | undefined> {
  return (await control.findAll(control.ctx, core.class.Space, { _id }, { limit: 1 }))[0]
}

// A user who can no longer read the space keeps a snapshot of the preview; one who can again drops it
async function syncSnapshots (
  control: TriggerControl,
  contexts: SnapshotContext[],
  space: Space | undefined
): Promise<Tx[]> {
  const result: Tx[] = contexts
    .filter((it) => it.previewSnapshot != null && canRead(space, it.user))
    .map((it) =>
      control.txFactory.createTxUpdateDoc(it._class, it.space, it._id, { $unset: { previewSnapshot: true } })
    )

  const lost = contexts.filter((it) => it.preview != null && it.previewSnapshot == null && !canRead(space, it.user))
  if (lost.length === 0) return result
  const ids = [...new Set(lost.map((it) => it.preview as Ref<DocPreview>))]
  const previews = await control.findAll(control.ctx, core.class.DocPreview, { _id: { $in: ids } })
  const byId = new Map(previews.map((it) => [it._id, it]))
  for (const context of lost) {
    const preview = byId.get(context.preview as Ref<DocPreview>)
    if (preview == null) continue
    result.push(
      control.txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
        previewSnapshot: toPreviewSnapshot(preview)
      })
    )
  }
  return result
}

// The users whose access a tx may change: everyone for a new list or privacy, else the ones added or removed
function affectedUsers (tx: TxUpdateDoc<Space>): AccountUuid[] | 'all' | undefined {
  const ops = tx.operations
  if (ops.members != null || ops.private != null || ops.$unset?.private != null) return 'all'
  const changes: any[] = [ops.$push?.members, ops.$pull?.members].filter((it) => it != null)
  if (changes.length === 0) return undefined
  const users: AccountUuid[] = []
  for (const it of changes) {
    if (typeof it === 'string') users.push(it as AccountUuid)
    else if (Array.isArray(it.$each)) users.push(...it.$each)
    else if (Array.isArray(it.$in)) users.push(...it.$in)
    else return 'all'
  }
  return users
}

export async function OnSpaceAccessChanged (txes: TxUpdateDoc<Space>[], control: TriggerControl): Promise<Tx[]> {
  const affected = new Map<Ref<Space>, AccountUuid[] | 'all'>()
  for (const tx of txes) {
    if (!control.hierarchy.isDerived(tx.objectClass, core.class.Space)) continue
    const users = affectedUsers(tx)
    if (users == null) continue
    const prev = affected.get(tx.objectId)
    affected.set(tx.objectId, users === 'all' || prev === 'all' ? 'all' : [...(prev ?? []), ...users])
  }

  const result: Tx[] = []
  for (const [_id, users] of affected) {
    const space = await findSpace(control, _id)
    if (space == null) continue
    const byUser = users === 'all' ? {} : { user: { $in: users } }
    // The documents' contexts carry the space; the space's own one is of its chat
    const inSpace = await control.findAll(
      control.ctx,
      notification.class.DocNotifyContext,
      { objectSpace: _id, ...byUser },
      { projection: contextProjection }
    )
    const ofSpace = await control.findAll(
      control.ctx,
      notification.class.DocNotifyContext,
      { objectId: _id, ...byUser },
      { projection: contextProjection }
    )
    result.push(...(await syncSnapshots(control, [...inSpace, ...ofSpace], space)))
  }
  return result
}

// The contexts of a document and of the threads in it follow it to the space it is in now
export async function moveContexts (
  control: TriggerControl,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>
): Promise<Tx[]> {
  if (!hasPreview(control, objectClass)) return []
  // From the document: requests run in parallel, an older move may come last
  const doc = (await control.findAll(control.ctx, objectClass, { _id: objectId }, { limit: 1 }))[0]
  if (doc == null) return []

  const contexts = new Map<Ref<DocNotifyContext>, SnapshotContext>()
  const own = await control.findAll(
    control.ctx,
    notification.class.DocNotifyContext,
    { objectId },
    { projection: contextProjection }
  )
  for (const it of own) contexts.set(it._id, it)

  const previews = await findPreviewsByDoc(control, [{ objectClass, objectId }], {
    projection: { _id: 1, objectId: 1 }
  })
  for (const preview of previews.values()) {
    const showing = await control.findAll(
      control.ctx,
      notification.class.DocNotifyContext,
      { preview: preview._id },
      { projection: contextProjection }
    )
    for (const it of showing) contexts.set(it._id, it)
  }
  if (contexts.size === 0) return []

  const result: Tx[] = [...contexts.values()]
    .filter((it) => it.objectSpace !== doc.space)
    .map((it) => control.txFactory.createTxUpdateDoc(it._class, it.space, it._id, { objectSpace: doc.space }))
  result.push(...(await syncSnapshots(control, [...contexts.values()], await findSpace(control, doc.space))))
  return result
}
