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

import core, { createClient, type Ref, type Space, type Tx, TxOperations } from '@hcengineering/core'
import { LiveQuery } from '..'
import { connect } from './connection'
import { test } from './minmodel'

async function getClient (): Promise<{ liveQuery: LiveQuery, factory: TxOperations }> {
  const storage = await createClient(connect)
  const liveQuery = new LiveQuery(storage)
  storage.notify = (...tx: Tx[]) => {
    liveQuery.tx(...tx).catch((err) => {
      console.log(err)
    })
  }
  return { liveQuery, factory: new TxOperations(storage, core.account.System) }
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

// The pin toggle: findOne by attachedTo, then remove what it found or create one.
async function toggle (liveQuery: LiveQuery, factory: TxOperations, space: Ref<Space>): Promise<void> {
  const current = await liveQuery.findOne(test.class.TestComment, { attachedTo: space })
  if (current !== undefined) {
    await factory.removeDoc(current._class, current.space, current._id)
  } else {
    await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', { message: 'pin' })
  }
  await flush()
}

describe('findOne after a removal', () => {
  async function setup (): Promise<{ liveQuery: LiveQuery, factory: TxOperations, space: Ref<Space> }> {
    const { liveQuery, factory } = await getClient()
    const space = await factory.createDoc(core.class.Space, core.space.Model, {
      name: 'pin',
      description: '',
      private: false,
      archived: false,
      members: []
    })
    return { liveQuery, factory, space }
  }

  it('finds nothing once the document it found is removed', async () => {
    const { liveQuery, factory, space } = await setup()

    await toggle(liveQuery, factory, space)
    expect(await liveQuery.findOne(test.class.TestComment, { attachedTo: space })).toBeDefined()
    await toggle(liveQuery, factory, space)
    expect(await liveQuery.findOne(test.class.TestComment, { attachedTo: space })).toBeUndefined()
    await toggle(liveQuery, factory, space)
    expect(await liveQuery.findOne(test.class.TestComment, { attachedTo: space })).toBeDefined()
  })

  it('finds nothing once the document is removed while a live query holds it', async () => {
    const { liveQuery, factory, space } = await setup()
    let pinned = -1
    liveQuery.query(test.class.TestComment, {}, (res) => {
      pinned = res.length
    })
    await flush()

    await toggle(liveQuery, factory, space)
    expect(pinned).toBe(1)
    await toggle(liveQuery, factory, space)
    expect(pinned).toBe(0)
    expect(await liveQuery.findOne(test.class.TestComment, { attachedTo: space })).toBeUndefined()
    await toggle(liveQuery, factory, space)
    expect(pinned).toBe(1)
  })

  it('finds nothing once the document is removed while disconnected', async () => {
    const storage = await createClient(connect)
    const liveQuery = new LiveQuery(storage)
    let online = true
    storage.notify = (...tx: Tx[]) => {
      if (!online) return
      liveQuery.tx(...tx).catch((err) => {
        console.log(err)
      })
    }
    const factory = new TxOperations(storage, core.account.System)
    const space = await factory.createDoc(core.class.Space, core.space.Model, {
      name: 'pin',
      description: '',
      private: false,
      archived: false,
      members: []
    })
    let pinned = -1
    liveQuery.query(test.class.TestComment, {}, (res) => {
      pinned = res.length
    })
    await flush()
    const pin = await factory.addCollection(test.class.TestComment, space, space, core.class.Space, 'comments', {
      message: 'pin'
    })
    await flush()
    expect(pinned).toBe(1)

    online = false
    await factory.removeDoc(test.class.TestComment, space, pin)
    online = true
    await liveQuery.refreshConnect(true)
    await flush()

    expect(pinned).toBe(0)
    expect(await liveQuery.findOne(test.class.TestComment, { attachedTo: space })).toBeUndefined()
    expect(await liveQuery.findOne(test.class.TestComment, { _id: pin })).toBeUndefined()
  })
})
