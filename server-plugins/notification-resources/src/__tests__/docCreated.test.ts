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
import core, { TxFactory, type Class, type Doc, type Ref, type Space, type TxCreateDoc } from '@hcengineering/core'
import notification, { type ReadState } from '@hcengineering/notification'
import { type TriggerControl } from '@hcengineering/server-core'

import plugin from '../index'

const activityClass = 'class:Issue' as Ref<Class<Doc>>
const spaceClass = 'class:Channel' as Ref<Class<Space>>
const plainClass = 'class:Setting' as Ref<Class<Doc>>

const txFactory = new TxFactory('test-account' as any)

// Only the first two classes carry the ActivityDoc mixin, and `class:Channel` is itself a space.
function makeControl (): TriggerControl {
  return {
    ctx: { error: jest.fn(), info: jest.fn(), newChild: jest.fn().mockReturnThis() },
    txFactory,
    hierarchy: {
      classHierarchyMixin: (_class: Ref<Class<Doc>>, mixin: Ref<Doc>) =>
        mixin === activity.mixin.ActivityDoc && (_class === activityClass || _class === spaceClass) ? {} : undefined,
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) =>
        base === core.class.Space ? _class === spaceClass : _class === base
    }
  } as any as TriggerControl
}

describe('OnDocCreated (notification)', () => {
  const trigger = async (txes: TxCreateDoc<Doc>[]): Promise<TxCreateDoc<ReadState>[]> =>
    (await (await plugin()).trigger.OnDocCreated(txes, makeControl())) as TxCreateDoc<ReadState>[]

  it('gives an activity document a read state with the timestamp at zero', async () => {
    const tx = txFactory.createTxCreateDoc(activityClass, 'space-1' as Ref<Space>, {} as any, 'issue-1' as Ref<Doc>)
    const res = await trigger([tx])

    expect(res).toHaveLength(1)
    expect(res[0]._class).toBe(core.class.TxCreateDoc)
    expect(res[0].objectClass).toBe(notification.class.ReadState)
    expect(res[0].objectSpace).toBe('space-1')
    expect(res[0].attributes).toEqual({
      attachedTo: 'issue-1',
      attachedToClass: activityClass,
      collection: 'readStates',
      latestMessageTimestamp: 0
    })
  })

  it('keeps the read state of a space in the space itself', async () => {
    const tx = txFactory.createTxCreateDoc(spaceClass, core.space.Space, {} as any, 'channel-1' as Ref<Space>)
    const [res] = await trigger([tx])

    expect(res.objectSpace).toBe('channel-1')
    expect(res.attributes.attachedTo).toBe('channel-1')
    expect(res.attributes.latestMessageTimestamp).toBe(0)
  })

  it('ignores documents without activity', async () => {
    const tx = txFactory.createTxCreateDoc(plainClass, 'space-1' as Ref<Space>, {} as any)
    expect(await trigger([tx])).toEqual([])
  })
})
