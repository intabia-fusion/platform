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
import chunter, { type Chat } from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Class,
  type Doc,
  type Ref,
  type Space,
  type TxCreateDoc,
  TxFactory,
  toFindResult
} from '@hcengineering/core'
import notification, { type ReadState } from '@hcengineering/notification'
import { type TriggerControl } from '@hcengineering/server-core'

import plugin from '..'

const CHANNEL = 'channel-1' as Ref<Doc>
const OLD_DOC = 'doc-old' as Ref<Doc>
const ALICE = 'acc-alice' as AccountUuid
const ALICE_SPACE = 'person-space-alice' as Ref<Space>

const txFactory = new TxFactory('test-account' as any)

// Both documents have a preview; only `channel-1` has a read state
const previews = [
  { _id: 'preview-1', objectId: CHANNEL, objectDomain: 'space' },
  { _id: 'preview-old', objectId: OLD_DOC, objectDomain: 'space' }
]

function makeControl (): TriggerControl {
  return {
    ctx: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), newChild: jest.fn().mockReturnThis() },
    txFactory,
    apply: jest.fn(async () => ({})),
    hierarchy: {
      classHierarchyMixin: (_class: Ref<Class<Doc>>, mixin: Ref<Doc>) =>
        mixin === activity.mixin.ActivityDoc && _class === chunter.class.Channel ? {} : undefined,
      findDomain: () => 'space',
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) =>
        base === core.class.Space && _class === chunter.class.Channel
    },
    queryFind: jest.fn(async (_ctx: unknown, _class: Ref<Class<Doc>>) =>
      toFindResult((_class === contact.class.PersonSpace ? [{ _id: ALICE_SPACE, account: ALICE }] : []) as any)
    ),
    findAll: jest.fn(async (_ctx: unknown, _class: Ref<Class<Doc>>) => {
      if (_class === core.class.DocPreview) return toFindResult(previews as any)
      if (_class === notification.class.ReadState) {
        return toFindResult([{ _id: 'state-1', attachedTo: CHANNEL, attachedToClass: chunter.class.Channel }] as any)
      }
      return toFindResult([])
    })
  } as any as TriggerControl
}

function collaboratorTx (attachedTo: Ref<Doc>): TxCreateDoc<Doc> {
  return txFactory.createTxCreateDoc(
    core.class.Collaborator,
    'space-1' as Ref<Space>,
    {
      attachedTo,
      attachedToClass: chunter.class.Channel,
      collection: 'collaborators',
      collaborator: ALICE
    } as any
  )
}

