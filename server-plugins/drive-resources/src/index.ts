//
// Copyright © 2024 Hardcore Engineering Inc.
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
  type Hierarchy,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  type TxRemoveDoc,
  type TxUpdateDoc,
  DocumentQuery,
  FindOptions,
  FindResult
} from '@hcengineering/core'
import drive, { type FileVersion, type Folder, type Resource } from '@hcengineering/drive'
import type { TriggerControl } from '@hcengineering/server-core'

/** @public */
export async function OnFileVersionDelete (
  txes: Tx[],
  { removedMap, ctx, storageAdapter, workspace }: TriggerControl
): Promise<Tx[]> {
  const result: Tx[] = []
  const toDelete: string[] = []
  for (const tx of txes) {
    const rmTx = tx as TxRemoveDoc<FileVersion>

    // Obtain document being deleted.
    const version = removedMap.get(rmTx.objectId) as FileVersion
    if (version !== undefined) {
      toDelete.push(version.file)
    }
  }
  if (toDelete.length > 0) {
    await storageAdapter.remove(ctx, workspace, toDelete)
  }

  return result
}

type Counts = Record<'folders' | 'files', number>

/**
 * @public
 */
export async function OnResourceChange (txes: TxCUD<Resource>[], control: TriggerControl): Promise<Tx[]> {
  const deltas = new Map<Ref<Folder>, Counts>()
  const add = (parent: Ref<Resource> | undefined, _class: Ref<Class<Doc>>, delta: number): void => {
    if (parent == null || parent === drive.ids.Root) return
    const key = control.hierarchy.isDerived(_class, drive.class.Folder) ? 'folders' : 'files'
    const counts = deltas.get(parent as Ref<Folder>) ?? { folders: 0, files: 0 }
    counts[key] += delta
    deltas.set(parent as Ref<Folder>, counts)
  }

  for (const tx of txes) {
    if (tx._class === core.class.TxCreateDoc) {
      add((tx as TxCreateDoc<Resource>).attributes.parent, tx.objectClass, 1)
    } else if (tx._class === core.class.TxRemoveDoc) {
      const removed = control.removedMap.get(tx.objectId) as Resource | undefined
      add(removed?.parent, tx.objectClass, -1)
    } else if (tx._class === core.class.TxUpdateDoc) {
      const parent = (tx as TxUpdateDoc<Resource>).operations.parent
      if (parent === undefined) continue
      // The update is stored by now: the parent it left is put on it by DriveMiddleware.
      const before = tx.meta?.fromParent as Ref<Resource> | undefined
      if (before === parent) continue
      add(before, tx.objectClass, -1)
      add(parent, tx.objectClass, 1)
    }
  }
  if (deltas.size === 0) return []

  // A folder removed together with its content is not counted down.
  const folders = await control.findAll(
    control.ctx,
    drive.class.Folder,
    { _id: { $in: Array.from(deltas.keys()) } },
    { projection: { _id: 1, space: 1 } }
  )
  const result: Tx[] = []
  for (const folder of folders) {
    const counts = deltas.get(folder._id)
    if (counts == null) continue
    const inc: Partial<Counts> = {}
    if (counts.folders !== 0) inc.folders = counts.folders
    if (counts.files !== 0) inc.files = counts.files
    if (Object.keys(inc).length === 0) continue
    result.push(control.txFactory.createTxUpdateDoc(drive.class.Folder, folder.space, folder._id, { $inc: inc }))
  }
  return result
}

/** @public */
export async function FindFolderResources (
  doc: Doc,
  hiearachy: Hierarchy,
  findAll: <T extends Doc>(
    clazz: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<FindResult<T>>
): Promise<Doc[]> {
  const folder = doc as Folder

  const files = await findAll(drive.class.File, { parent: folder._id })
  const folders = await findAll(drive.class.Folder, { parent: folder._id })
  return [...files, ...folders]
}

export { DriveMiddleware } from './middleware'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    OnFileVersionDelete,
    OnResourceChange
  },
  function: {
    FindFolderResources
  }
})
