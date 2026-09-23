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

// The mock ClientConnection (./connection.ts) has no fulltext engine: its findAll/findOne
// run the generic matchQuery(), which treats an unknown `$search` query key like any other
// field - a doc never has a `$search` property, so any query carrying a truthy `$search`
// always comes back empty from the raw mock. That means LiveQuery's fulltext branches
// (checkSearch, the $search gate in handleDocAdd, the IndexingUpdate refresh) can never be
// driven through the raw mock's own behaviour: a doc can never even enter a $search query's
// result to begin with. To exercise them for real we wrap the mock client with a small
// fulltext stub (withFulltextStub below) that strips `$search`/`$searchStrict` before
// delegating to the raw mock, then filters by a test-controlled `matches` set - a stand-in
// fulltext index the test can edit to make a doc "enter" or "leave" the search results.
// This is a test-local fake, not a discovery that the real server behaves this way.

import core, {
  createClient,
  generateId,
  toFindResult,
  TxOperations,
  WorkspaceEvent,
  type Class,
  type Client,
  type Doc,
  type FindResult,
  type IndexingUpdateEvent,
  type Ref,
  type Space,
  type Tx,
  type TxWorkspaceEvent
} from '@hcengineering/core'
import { LiveQuery } from '..'
import { connect } from './connection'
import { test } from './minmodel'

interface TestProject extends Space {
  prjName: string
}

// Wraps a client so a query with `$search` is answered from `matches` instead of the raw
// mock (which cannot honour `$search` at all - see file header).
function withFulltextStub (storage: Client, matches: Set<Ref<Doc>>): Client {
  const rawFindAll = storage.findAll.bind(storage)
  return Object.assign(Object.create(Object.getPrototypeOf(storage)), storage, {
    findAll: async (_class: any, query: any, options: any) => {
      if (query?.$search == null) return await rawFindAll(_class, query, options)
      const { $search, $searchStrict, ...rest } = query
      const docs = await rawFindAll(_class, rest, options)
      const filtered = docs.filter((d: Doc) => matches.has(d._id))
      return toFindResult(filtered, filtered.length)
    }
  })
}

async function getSearchClient (matches: Set<Ref<Doc>>): Promise<{
  liveQuery: LiveQuery
  factory: TxOperations
  findAllCalls: () => number
}> {
  const storage = await createClient(connect)
  const searchAware = withFulltextStub(storage, matches)
  let calls = 0
  const rawFindAll = searchAware.findAll.bind(searchAware)
  const counting: Client = Object.assign(Object.create(Object.getPrototypeOf(searchAware)), searchAware, {
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
  return { liveQuery, factory: new TxOperations(storage, core.account.System), findAllCalls: () => calls }
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50))
}

async function createProject (factory: TxOperations, prjName: string, id?: Ref<TestProject>): Promise<Ref<TestProject>> {
  return await factory.createDoc(
    test.class.TestProject,
    core.space.Model,
    { name: prjName, description: '', private: false, members: [], archived: false, prjName },
    id
  )
}

// Subscribe and resolve once the first callback fires. Returns an unsubscribe handle.
async function subscribe<T extends Doc> (
  liveQuery: LiveQuery,
  _class: Ref<Class<T>>,
  query: any,
  options?: any
): Promise<{ last: () => FindResult<T>, unsubscribe: () => void }> {
  let last: FindResult<T> = toFindResult([])
  let unsubscribe: () => void = () => {}
  await new Promise((resolve) => {
    unsubscribe = liveQuery.query<T>(
      _class,
      query,
      (res) => {
        last = res
        resolve(null)
      },
      options
    )
  })
  return {
    last: () => last,
    unsubscribe: () => {
      unsubscribe()
    }
  }
}

function indexingUpdateTx (classes: Array<Ref<Class<Doc>>>): TxWorkspaceEvent<IndexingUpdateEvent> {
  return {
    _id: generateId(),
    _class: core.class.TxWorkspaceEvent,
    space: core.space.DerivedTx,
    objectSpace: core.space.Tx,
    modifiedBy: core.account.System,
    modifiedOn: Date.now(),
    event: WorkspaceEvent.IndexingUpdate,
    params: { _class: classes }
  }
}