describe('OnCollaboratorAdded', () => {
  const trigger = async (control: TriggerControl, txes: TxCreateDoc<Doc>[]): Promise<any[]> =>
    await (await plugin()).trigger.OnCollaboratorAdded(txes as any, control)

  it('creates the chat with the preview and the read state of the document', async () => {
    const control = makeControl()
    const res = await trigger(control, [collaboratorTx(CHANNEL)])

    expect(res).toHaveLength(1)
    const createTx = res[0] as TxCreateDoc<Chat>
    expect(createTx.objectClass).toBe(chunter.class.Chat)
    expect(createTx.objectSpace).toBe(ALICE_SPACE)
    expect(createTx.attributes).toEqual({
      attachedTo: CHANNEL,
      attachedToClass: chunter.class.Channel,
      account: ALICE,
      pinned: false,
      hidden: false,
      collection: 'chats',
      preview: 'preview-1',
      readState: 'state-1'
    })
    // One query per class for the whole batch.
    expect((control.findAll as jest.Mock).mock.calls.map((it) => it[1])).toEqual([
      core.class.DocPreview,
      notification.class.ReadState
    ])
  })

  it('makes the read state of a document from before them, once per document, and says so', async () => {
    const control = makeControl()
    ;(control.findAll as jest.Mock).mockImplementation(async (_ctx: unknown, _class: Ref<Class<Doc>>, query: any) => {
      if (_class === core.class.DocPreview) return toFindResult(previews as any)
      if (_class === notification.class.ReadState) {
        return toFindResult([{ _id: 'state-1', attachedTo: CHANNEL, attachedToClass: chunter.class.Channel }] as any)
      }
      if (_class === activity.class.ActivityMessage && query.attachedTo === OLD_DOC) {
        return toFindResult([{ _id: 'msg-9', createdOn: 900 }] as any)
      }
      return toFindResult([])
    })
    const res = await trigger(control, [collaboratorTx(OLD_DOC), collaboratorTx(OLD_DOC), collaboratorTx(CHANNEL)])

    // The read state is applied at once, so the chats of the batch can point at it; the trigger
    // returns the chats only.
    expect(control.apply).toHaveBeenCalledTimes(1)
    const [stateTx] = (control.apply as jest.Mock).mock.calls[0][1] as TxCreateDoc<ReadState>[]
    expect(stateTx.objectClass).toBe(notification.class.ReadState)
    expect(stateTx.objectSpace).toBe(OLD_DOC)
    expect(stateTx.attributes).toEqual({
      attachedTo: OLD_DOC,
      attachedToClass: chunter.class.Channel,
      collection: 'readStates',
      latestMessageId: 'msg-9',
      latestMessageTimestamp: 900
    })
    expect(res).toHaveLength(3)
    const chats = res as TxCreateDoc<Chat>[]
    expect(chats.map((it) => it.attributes.readState)).toEqual([stateTx.objectId, stateTx.objectId, 'state-1'])
    expect(control.ctx.warn).toHaveBeenCalledTimes(1)
    expect(control.ctx.warn).toHaveBeenCalledWith(
      'read state made for a document without one',
      expect.objectContaining({ attachedTo: OLD_DOC })
    )
  })

  // Previews only: no read state, no messages.
  const previewsOnly = async (_ctx: unknown, _class: Ref<Class<Doc>>): Promise<any> =>
    toFindResult(_class === core.class.DocPreview ? (previews as any) : [])

  it('gives a document without messages a read state at time zero', async () => {
    const control = makeControl()
    ;(control.findAll as jest.Mock).mockImplementation(previewsOnly)
    const res = await trigger(control, [collaboratorTx(OLD_DOC)])

    expect(res).toHaveLength(1)
    const [stateTx] = (control.apply as jest.Mock).mock.calls[0][1] as TxCreateDoc<ReadState>[]
    expect(stateTx.attributes).toEqual({
      attachedTo: OLD_DOC,
      attachedToClass: chunter.class.Channel,
      collection: 'readStates',
      latestMessageTimestamp: 0
    })
    expect((res[0] as TxCreateDoc<Chat>).attributes.readState).toBe(stateTx.objectId)
  })

  it('takes the state another trigger made first when its own is refused', async () => {
    const control = makeControl()
    ;(control.apply as jest.Mock).mockRejectedValue(new Error('duplicate key'))
    let asked = 0
    ;(control.findAll as jest.Mock).mockImplementation(async (_ctx: unknown, _class: Ref<Class<Doc>>) => {
      if (_class === core.class.DocPreview) return toFindResult(previews as any)
      if (_class === notification.class.ReadState) {
        // Nothing on the first look, the other trigger's state on the second
        asked++
        return toFindResult(asked > 1 ? ([{ _id: 'state-other', attachedTo: OLD_DOC }] as any) : [])
      }
      return toFindResult([])
    })
    const res = await trigger(control, [collaboratorTx(OLD_DOC)])

    expect(res).toHaveLength(1)
    expect((res[0] as TxCreateDoc<Chat>).attributes.readState).toBe('state-other')
    expect(control.ctx.error).not.toHaveBeenCalled()
  })

  it('still makes the chat, without a read state, when none can be had', async () => {
    const control = makeControl()
    ;(control.apply as jest.Mock).mockRejectedValue(new Error('down'))
    ;(control.findAll as jest.Mock).mockImplementation(previewsOnly)
    const res = await trigger(control, [collaboratorTx(OLD_DOC)])

    expect(res).toHaveLength(1)
    expect((res[0] as TxCreateDoc<Chat>).attributes).not.toHaveProperty('readState')
    expect(control.ctx.error).toHaveBeenCalledWith(
      'read state could not be made, the chat gets none',
      expect.objectContaining({ attachedTo: OLD_DOC })
    )
  })

  it('skips a document it cannot find and says so, making it no read state', async () => {
    const control = makeControl()
    ;(control.findAll as jest.Mock).mockImplementation(async (_ctx: unknown, _class: Ref<Class<Doc>>) =>
      toFindResult(_class === core.class.DocPreview ? (previews.slice(0, 1) as any) : [])
    )
    const res = await trigger(control, [collaboratorTx(OLD_DOC), collaboratorTx(CHANNEL)])

    expect(res).toHaveLength(1)
    expect((res[0] as TxCreateDoc<Chat>).attributes.attachedTo).toBe(CHANNEL)
    expect(control.ctx.error).toHaveBeenCalledWith(
      'chat skipped: the document has no preview',
      expect.objectContaining({ attachedTo: OLD_DOC })
    )
    // The read state of the skipped document is not made either; the channel gets its own.
    expect((control.apply as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('queries nothing for collaborators of documents without activity', async () => {
    const control = makeControl()
    const tx = txFactory.createTxCreateDoc(
      core.class.Collaborator,
      'space-1' as Ref<Space>,
      {
        attachedTo: 'setting-1',
        attachedToClass: 'class:Setting',
        collection: 'collaborators',
        collaborator: ALICE
      } as any
    )
    expect(await trigger(control, [tx])).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })
})
