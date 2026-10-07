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

import attachment, { type Attachment, type SavedAttachments } from '@hcengineering/attachment'
import core, { TxFactory, toFindResult, type Doc, type Ref, type TxRemoveDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'

import { OnAttachmentDelete } from '../index'

const txFactory = new TxFactory('author' as any)

function saved (_id: string, attachedTo: string, createdBy: string): SavedAttachments {
  return {
    _id,
    _class: attachment.class.SavedAttachments,
    space: core.space.Workspace,
    attachedTo,
    createdBy,
    modifiedBy: createdBy,
    modifiedOn: 0
  } as any as SavedAttachments
}

const bookmarks = [saved('s1', 'att-1', 'user-a'), saved('s2', 'att-1', 'user-b'), saved('s3', 'att-2', 'user-a')]

function makeControl (removed: Attachment[]): TriggerControl {
  return {
    ctx: {},
    txFactory,
    workspace: {},
    removedMap: new Map(removed.map((it) => [it._id, it])),
    storageAdapter: { remove: jest.fn() },
    findAll: jest.fn().mockImplementation(async (_ctx, _class, query: { attachedTo: { $in: string[] } }) => {
      if (_class !== attachment.class.SavedAttachments) return toFindResult([])
      return toFindResult(bookmarks.filter((it) => query.attachedTo.$in.includes(it.attachedTo)))
    })
  } as any as TriggerControl
}

function removeTx (objectId: string): TxRemoveDoc<Doc> {
  return txFactory.createTxRemoveDoc(attachment.class.Attachment, 'space-1' as any, objectId as Ref<Doc>)
}

const att1 = { _id: 'att-1', _class: attachment.class.Attachment, file: 'blob-1' } as any as Attachment

describe('OnAttachmentDelete', () => {
  it('removes the saved bookmarks of every user for a removed attachment', async () => {
    const control = makeControl([att1])
    const result = (await OnAttachmentDelete([removeTx('att-1')], control)) as TxRemoveDoc<Doc>[]

    const removedSaved = result.filter((it) => it.objectClass === attachment.class.SavedAttachments)
    expect(removedSaved.map((it) => it.objectId).sort()).toEqual(['s1', 's2'])
    expect(control.storageAdapter.remove).toHaveBeenCalledWith(control.ctx, control.workspace, ['blob-1'])
  })

  it('leaves bookmarks of other attachments alone', async () => {
    const result = await OnAttachmentDelete([removeTx('att-3')], makeControl([]))

    expect(result).toEqual([])
  })
})
