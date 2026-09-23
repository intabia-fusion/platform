/* eslint-disable import/first */
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

// Covers storage.ts branches integration.test.ts doesn't reach: buildOrder numeric/identifier/enum
// casts, reverse/forward lookup sort keys, the raw/backup low-level API, and the mixin tx path.

jest.mock('../version', () => ({
  waitForSchemaVersion: jest.fn().mockResolvedValue(undefined),
  EXPECTED_SCHEMA_VERSION: 10
}))

import core, {
  ClassifierKind,
  type Client,
  createClient,
  DOMAIN_MODEL,
  type Domain,
  type Enum,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  type PersonId,
  type Ref,
  SortingOrder,
  type Space,
  TxOperations,
  type WorkspaceUuid
} from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import { type DbAdapter, wrapAdapterToClient } from '@hcengineering/server-core'
import {
  createPostgresAdapter,
  createPostgresTxAdapter,
  getDBClient,
  shutdownPostgres,
  type PostgresClientReference
} from '..'
import {
  createAttribute,
  createClass,
  createDoc,
  genMinModel,
  test,
  type ComplexClass,
  type ComplexMixin
} from './minmodel'
import { createTaskModel, TaskReproduce, type Task, type TaskComment, taskPlugin } from './tasks'
import { withDatabase } from './utils'

const txes = genMinModel()
createTaskModel(txes)

// Enum values are deliberately not alphabetical and not in creation order, so
// a passing sort assertion can only be explained by the EnumOf CASE ordering.
const taskReproduceEnum = 'task-reproduce-enum' as Ref<Enum>

txes.push(
  createClass(core.class.Enum, {
    kind: ClassifierKind.CLASS,
    label: 'Enum' as IntlString,
    extends: core.class.Doc,
    domain: DOMAIN_MODEL
  }),
  createDoc(core.class.Enum, { name: 'TaskReproduce', enumValues: ['sometimes', 'always', 'rare'] }, taskReproduceEnum),
  createAttribute({
    attributeOf: taskPlugin.class.Task,
    name: 'reproduce',
    type: {
      _class: core.class.EnumOf,
      label: 'reproduce' as IntlString,
      of: taskReproduceEnum
    }
  }),
  createAttribute({
    attributeOf: taskPlugin.class.Task,
    name: 'rate',
    type: {
      _class: core.class.TypeNumber,
      label: 'rate' as IntlString
    }
  }),
  createAttribute({
    attributeOf: taskPlugin.class.Task,
    name: 'identifier',
    type: {
      _class: core.class.TypeIdentifier,
      label: 'identifier' as IntlString
    }
  }),
  createAttribute({
    attributeOf: taskPlugin.class.TaskComment,
    name: 'date',
    type: {
      _class: core.class.TypeDate,
      label: 'date' as IntlString
    }
  }),
  createAttribute({
    attributeOf: taskPlugin.class.TaskComment,
    name: 'order',
    type: {
      _class: core.class.TypeNumber,
      label: 'order' as IntlString
    }
  }),
  // `modifiedOn` is a real bigint column of every table: ordering by it must not cast the column.
  // Declared per class: the test hierarchy does not resolve ancestors up to core.class.Doc.
  createAttribute({
    attributeOf: taskPlugin.class.Task,
    name: 'modifiedOn',
    type: {
      _class: core.class.TypeTimestamp,
      label: 'modifiedOn' as IntlString
    }
  }),
  createAttribute({
    attributeOf: taskPlugin.class.TaskComment,
    name: 'modifiedOn',
    type: {
      _class: core.class.TypeTimestamp,
      label: 'modifiedOn' as IntlString
    }
  }),
  createAttribute({
    attributeOf: test.mixin.ComplexMixin,
    name: 'stringField',
    type: {
      _class: core.class.TypeString,
      label: 'stringField' as IntlString
    }
  })
)

const contextVars: Record<string, any> = {}