describe('LiveQuery $search handling', () => {
  it('excludes a newly created doc that fails the fulltext check', async () => {
    const matches = new Set<Ref<Doc>>()
    const { liveQuery, factory } = await getSearchClient(matches)
    const sub = await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' })
    expect(sub.last()).toHaveLength(0)

    await createProject(factory, 'no-match')
    await settle()

    // handleDocAdd's $search gate must keep it out even though it matches every other criterion.
    expect(sub.last()).toHaveLength(0)
  })

  it('includes a newly created doc that passes the fulltext check', async () => {
    const id = generateId<TestProject>()
    const matches = new Set<Ref<Doc>>([id])
    const { liveQuery, factory } = await getSearchClient(matches)
    const sub = await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' })

    await createProject(factory, 'matches', id)
    await settle()

    expect(sub.last()).toHaveLength(1)
    expect(sub.last()[0].prjName).toBe('matches')
  })

  it('refreshes the query when a full-limit doc drops out of the fulltext index', async () => {
    const id = generateId<TestProject>()
    const matches = new Set<Ref<Doc>>([id])
    const { liveQuery, factory, findAllCalls } = await getSearchClient(matches)
    await createProject(factory, 'was-matching', id)

    const sub = await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' }, { limit: 1 })
    expect(sub.last()).toHaveLength(1)

    matches.delete(id) // simulate the doc dropping out of the fulltext index
    const before = findAllCalls()
    await factory.updateDoc(test.class.TestProject, core.space.Model, id, { prjName: 'edited' })
    await settle()

    // checkSearch's "no match, result at its limit" branch forces a full refresh: one findAll
    // for the fulltext re-check itself, one more for the refresh.
    expect(findAllCalls()).toBe(before + 2)
    expect(sub.last()).toHaveLength(0)
  })

  it('drops a doc locally, without a refetch, when a non-full result loses its fulltext match', async () => {
    const id = generateId<TestProject>()
    const matches = new Set<Ref<Doc>>([id])
    const { liveQuery, factory, findAllCalls } = await getSearchClient(matches)
    await createProject(factory, 'was-matching', id)

    const sub = await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' }, { total: true })
    expect(sub.last()).toHaveLength(1)
    expect(sub.last().total).toBe(1)

    matches.delete(id)
    const before = findAllCalls()
    await factory.updateDoc(test.class.TestProject, core.space.Model, id, { prjName: 'edited' })
    await settle()

    // Not at its limit: checkSearch deletes the doc from the cached result directly and
    // decrements total, costing only the fulltext re-check - no second findAll.
    expect(findAllCalls()).toBe(before + 1)
    expect(sub.last()).toHaveLength(0)
    expect(sub.last().total).toBe(0)
  })

  it('updates a doc in place when it still matches $search after an edit', async () => {
    const id = generateId<TestProject>()
    const matches = new Set<Ref<Doc>>([id])
    const { liveQuery, factory, findAllCalls } = await getSearchClient(matches)
    await createProject(factory, 'still-matching', id)

    const sub = await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' })
    expect(sub.last()[0].prjName).toBe('still-matching')

    const before = findAllCalls()
    await factory.updateDoc(test.class.TestProject, core.space.Model, id, { prjName: 'still-matching-edited' })
    await settle()

    expect(findAllCalls()).toBe(before + 1) // only the fulltext re-check, no refresh, no delete
    expect(sub.last()).toHaveLength(1)
    expect(sub.last()[0].prjName).toBe('still-matching-edited')
  })

  it('refreshes an active $search query on WorkspaceEvent.IndexingUpdate for a matching class', async () => {
    const matches = new Set<Ref<Doc>>()
    const { liveQuery, findAllCalls } = await getSearchClient(matches)
    await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' })
    const before = findAllCalls()

    // TxWorkspaceEvent isn't a class genMinModel registers, so it cannot be persisted through
    // the mock's TxDb; feed it straight to LiveQuery.tx, exactly what storage.notify would do.
    await liveQuery.tx(indexingUpdateTx([test.class.TestProject]))
    await settle()

    expect(findAllCalls()).toBeGreaterThan(before)
  })

  it('evicts a parked $search query on WorkspaceEvent.IndexingUpdate for a matching class', async () => {
    const matches = new Set<Ref<Doc>>()
    const { liveQuery, findAllCalls } = await getSearchClient(matches)
    const q = await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' })
    q.unsubscribe()

    await liveQuery.tx(indexingUpdateTx([test.class.TestProject]))
    await settle()

    const before = findAllCalls()
    // A parked query normally answers a resubscribe from cache (0 extra calls). Once
    // IndexingUpdate evicts it, the resubscribe has nothing to reuse and must refetch.
    await subscribe<TestProject>(liveQuery, test.class.TestProject, { $search: 'foo' })
    expect(findAllCalls()).toBeGreaterThan(before)
  })
})
