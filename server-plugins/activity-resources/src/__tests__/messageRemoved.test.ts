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

import activity, { type SavedMessage } from '@hcengineering/activity'
import core, { TxFactory, toFindResult, type Doc, type Ref, type TxCUD, type TxRemoveDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'

import { OnActivityMessageRemoved } from '../index'

const txFactory = new TxFactory('author' as any)

function saved (_id: string, attachedTo: string, createdBy: string): SavedMessage {
  return {
    _id,
    _class: activity.class.SavedMessage,
    space: core.space.Workspace,
    attachedTo,
    createdBy,
    modifiedBy: createdBy,
    modifiedOn: 0
  } as any as SavedMessage
}

const bookmarks = [saved('s1', 'msg-1', 'user-a'), saved('s2', 'msg-1', 'user-b'), saved('s3', 'msg-2', 'user-a')]

function makeControl (): TriggerControl {
  return {
    ctx: {},
    txFactory,
    findAll: jest.fn().mockImplementation(async (_ctx, _class, query: { attachedTo: { $in: string[] } }) => {
      if (_class !== activity.class.SavedMessage) return toFindResult([])
      return toFindResult(bookmarks.filter((it) => query.attachedTo.$in.includes(it.attachedTo)))
    })
  } as any as TriggerControl
}

function removeTx (objectId: string): TxCUD<Doc> {
  return txFactory.createTxRemoveDoc(activity.class.ActivityMessage, 'space-1' as any, objectId as Ref<Doc>)
}

describe('OnActivityMessageRemoved', () => {
  it('removes the saved bookmarks of every user for a removed message', async () => {
    const result = (await OnActivityMessageRemoved([removeTx('msg-1')], makeControl())) as TxRemoveDoc<Doc>[]

    expect(result.map((it) => it._class)).toEqual([core.class.TxRemoveDoc, core.class.TxRemoveDoc])
    expect(result.map((it) => it.objectId).sort()).toEqual(['s1', 's2'])
    expect(result.every((it) => it.objectClass === activity.class.SavedMessage)).toBe(true)
  })

  it('leaves bookmarks of other messages alone', async () => {
    const result = (await OnActivityMessageRemoved([removeTx('msg-3')], makeControl())) as TxRemoveDoc<Doc>[]

    expect(result).toEqual([])
  })

  it('ignores transactions that are not removals', async () => {
    const control = makeControl()
    const tx = txFactory.createTxUpdateDoc(activity.class.ActivityMessage, 'space-1' as any, 'msg-1' as Ref<Doc>, {})

    expect(await OnActivityMessageRemoved([tx as TxCUD<Doc>], control)).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })
})
