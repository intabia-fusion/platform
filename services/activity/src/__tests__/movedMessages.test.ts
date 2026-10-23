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
import { TxFactory, toFindResult, type Class, type Doc, type Ref, type TxCUD, type TxUpdateDoc } from '@hcengineering/core'

import { getMovedMessagesTxes } from '../activity'
import { type Client } from '../types'

jest.mock('../config', () => ({ __esModule: true, default: { ServiceId: 'activity', BrandingPath: '' } }))

const objectClass = 'class:Document' as Ref<Class<Doc>>
const objectId = 'doc-1' as Ref<Doc>
const txFactory = new TxFactory('test-account' as any)

function makeClient (isActivityDoc = true): Client {
  const message = { _id: 'msg-1', _class: activity.class.DocUpdateMessage, space: 'space-1' }
  return {
    txFactory,
    hierarchy: { classHierarchyMixin: () => (isActivityDoc ? {} : undefined) },
    findAll: jest.fn().mockResolvedValue(toFindResult([message as any]))
  } as any as Client
}

function moveTx (space: string): TxCUD<Doc> {
  return txFactory.createTxUpdateDoc(objectClass, 'space-1' as any, objectId, { space } as any) as TxCUD<Doc>
}

describe('getMovedMessagesTxes', () => {
  it('moves the activity messages of an object to its new space', async () => {
    const client = makeClient()

    const result = (await getMovedMessagesTxes(moveTx('space-2'), client)) as TxUpdateDoc<Doc>[]

    expect(result).toHaveLength(1)
    expect(result[0].objectId).toBe('msg-1')
    expect(result[0].operations.space).toBe('space-2')
    expect(client.findAll).toHaveBeenCalledWith(
      activity.class.ActivityMessage,
      { attachedTo: objectId, space: 'space-1' },
      expect.anything()
    )
  })

  it('ignores updates that keep the space', async () => {
    expect(await getMovedMessagesTxes(moveTx('space-1'), makeClient())).toEqual([])
  })

  it('ignores updates that do not carry a space', async () => {
    const tx = txFactory.createTxUpdateDoc(objectClass, 'space-1' as any, objectId, { title: 'x' } as any)

    expect(await getMovedMessagesTxes(tx as TxCUD<Doc>, makeClient())).toEqual([])
  })

  it('ignores classes without activity', async () => {
    expect(await getMovedMessagesTxes(moveTx('space-2'), makeClient(false))).toEqual([])
  })
})
