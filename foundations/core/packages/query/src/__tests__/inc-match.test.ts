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

// $inc-only txes (collection counters) must not trigger server round trips for live
// queries that do not reference the incremented field, and an equal-timestamp $inc (derived
// counter txes share the parent tx timestamp) must be applied locally instead of re-fetched.

import core, {
  createClient,
  TxFactory,
  TxOperations,
  type Client,
  type Doc,
  type Ref,
  type Space,
  type Tx
} from '@hcengineering/core'
import { LiveQuery } from '..'
import { connect } from './connection'

interface CounterSpace extends Space {
  rate?: number
  hits?: number
}

async function getCountingClient (): Promise<{
  liveQuery: LiveQuery
  factory: TxOperations
  storage: Client
  txFactory: TxFactory
  serverCalls: () => number
}> {
  const storage = await createClient(connect)
  let calls = 0
  const rawFindAll = storage.findAll.bind(storage)
  const counting: Client = Object.assign(Object.create(Object.getPrototypeOf(storage)), storage, {
    findAll: async (_class: any, query: any, options: any) => {
      calls++
      return await rawFindAll(_class, query, options)
    }
  })
  const liveQuery = new LiveQuery(counting)
  storage.notify = (...tx: Tx[]) => {
    liveQuery.tx(...tx).catch((err) => {
      console.log(err)
    })
  }
  return {
    liveQuery,
    factory: new TxOperations(storage, core.account.System),
    storage,
    txFactory: new TxFactory(core.account.System),
    serverCalls: () => calls
  }
}

async function createSpace (factory: TxOperations, priv: boolean, extra?: Partial<CounterSpace>): Promise<Ref<Space>> {
  return await factory.createDoc(core.class.Space, core.space.Model, {
    name: 'counter-space',
    description: '',
    private: priv,
    members: [],
    archived: false,
    ...(extra ?? {})
  } as any)
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

// Subscribe and resolve once the first callback fires; returns live handles to the result.
async function subscribe<T extends Doc> (
  liveQuery: LiveQuery,
  _class: Ref<any>,
  query: any,
  options?: any
): Promise<{ last: () => T[], updates: () => number }> {
  let last: T[] = []
  let updates = 0
  await new Promise((resolve) => {
    liveQuery.query<T>(
      _class,
      query,
      (res) => {
        last = res as T[]
        updates++
        resolve(null)
      },
      options
    )
  })
  return { last: () => last, updates: () => updates }
}

describe('$inc match handling — doc outside the result (matchQuery)', () => {
  it('does not hit the server for $inc on a field the query ignores', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const outsideId = await createSpace(factory, true)
    const q = await subscribe<Space>(liveQuery, core.class.Space, { private: false })
    const callsBefore = serverCalls()
    const updatesBefore = q.updates()

    for (let i = 0; i < 5; i++) {
      await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, outsideId, { $inc: { rate: 1 } } as any)
    }
    await settle()

    expect(serverCalls()).toBe(callsBefore)
    expect(q.updates()).toBe(updatesBefore)
  })

  it('checks the server when the query filters by the incremented field', async () => {
    const { liveQuery, factory } = await getCountingClient()
    const id = await createSpace(factory, true, { rate: 0 })
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { rate: 2 } as any)
    expect(q.last().length).toBe(0)

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, id, { $inc: { rate: 2 } } as any)
    await settle()

    expect(q.last().length).toBe(1) // rate reached 2 -> doc enters the result
  })

  it('checks the server when the query sorts by the incremented field', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const outsideId = await createSpace(factory, true)
    await subscribe<CounterSpace>(liveQuery, core.class.Space, { private: false }, { sort: { rate: 1 } as any })
    const callsBefore = serverCalls()

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, outsideId, { $inc: { rate: 1 } } as any)
    await settle()

    expect(serverCalls()).toBeGreaterThan(callsBefore)
  })

  it('ignores a multi-field $inc when none are referenced by the query', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const outsideId = await createSpace(factory, true)
    await subscribe<Space>(liveQuery, core.class.Space, { private: false })
    const callsBefore = serverCalls()

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, outsideId, {
      $inc: { rate: 1, hits: 3 }
    } as any)
    await settle()

    expect(serverCalls()).toBe(callsBefore)
  })

  it('checks the server when a multi-field $inc touches the query', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const outsideId = await createSpace(factory, true, { hits: 0 })
    await subscribe<CounterSpace>(liveQuery, core.class.Space, { private: false, hits: 3 } as any)
    const callsBefore = serverCalls()

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, outsideId, {
      $inc: { rate: 1, hits: 3 }
    } as any)
    await settle()

    expect(serverCalls()).toBeGreaterThan(callsBefore)
  })
})

