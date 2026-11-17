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
  readOnlyGuestAccountUuid,
  TxFactory,
  toFindResult,
  type Doc,
  type Space,
  type TxUpdateDoc
} from '@hcengineering/core'
import notification from '@hcengineering/notification'
import { type TriggerControl } from '@hcengineering/server-core'

import plugin from '../index'
import { OnSpaceAccessChanged } from '../snapshot'

jest.mock('@hcengineering/server-activity', () => ({
  ...jest.requireActual('@hcengineering/server-activity'),
  hasPreview: () => true
}))

const txFactory = new TxFactory('test-account' as any)

const preview = {
  _id: 'preview-1',
  _class: core.class.DocPreview,
  space: 'space-1',
  objectId: 'doc-1',
  objectClass: 'class:Issue',
  objectDomain: 'task',
  title: 'Secret plan',
  identifier: 'TSK-1',
  modifiedOn: 1
}

function space (_id: string, members: string[], isPrivate = true): Doc {
  return { _id, _class: core.class.Space, space: core.space.Space, private: isPrivate, members } as any
}

function context (_id: string, user: string, data: Record<string, unknown> = {}): Doc {
  return {
    _id,
    _class: notification.class.DocNotifyContext,
    space: `person-${user}`,
    user,
    objectId: 'doc-1',
    objectSpace: 'space-1',
    preview: 'preview-1',
    ...data
  } as any
}

function matches (doc: any, query: Record<string, any>): boolean {
  return Object.entries(query).every(([key, value]) =>
    value?.$in != null ? value.$in.includes(doc[key]) === true : doc[key] === value
  )
}

function makeControl (docs: Record<string, Doc[]>): TriggerControl {
  return {
    ctx: {},
    txFactory,
    hierarchy: {
      isDerived: (a: any, b: any) => a === b,
      classHierarchyMixin: () => undefined,
      findDomain: () => 'task'
    },
    findAll: jest.fn(async (_ctx, _class, query) =>
      toFindResult((docs[_class as string] ?? []).filter((it) => matches(it, query)))
    )
  } as any as TriggerControl
}

function membersTx (ops: Record<string, any>): TxUpdateDoc<Space> {
  return txFactory.createTxUpdateDoc(core.class.Space, core.space.Space, 'space-1' as any, ops)
}

function updates (res: any[]): Array<[string, any]> {
  return res.map((tx) => [tx.objectId, tx.operations])
}

describe('OnSpaceAccessChanged', () => {
  it('gives the removed member a snapshot of the preview, the others nothing', async () => {
    const control = makeControl({
      [core.class.Space]: [space('space-1', ['user-1'])],
      [notification.class.DocNotifyContext]: [context('ctx-1', 'user-1'), context('ctx-2', 'user-2')],
      [core.class.DocPreview]: [preview as any]
    })
    const res = await OnSpaceAccessChanged([membersTx({ $pull: { members: 'user-2' } })], control)
    expect(updates(res)).toEqual([
      [
        'ctx-2',
        {
          previewSnapshot: {
            objectId: 'doc-1',
            objectClass: 'class:Issue',
            title: 'Secret plan',
            identifier: 'TSK-1',
            label: undefined,
            icon: undefined,
            props: undefined,
            modifiedOn: 1
          }
        }
      ]
    ])
  })

  it('covers the chat of the space itself and a whole members list', async () => {
    const control = makeControl({
      [core.class.Space]: [space('space-1', ['user-1'])],
      [notification.class.DocNotifyContext]: [
        context('ctx-chat', 'user-2', { objectId: 'space-1', objectSpace: core.space.Space })
      ],
      [core.class.DocPreview]: [preview as any]
    })
    const res = await OnSpaceAccessChanged([membersTx({ members: ['user-1'] })], control)
    expect(res.map((it: any) => it.objectId)).toEqual(['ctx-chat'])
  })

  it('asks only for the contexts of the users a tx adds or removes', async () => {
    const control = makeControl({
      [core.class.Space]: [space('space-1', ['user-1'])],
      [notification.class.DocNotifyContext]: [context('ctx-2', 'user-2'), context('ctx-3', 'user-3')],
      [core.class.DocPreview]: [preview as any]
    })
    const res = await OnSpaceAccessChanged([membersTx({ $pull: { members: { $in: ['user-2'] } } })], control)
    expect(res.map((it: any) => it.objectId)).toEqual(['ctx-2'])
    const contextQueries = (control.findAll as jest.Mock).mock.calls.filter(
      ([, _class]) => _class === notification.class.DocNotifyContext
    )
    expect(contextQueries.map(([, , query]) => query.user)).toEqual([{ $in: ['user-2'] }, { $in: ['user-2'] }])
  })

  it('snapshots a public space for the shared read-only guest, who reads only the spaces it is in', async () => {
    const control = makeControl({
      [core.class.Space]: [space('space-1', ['user-1'], false)],
      [notification.class.DocNotifyContext]: [
        context('ctx-guest', readOnlyGuestAccountUuid),
        context('ctx-2', 'user-2')
      ],
      [core.class.DocPreview]: [preview as any]
    })
    const res = await OnSpaceAccessChanged([membersTx({ members: ['user-1'] })], control)
    expect(res.map((it: any) => it.objectId)).toEqual(['ctx-guest'])
  })

  it('drops the snapshot of a member who can read the space again', async () => {
    const control = makeControl({
      [core.class.Space]: [space('space-1', ['user-1', 'user-2'])],
      [notification.class.DocNotifyContext]: [context('ctx-2', 'user-2', { previewSnapshot: { title: 'Old' } })]
    })
    const res = await OnSpaceAccessChanged([membersTx({ $push: { members: 'user-2' } })], control)
    expect(updates(res)).toEqual([['ctx-2', { $unset: { previewSnapshot: true } }]])
  })

  it('takes no snapshot in a public space and ignores other updates', async () => {
    const control = makeControl({
      [core.class.Space]: [space('space-1', ['user-1'], false)],
      [notification.class.DocNotifyContext]: [context('ctx-2', 'user-2')]
    })
    expect(await OnSpaceAccessChanged([membersTx({ private: false })], control)).toEqual([])
    expect(await OnSpaceAccessChanged([membersTx({ name: 'Renamed' })], control)).toEqual([])
    expect(control.findAll).toHaveBeenCalledTimes(3)
  })
})

describe('OnDocSpaceChanged (contexts)', () => {
  it('moves the contexts of the document and its threads, and snapshots the preview for the outsiders', async () => {
    const control = makeControl({
      [core.class.Space]: [space('space-2', ['user-1'])],
      'class:Issue': [{ _id: 'doc-1', _class: 'class:Issue', space: 'space-2' } as any],
      [notification.class.DocNotifyContext]: [
        context('ctx-1', 'user-1'),
        context('ctx-thread', 'user-2', { objectId: 'message-1' })
      ],
      [core.class.DocPreview]: [preview as any]
    })
    // The tx names an older move: the space comes from the document
    const tx = txFactory.createTxUpdateDoc(
      'class:Issue' as any,
      'space-1' as any,
      'doc-1' as any,
      {
        space: 'space-old'
      } as any
    )
    const res = await (await plugin()).trigger.OnDocSpaceChanged([tx], control)
    expect(updates(res).map(([id, ops]) => [id, Object.keys(ops)])).toEqual([
      ['ctx-1', ['objectSpace']],
      ['ctx-thread', ['objectSpace']],
      ['ctx-thread', ['previewSnapshot']]
    ])
  })
})