describe('PostgreSQL storage.ts coverage', () => {
  const baseDbUri: string = process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5433/postgres'

  let adminClientRef: PostgresClientReference

  let dbUuid: WorkspaceUuid
  let dbUri: string
  let hierarchy: Hierarchy
  let model: ModelDb
  let client: Client
  let operations: TxOperations
  let serverStorage: DbAdapter

  beforeAll(() => {
    adminClientRef = getDBClient(baseDbUri)
  })

  afterAll(async () => {
    adminClientRef.close()
    await shutdownPostgres()
  })

  beforeEach(async () => {
    dbUuid = crypto.randomUUID() as WorkspaceUuid
    dbUri = withDatabase(baseDbUri, dbUuid)

    try {
      const adminClient = await adminClientRef.getClient()
      await adminClient`CREATE DATABASE ${adminClient(dbUuid)}`
    } catch (err) {
      console.error('Failed to create test database:', err)
      throw err
    }

    await initDb()
  })

  afterEach(async () => {
    try {
      await client?.close()
      await serverStorage?.close()

      const adminClient = await adminClientRef.getClient()
      await adminClient`DROP DATABASE IF EXISTS ${adminClient(dbUuid)}`
    } catch (err) {
      console.error('Cleanup error:', err)
    }
  })

  async function initDb (): Promise<void> {
    hierarchy = new Hierarchy()
    model = new ModelDb(hierarchy)

    for (const t of txes) {
      hierarchy.tx(t)
    }

    for (const t of txes) {
      await model.tx(t)
    }

    const mctx = new MeasureMetricsContext('storage-coverage-test', {})

    const txStorage = await createPostgresTxAdapter(mctx, hierarchy, dbUri, { uuid: dbUuid, url: dbUri }, model)
    await txStorage.init?.(mctx, {})
    for (const t of txes) {
      await txStorage.tx(mctx, t)
    }
    await txStorage.close()

    const ctx = new MeasureMetricsContext('storage-coverage-test', {})
    serverStorage = await createPostgresAdapter(ctx, hierarchy, dbUri, { uuid: dbUuid, url: dbUri }, model)
    await serverStorage.init?.(ctx, contextVars)

    client = await createClient(async (handler) => {
      return wrapAdapterToClient(ctx, serverStorage, txes)
    })

    operations = new TxOperations(client, core.account.System)
  }

  describe('buildOrder branches', () => {
    it('sorts by a numeric attribute using a ::numeric cast, not lexicographically', async () => {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'n-100', description: '', rate: 100 })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'n-20', description: '', rate: 20 })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'n-5', description: '', rate: 5 })

      const asc = await client.findAll<Task>(taskPlugin.class.Task, {}, { sort: { rate: SortingOrder.Ascending } })
      expect(asc.map((t) => t.rate)).toEqual([5, 20, 100])

      const desc = await client.findAll<Task>(taskPlugin.class.Task, {}, { sort: { rate: SortingOrder.Descending } })
      expect(desc.map((t) => t.rate)).toEqual([100, 20, 5])
    })

    it('sorts by a TypeIdentifier attribute by prefix + numeric suffix, not text', async () => {
      await operations.createDoc(
        taskPlugin.class.Task,
        '' as Ref<Space>,
        {
          name: 't1',
          description: '',
          identifier: 'TASK-1'
        } as any
      )
      await operations.createDoc(
        taskPlugin.class.Task,
        '' as Ref<Space>,
        {
          name: 't2',
          description: '',
          identifier: 'TASK-2'
        } as any
      )
      await operations.createDoc(
        taskPlugin.class.Task,
        '' as Ref<Space>,
        {
          name: 't10',
          description: '',
          identifier: 'TASK-10'
        } as any
      )

      // Plain text sort would give TASK-1, TASK-10, TASK-2.
      const asc = await client.findAll<Task>(
        taskPlugin.class.Task,
        {},
        {
          sort: { identifier: SortingOrder.Ascending } as any
        }
      )
      expect(asc.map((t) => (t as any).identifier)).toEqual(['TASK-1', 'TASK-2', 'TASK-10'])
    })

    it('sorts by an EnumOf attribute using the enum declaration order', async () => {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'e1',
        description: '',
        reproduce: TaskReproduce.Rare
      })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'e2',
        description: '',
        reproduce: TaskReproduce.Always
      })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'e3',
        description: '',
        reproduce: TaskReproduce.Sometimes
      })

      const asc = await client.findAll<Task>(taskPlugin.class.Task, {}, { sort: { reproduce: SortingOrder.Ascending } })
      expect(asc.map((t) => t.reproduce)).toEqual([TaskReproduce.Sometimes, TaskReproduce.Always, TaskReproduce.Rare])
    })
  })

  describe('getReverseLookupOrder (sort by reverse-lookup field)', () => {
    it('sorts by min/max of $lookup.comments.order; a task without comments is null-ordered', async () => {
      const bMiddle = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'b-middle',
        description: ''
      })
      const aNewest = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'a-newest',
        description: ''
      })
      const cOldest = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'c-oldest',
        description: ''
      })
      const dEmpty = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'd-empty',
        description: ''
      })

      async function addComment (task: Ref<Task>, order: number): Promise<void> {
        await operations.addCollection(
          taskPlugin.class.TaskComment,
          '' as Ref<Space>,
          task,
          taskPlugin.class.Task,
          'comments',
          {
            message: `c-${order}`,
            date: new Date(),
            order
          } as any
        )
      }

      await addComment(bMiddle, 2000)
      await addComment(bMiddle, 500)
      await addComment(aNewest, 3000)
      await addComment(cOldest, 1000)
      await addComment(cOldest, 100)

      async function namesInOrder (order: SortingOrder): Promise<string[]> {
        const tasks = await client.findAll<Task>(
          taskPlugin.class.Task,
          { _id: { $in: [bMiddle, aNewest, cOldest, dEmpty] } },
          {
            lookup: { _id: { comments: taskPlugin.class.TaskComment } },
            sort: { '$lookup.comments.order': order } as any
          }
        )
        return tasks.map((t) => t.name)
      }

      expect(await namesInOrder(SortingOrder.Ascending)).toEqual(['c-oldest', 'b-middle', 'a-newest', 'd-empty'])
      // Postgres defaults NULLS FIRST for DESC, so the comment-less task leads.
      expect(await namesInOrder(SortingOrder.Descending)).toEqual(['d-empty', 'a-newest', 'b-middle', 'c-oldest'])
    })

    it('sorts a nested reverse lookup: TaskComment -> attachedTo Task -> reverse comments', async () => {
      const parentA = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'parent-a',
        description: ''
      })
      const parentB = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'parent-b',
        description: ''
      })

      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        parentA,
        taskPlugin.class.Task,
        'comments',
        {
          message: 'a1',
          date: new Date(),
          order: 500
        } as any
      )
      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        parentA,
        taskPlugin.class.Task,
        'comments',
        {
          message: 'a2',
          date: new Date(),
          order: 1500
        } as any
      )
      const commentB = await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        parentB,
        taskPlugin.class.Task,
        'comments',
        { message: 'b1', date: new Date(), order: 3000 } as any
      )

      const comments = await client.findAll<TaskComment>(
        taskPlugin.class.TaskComment,
        {},
        {
          lookup: { attachedTo: [taskPlugin.class.Task, { _id: { comments: taskPlugin.class.TaskComment } }] } as any,
          sort: { '$lookup.attachedTo.comments.order': SortingOrder.Ascending } as any
        }
      )

      // a1/a2 share min(order)=500 (parent-a's own comments), b1 is alone at 3000.
      expect(comments).toHaveLength(3)
      expect(comments[2]._id).toBe(commentB)
      expect(new Set(comments.slice(0, 2).map((c) => c.message))).toEqual(new Set(['a1', 'a2']))
    })
  })

  describe('numericOrderKey (numeric sort keys)', () => {
    // buildOrder returns the ORDER BY clause; the spy reads the one the last findAll built.
    async function orderClauseOf (run: () => Promise<unknown>): Promise<string> {
      const buildOrder = jest.spyOn(serverStorage as any, 'buildOrder')
      try {
        await run()
        return buildOrder.mock.results.at(-1)?.value as string
      } finally {
        buildOrder.mockRestore()
      }
    }

    async function addComment (task: Ref<Task>, order: unknown): Promise<void> {
      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        task,
        taskPlugin.class.Task,
        'comments',
        {
          message: `c-${String(order)}`,
          date: new Date(),
          order
        } as any
      )
    }

    it('orders by a real bigint column as is, without a ::numeric cast', async () => {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'first', description: '' })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'second', description: '' })

      let tasks: Task[] = []
      const clause = await orderClauseOf(async () => {
        tasks = await client.findAll<Task>(taskPlugin.class.Task, {}, { sort: { modifiedOn: SortingOrder.Descending } })
      })

      expect(clause).toMatch(/"modifiedOn" DESC/)
      expect(clause).not.toContain('::numeric')
      const stamps = tasks.map((t) => t.modifiedOn)
      expect(stamps).toEqual([...stamps].sort((a, b) => b - a))
    })

    it('aggregates a real bigint column of a reverse lookup without a cast', async () => {
      const task = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 't', description: '' })
      await addComment(task, 1)

      let tasks: Task[] = []
      const clause = await orderClauseOf(async () => {
        tasks = await client.findAll<Task>(
          taskPlugin.class.Task,
          {},
          {
            lookup: { _id: { comments: taskPlugin.class.TaskComment } },
            sort: { '$lookup.comments.modifiedOn': SortingOrder.Descending } as any
          }
        )
      })

      expect(clause).toMatch(/max\(\w+\."modifiedOn"\)/)
      expect(clause).not.toContain('::numeric')
      expect(tasks.map((t) => t._id)).toEqual([task])
    })

    it('sorts by a jsonb number: a numeric string counts as its number, another string orders as null, the query does not fail', async () => {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'five', description: '', rate: 5 })
      await operations.createDoc(
        taskPlugin.class.Task,
        '' as Ref<Space>,
        { name: 'text', description: '', rate: 'n/a' } as any
      )
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'one', description: '', rate: 1 })
      await operations.createDoc(
        taskPlugin.class.Task,
        '' as Ref<Space>,
        { name: 'three', description: '', rate: '3' } as any
      )

      let tasks: Task[] = []
      const clause = await orderClauseOf(async () => {
        tasks = await client.findAll<Task>(taskPlugin.class.Task, {}, { sort: { rate: SortingOrder.Ascending } })
      })

      expect(clause).toContain('pg_input_is_valid')
      expect(tasks.map((t) => t.name)).toEqual(['one', 'three', 'five', 'text'])
    })

    it('sorts by a reverse-lookup jsonb number: a numeric string counts, another string orders as null', async () => {
      const numeric = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'numeric',
        description: ''
      })
      const text = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'text',
        description: ''
      })
      const quoted = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'quoted',
        description: ''
      })
      await addComment(numeric, 10)
      await addComment(text, 'oops')
      await addComment(quoted, '5')

      const tasks = await client.findAll<Task>(
        taskPlugin.class.Task,
        { _id: { $in: [numeric, text, quoted] } },
        {
          lookup: { _id: { comments: taskPlugin.class.TaskComment } },
          sort: { '$lookup.comments.order': SortingOrder.Ascending } as any
        }
      )

      expect(tasks.map((t) => t.name)).toEqual(['quoted', 'numeric', 'text'])
    })
  })

  describe('transformLookupKey (sort by forward-lookup field)', () => {
    it('sorts by a data field of the looked-up doc ($lookup.attachedTo.name)', async () => {
      const alpha = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'Alpha Task',
        description: ''
      })
      const bravo = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'Bravo Task',
        description: ''
      })

      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        bravo,
        taskPlugin.class.Task,
        'comments',
        {
          message: 'on-bravo',
          date: new Date()
        }
      )
      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        alpha,
        taskPlugin.class.Task,
        'comments',
        {
          message: 'on-alpha',
          date: new Date()
        }
      )

      const comments = await client.findAll<TaskComment>(
        taskPlugin.class.TaskComment,
        {},
        {
          lookup: { attachedTo: taskPlugin.class.Task },
          sort: { '$lookup.attachedTo.name': SortingOrder.Ascending } as any
        }
      )

      expect(comments.map((c) => c.message)).toEqual(['on-alpha', 'on-bravo'])
    })

    it('sorts by a non-data column of the looked-up doc ($lookup.attachedTo.modifiedOn)', async () => {
      const first = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'first',
        description: ''
      })
      const second = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'second',
        description: ''
      })

      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        second,
        taskPlugin.class.Task,
        'comments',
        {
          message: 'on-second',
          date: new Date()
        }
      )
      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        first,
        taskPlugin.class.Task,
        'comments',
        {
          message: 'on-first',
          date: new Date()
        }
      )

      const comments = await client.findAll<TaskComment>(
        taskPlugin.class.TaskComment,
        {},
        {
          lookup: { attachedTo: taskPlugin.class.Task },
          sort: { '$lookup.attachedTo.modifiedOn': SortingOrder.Ascending } as any
        }
      )

      expect(comments.map((c) => c.message)).toEqual(['on-first', 'on-second'])
    })
  })

  describe('raw low-level API', () => {
    it('rawFindAll filters via buildRawQuery and sorts via buildRawOrder', async () => {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'raw-a', description: '', rate: 3 })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'raw-b', description: '', rate: 1 })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'raw-c', description: '', rate: 2 })

      const found = await serverStorage.rawFindAll<Task>(
        'test-task' as Domain,
        { name: { $like: 'raw-%' } },
        { sort: { name: SortingOrder.Ascending } }
      )

      expect(found.map((t) => t.name)).toEqual(['raw-a', 'raw-b', 'raw-c'])
    })

    it('rawUpdate applies a plain field set (non-operator)', async () => {
      const id = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'to-update',
        description: '',
        rate: 1
      })

      await serverStorage.rawUpdate<Task>('test-task' as Domain, { _id: id }, { name: 'updated-via-raw' })

      const updated = await client.findOne<Task>(taskPlugin.class.Task, { _id: id })
      expect(updated?.name).toBe('updated-via-raw')
    })

    it('rawUpdate applies an operator update ($inc)', async () => {
      const id = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: 'to-inc',
        description: '',
        rate: 10
      })

      await serverStorage.rawUpdate<Task>('test-task' as Domain, { _id: id }, { $inc: { rate: 5 } } as any)

      const updated = await client.findOne<Task>(taskPlugin.class.Task, { _id: id })
      expect(updated?.rate).toBe(15)
    })

    it('rawDeleteMany removes matching documents', async () => {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'del-1', description: '' })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'del-2', description: '' })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'keep', description: '' })

      await serverStorage.rawDeleteMany<Task>('test-task' as Domain, { name: { $like: 'del-%' } })

      const remaining = await client.findAll<Task>(taskPlugin.class.Task, {})
      expect(remaining.map((t) => t.name)).toEqual(['keep'])
    })

    it('traverse iterates all matching documents until exhausted, then closes', async () => {
      for (let i = 0; i < 5; i++) {
        await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
          name: `trav-${i}`,
          description: '',
          rate: i
        })
      }

      const cursor = await serverStorage.traverse<Task>(
        'test-task' as Domain,
        {},
        { sort: { rate: SortingOrder.Ascending } }
      )
      try {
        const names: string[] = []
        let page = await cursor.next(2)
        while (page !== null) {
          names.push(...page.map((t) => t.name))
          page = await cursor.next(2)
        }
        expect(names).toEqual(['trav-0', 'trav-1', 'trav-2', 'trav-3', 'trav-4'])
      } finally {
        await cursor.close()
      }
    })
  })

  describe('backup API (find/load/upload/clean/getDomainHash)', () => {
    it('round-trips docs through upload -> find -> load -> upload(update) -> load -> clean', async () => {
      const domain = 'test-task' as Domain
      const ctx = new MeasureMetricsContext('backup-test', {})

      const id1 = 'backup-1' as Ref<Task>
      const id2 = 'backup-2' as Ref<Task>
      const backupDoc1: Task = {
        _id: id1,
        _class: taskPlugin.class.Task,
        name: 'backup-task-1',
        description: 'first',
        rate: 1,
        modifiedBy: 'user' as PersonId,
        modifiedOn: Date.now(),
        space: '' as Ref<Space>
      }
      const backupDoc2: Task = {
        _id: id2,
        _class: taskPlugin.class.Task,
        name: 'backup-task-2',
        description: 'second',
        rate: 2,
        modifiedBy: 'user' as PersonId,
        modifiedOn: Date.now(),
        space: '' as Ref<Space>
      }

      expect(await serverStorage.getDomainHash(ctx, domain)).toBe('')

      await serverStorage.upload(ctx, domain, [backupDoc1, backupDoc2])

      const hashes = new Map<string, string>()
      const it = serverStorage.find(ctx, domain)
      try {
        let page = await it.next(ctx)
        while (page.length > 0) {
          for (const info of page) hashes.set(info.id, info.hash)
          page = await it.next(ctx)
        }
      } finally {
        await it.close(ctx)
      }
      expect(new Set(hashes.keys())).toEqual(new Set([id1, id2]))
      expect(hashes.get(id1)).toBeTruthy()

      const loaded = await serverStorage.load(ctx, domain, [id1, id2])
      expect(loaded.map((d) => (d as Task).name).sort()).toEqual(['backup-task-1', 'backup-task-2'])

      const domainHashBefore = await serverStorage.getDomainHash(ctx, domain)

      const updatedDoc: Task = { ...(loaded.find((d) => d._id === id1) as Task), name: 'backup-task-1-updated' }
      delete (updatedDoc as any)['%hash%']
      await serverStorage.upload(ctx, domain, [updatedDoc])

      const domainHashAfter = await serverStorage.getDomainHash(ctx, domain)
      expect(domainHashAfter).not.toBe(domainHashBefore)

      const reloaded = await serverStorage.load(ctx, domain, [id1])
      expect((reloaded[0] as Task).name).toBe('backup-task-1-updated')

      await serverStorage.clean(ctx, domain, [id1, id2])

      const afterClean = await serverStorage.load(ctx, domain, [id1, id2])
      expect(afterClean).toEqual([])
      expect(await serverStorage.getDomainHash(ctx, domain)).toBe('')
    })
  })

  describe('groupBy', () => {
    it('groups by a data field and counts occurrences', async () => {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'g1', description: '', rate: 10 })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'g2', description: '', rate: 10 })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'g3', description: '', rate: 20 })

      const ctx = new MeasureMetricsContext('groupby-test', {})
      const groups = await serverStorage.groupBy<string, Task>(ctx, 'test-task' as Domain, 'rate')

      expect(groups.get('10')).toBe(2)
      expect(groups.get('20')).toBe(1)
    })

    it('groups by a data field with a query filter', async () => {
      const sp1 = 'space-1' as Ref<Space>
      await operations.createDoc(taskPlugin.class.Task, sp1, { name: 'g1', description: '', rate: 10 })
      await operations.createDoc(taskPlugin.class.Task, sp1, { name: 'g2', description: '', rate: 10 })
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, { name: 'g3', description: '', rate: 10 })

      const ctx = new MeasureMetricsContext('groupby-test', {})
      const groups = await serverStorage.groupBy<string, Task>(ctx, 'test-task' as Domain, 'rate', { space: sp1 })

      expect(groups.get('10')).toBe(2)
    })
  })

  describe('mixin tx path (txMixin via createMixin/updateMixin)', () => {
    it('stores mixin data nested under the mixin id and is queryable/updatable via the mixin class', async () => {
      const spaceRef = '' as Ref<Space>
      const id = await operations.createDoc(test.class.ComplexClass, spaceRef, {
        stringField: 'base',
        numberField: 0,
        booleanField: false,
        arrayField: [],
        numberArrayField: []
      })

      await operations.createMixin(id, test.class.ComplexClass, spaceRef, test.mixin.ComplexMixin, {
        stringField: 'mixed-in',
        numberField: 99,
        booleanField: true,
        arrayField: ['a'],
        numberArrayField: [1, 2, 3]
      } as any)

      const found = await client.findAll<ComplexMixin>(test.mixin.ComplexMixin, { stringField: 'mixed-in' } as any)
      expect(found).toHaveLength(1)
      // Querying by the mixin class presents the mixin's field, not the base doc's own one.
      expect(found[0].stringField).toBe('mixed-in')
      expect((found[0] as any)[test.mixin.ComplexMixin].stringField).toBe('mixed-in')

      // The base doc's own field, read via the base class, is untouched by the mixin.
      const baseDoc = await client.findOne<ComplexClass>(test.class.ComplexClass, { _id: id })
      expect(baseDoc?.stringField).toBe('base')

      await operations.updateMixin(id, test.class.ComplexClass, spaceRef, test.mixin.ComplexMixin, {
        stringField: 'updated-via-mixin'
      } as any)

      const afterUpdate = await client.findAll<ComplexMixin>(test.mixin.ComplexMixin, {
        stringField: 'updated-via-mixin'
      } as any)
      expect(afterUpdate).toHaveLength(1)
      expect(afterUpdate[0]._id).toBe(id)

      const stale = await client.findAll<ComplexMixin>(test.mixin.ComplexMixin, { stringField: 'mixed-in' } as any)
      expect(stale).toHaveLength(0)
    })
  })
})