describe('$inc match handling — doc inside the result (handleDocUpdate)', () => {
  it('applies a newer-timestamp $inc locally without a server call', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const insideId = await createSpace(factory, false, { rate: 1 })
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { _id: insideId } as any)
    expect(q.last()[0]?.rate).toBe(1)
    const callsBefore = serverCalls()

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, insideId, { $inc: { rate: 4 } } as any)
    await settle()

    expect(q.last()[0]?.rate).toBe(5)
    expect(serverCalls()).toBe(callsBefore)
  })

  it('applies an EQUAL-timestamp $inc-only tx locally without a server call', async () => {
    const { liveQuery, factory, storage, txFactory, serverCalls } = await getCountingClient()
    const insideId = await createSpace(factory, false, { rate: 10 })
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { _id: insideId } as any)
    const sameTs = q.last()[0].modifiedOn // derived counter txes share the doc's timestamp
    const callsBefore = serverCalls()

    const tx = txFactory.createTxUpdateDoc<CounterSpace>(
      core.class.Space,
      core.space.Model,
      insideId as Ref<CounterSpace>,
      { $inc: { rate: 5 } } as any,
      false,
      sameTs
    )
    await storage.tx(tx)
    await settle()

    expect(q.last()[0]?.rate).toBe(15) // applied locally
    expect(serverCalls()).toBe(callsBefore) // no re-fetch
  })

  it('re-fetches an EQUAL-timestamp NON-$inc update (cannot apply locally)', async () => {
    const { liveQuery, factory, storage, txFactory, serverCalls } = await getCountingClient()
    const insideId = await createSpace(factory, false, { rate: 1 })
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { _id: insideId } as any)
    const sameTs = q.last()[0].modifiedOn
    const callsBefore = serverCalls()

    const tx = txFactory.createTxUpdateDoc<CounterSpace>(
      core.class.Space,
      core.space.Model,
      insideId as Ref<CounterSpace>,
      { name: 'renamed' } as any,
      false,
      sameTs
    )
    await storage.tx(tx)
    await settle()

    expect(serverCalls()).toBeGreaterThan(callsBefore) // equal-ts non-$inc -> getCurrentDoc
  })

  it('re-fetches an EQUAL-timestamp mixed ($inc + field) update', async () => {
    const { liveQuery, factory, storage, txFactory, serverCalls } = await getCountingClient()
    const insideId = await createSpace(factory, false, { rate: 1 })
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { _id: insideId } as any)
    const sameTs = q.last()[0].modifiedOn
    const callsBefore = serverCalls()

    const tx = txFactory.createTxUpdateDoc<CounterSpace>(
      core.class.Space,
      core.space.Model,
      insideId as Ref<CounterSpace>,
      { name: 'x', $inc: { rate: 1 } } as any,
      false,
      sameTs
    )
    await storage.tx(tx)
    await settle()

    expect(serverCalls()).toBeGreaterThan(callsBefore) // not $inc-only -> not applied locally
  })

  it('accumulates consecutive $inc locally', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const insideId = await createSpace(factory, false, { rate: 0 })
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { _id: insideId } as any)
    const callsBefore = serverCalls()

    for (let i = 0; i < 10; i++) {
      await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, insideId, { $inc: { rate: 2 } } as any)
    }
    await settle()

    expect(q.last()[0]?.rate).toBe(20)
    expect(serverCalls()).toBe(callsBefore)
  })

  it('applies a negative $inc locally', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const insideId = await createSpace(factory, false, { rate: 5 })
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { _id: insideId } as any)
    const callsBefore = serverCalls()

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, insideId, { $inc: { rate: -3 } } as any)
    await settle()

    expect(q.last()[0]?.rate).toBe(2)
    expect(serverCalls()).toBe(callsBefore)
  })

  it('applies $inc to a field that started undefined', async () => {
    const { liveQuery, factory, serverCalls } = await getCountingClient()
    const insideId = await createSpace(factory, false) // no rate
    const q = await subscribe<CounterSpace>(liveQuery, core.class.Space, { _id: insideId } as any)
    expect(q.last()[0]?.rate).toBeUndefined()
    const callsBefore = serverCalls()

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, insideId, { $inc: { rate: 7 } } as any)
    await settle()

    expect(q.last()[0]?.rate).toBe(7)
    expect(serverCalls()).toBe(callsBefore)
  })

  it('re-evaluates a mixed update ($inc plus a matching field) as before', async () => {
    const { liveQuery, factory } = await getCountingClient()
    const outsideId = await createSpace(factory, true, { rate: 0 })
    const q = await subscribe<Space>(liveQuery, core.class.Space, { private: false })
    const before = q.last().length

    await factory.updateDoc<CounterSpace>(core.class.Space, core.space.Model, outsideId, {
      private: false,
      $inc: { rate: 1 }
    } as any)
    await settle()

    expect(q.last().length).toBe(before + 1) // private:false makes it match; $inc rides along
  })
})
