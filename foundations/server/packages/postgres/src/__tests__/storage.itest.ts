/* eslint-disable import/first */
//
// Copyright © 2024 Hardcore Engineering Inc.
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

jest.mock('../version', () => ({
  waitForSchemaVersion: jest.fn().mockResolvedValue(undefined),
  EXPECTED_SCHEMA_VERSION: 10
}))

import core, {
  type Client,
  createClient,
  generateId,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  type Ref,
  SortingOrder,
  type Space,
  TxOperations,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type DbAdapter, wrapAdapterToClient } from '@hcengineering/server-core'
import {
  createPostgresAdapter,
  createPostgresTxAdapter,
  getDBClient,
  shutdownPostgres,
  type PostgresClientReference
} from '..'
import { genMinModel } from './minmodel'
import { createTaskModel, type Task, type TaskComment, type TStat, taskPlugin } from './tasks'
import { withDatabase } from './utils'
import { postgresUrl } from '@hcengineering/test-containers'

const txes = genMinModel()

createTaskModel(txes)

const contextVars: Record<string, any> = {}

describe('postgres operations', () => {
  let baseDbUri: string
  let dbUuid = crypto.randomUUID() as WorkspaceUuid
  let dbUri: string
  let clientRef: PostgresClientReference
  let hierarchy: Hierarchy
  let model: ModelDb
  let client: Client
  let operations: TxOperations
  let serverStorage: DbAdapter | undefined

  beforeAll(async () => {
    baseDbUri = await postgresUrl()
    clientRef = getDBClient(baseDbUri)
  })

  afterAll(async () => {
    clientRef.close()
    await shutdownPostgres()
  })

  beforeEach(async () => {
    try {
      dbUuid = crypto.randomUUID() as WorkspaceUuid
      dbUri = withDatabase(baseDbUri, dbUuid)
      const client = await clientRef.getClient()
      await client`CREATE DATABASE ${client(dbUuid)}`
    } catch (err) {
      console.error(err)
    }

    jest.setTimeout(30000)
    await initDb()
  })

  afterEach(async () => {
    try {
      // await client.close()
      // await (await clientRef.getClient()).query(`DROP DATABASE ${dbId}`)
    } catch (err) {
      console.log(err)
    }
    await serverStorage?.close()
  })

  async function initDb (): Promise<void> {
    // Remove all stuff from database.
    hierarchy = new Hierarchy()
    model = new ModelDb(hierarchy)
    for (const t of txes) {
      hierarchy.tx(t)
    }
    for (const t of txes) {
      await model.tx(t)
    }

    const mctx = new MeasureMetricsContext('', {})
    const txStorage = await createPostgresTxAdapter(
      mctx,
      hierarchy,
      dbUri,
      {
        uuid: dbUuid,
        url: dbUri
      },
      model
    )

    await txStorage.init?.(mctx, {})
    // Put all transactions to Tx
    for (const t of txes) {
      await txStorage.tx(mctx, t)
    }

    await txStorage.close()

    const ctx = new MeasureMetricsContext('client', {})
    const serverStorage = await createPostgresAdapter(
      ctx,
      hierarchy,
      dbUri,
      {
        uuid: dbUuid,
        url: dbUri
      },
      model
    )
    await serverStorage.init?.(ctx, contextVars)
    client = await createClient(async (handler) => {
      return wrapAdapterToClient(ctx, serverStorage, txes)
    })

    operations = new TxOperations(client, core.account.System)
  }

  it('check add', async () => {
    const times: number[] = []
    for (let i = 0; i < 50; i++) {
      const t = Date.now()
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: `my-task-${i}`,
        description: `${i * i}`,
        rate: 20 + i
      })
      times.push(Date.now() - t)
    }

    console.log('createDoc times', times)

    const r = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(r.length).toEqual(50)
  })

  it('check find by criteria', async () => {
    jest.setTimeout(20000)
    for (let i = 0; i < 50; i++) {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: `my-task-${i}`,
        description: `${i * i}`,
        rate: 20 + i,
        arr: new Array(i).fill(i)
      })
    }

    const r = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(r.length).toEqual(50)

    const first = await client.findAll<Task>(taskPlugin.class.Task, { name: 'my-task-0' })
    expect(first.length).toEqual(1)

    const second = await client.findAll<Task>(taskPlugin.class.Task, { name: { $like: '%0' } })
    expect(second.length).toEqual(5)

    const third = await client.findAll<Task>(taskPlugin.class.Task, { rate: { $in: [25, 26, 27, 28] } })
    expect(third.length).toEqual(4)

    const size = await client.findAll<Task>(taskPlugin.class.Task, { arr: { $size: 5 } })
    expect(size.length).toEqual(1)

    const sizeGt = await client.findAll<Task>(taskPlugin.class.Task, { arr: { $size: { $gt: 45 } } })
    expect(sizeGt.length).toEqual(4)

    const sizeGte = await client.findAll<Task>(taskPlugin.class.Task, { arr: { $size: { $gte: 45 } } })
    expect(sizeGte.length).toEqual(5)

    const sizeLt = await client.findAll<Task>(taskPlugin.class.Task, { arr: { $size: { $lt: 45 } } })
    expect(sizeLt.length).toEqual(45)

    const sizeLte = await client.findAll<Task>(taskPlugin.class.Task, { arr: { $size: { $lte: 45 } } })
    expect(sizeLte.length).toEqual(46)
  })

  it('check update', async () => {
    await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'my-task',
      description: 'some data ',
      rate: 20,
      arr: []
    })

    const doc = (await client.findAll<Task>(taskPlugin.class.Task, {}))[0]
    await operations.updateDoc(doc._class, doc.space, doc._id, { rate: null })
    let tasks = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(tasks.length).toEqual(1)
    expect(tasks[0].rate).toBeNull()

    await operations.updateDoc(doc._class, doc.space, doc._id, { rate: 30 })
    tasks = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(tasks.length).toEqual(1)
    expect(tasks[0].rate).toEqual(30)

    await operations.updateDoc(doc._class, doc.space, doc._id, { $inc: { rate: 1 } })
    tasks = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(tasks.length).toEqual(1)
    expect(tasks[0].rate).toEqual(31)

    await operations.updateDoc(doc._class, doc.space, doc._id, { $inc: { rate: -1 } })
    tasks = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(tasks.length).toEqual(1)
    expect(tasks[0].rate).toEqual(30)

    await operations.updateDoc(doc._class, doc.space, doc._id, { $push: { arr: 1 } })
    tasks = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(tasks.length).toEqual(1)
    expect(tasks[0].arr?.length).toEqual(1)
    expect(tasks[0].arr?.[0]).toEqual(1)

    await operations.updateDoc(doc._class, doc.space, doc._id, { $push: { arr: 3 } })
    tasks = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(tasks.length).toEqual(1)
    expect(tasks[0].arr?.length).toEqual(2)
    expect(tasks[0].arr?.[0]).toEqual(1)
    expect(tasks[0].arr?.[1]).toEqual(3)
  }, 1000000)

  it('check remove', async () => {
    for (let i = 0; i < 10; i++) {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: `my-task-${i}`,
        description: `${i * i}`,
        rate: 20 + i
      })
    }

    let r = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(r.length).toEqual(10)
    await operations.removeDoc<Task>(taskPlugin.class.Task, '' as Ref<Space>, r[0]._id)
    r = await client.findAll<Task>(taskPlugin.class.Task, {})
    expect(r.length).toEqual(9)
  })

  it('limit and sorting', async () => {
    for (let i = 0; i < 5; i++) {
      await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
        name: `my-task-${i}`,
        description: `${i * i}`,
        rate: 20 + i
      })
    }

    const without = await client.findAll(taskPlugin.class.Task, {})
    expect(without).toHaveLength(5)

    const limit = await client.findAll(taskPlugin.class.Task, {}, { limit: 1 })
    expect(limit).toHaveLength(1)

    const sortAsc = await client.findAll(taskPlugin.class.Task, {}, { sort: { name: SortingOrder.Ascending } })
    expect(sortAsc[0].name).toMatch('my-task-0')

    const sortDesc = await client.findAll(taskPlugin.class.Task, {}, { sort: { name: SortingOrder.Descending } })
    expect(sortDesc[0].name).toMatch('my-task-4')

    const sortEmpty = await client.findAll(taskPlugin.class.Task, {}, { sort: {} })
    expect(sortEmpty).toHaveLength(5)
  })

  it('check attached', async () => {
    const docId = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'my-task',
      description: 'Descr',
      rate: 20
    })

    const commentId = await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      docId,
      taskPlugin.class.Task,
      'tasks',
      {
        message: 'my-msg',
        date: new Date()
      }
    )

    await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      docId,
      taskPlugin.class.Task,
      'tasks',
      {
        message: 'my-msg2',
        date: new Date()
      }
    )

    const r2 = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      {},
      {
        lookup: {
          attachedTo: taskPlugin.class.Task
        }
      }
    )
    expect(r2.length).toEqual(2)
    expect((r2[0].$lookup?.attachedTo as Task)?._id).toEqual(docId)

    const r3 = await client.findAll<Task>(
      taskPlugin.class.Task,
      {},
      {
        lookup: {
          _id: { comment: taskPlugin.class.TaskComment }
        }
      }
    )

    expect(r3).toHaveLength(1)
    expect((r3[0].$lookup as any).comment).toHaveLength(2)

    const comment2Id = await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      commentId,
      taskPlugin.class.TaskComment,
      'comments',
      {
        message: 'my-msg3',
        date: new Date()
      }
    )

    const r4 = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      {
        _id: comment2Id
      },
      {
        lookup: { attachedTo: [taskPlugin.class.TaskComment, { attachedTo: taskPlugin.class.Task } as any] }
      }
    )
    expect((r4[0].$lookup?.attachedTo as TaskComment)?._id).toEqual(commentId)
    expect(((r4[0].$lookup?.attachedTo as any)?.$lookup.attachedTo as Task)?._id).toEqual(docId)
  })

  it('lookup projection keeps only the listed fields of the joined doc', async () => {
    const docId = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'projected',
      description: 'not selected',
      rate: 7
    })
    const first = await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      docId,
      taskPlugin.class.Task,
      'tasks',
      { message: 'first', date: new Date() }
    )
    const second = await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      docId,
      taskPlugin.class.Task,
      'tasks',
      { message: 'second', date: new Date() }
    )

    // A direct join: the base document stays whole, the joined one shrinks to `name`.
    const comments = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { attachedTo: docId },
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        projection: { '$lookup.attachedTo.name': 1 },
        sort: { '$lookup.attachedTo.modifiedOn': SortingOrder.Descending, modifiedOn: SortingOrder.Ascending }
      }
    )
    expect(comments.map((it) => it._id)).toEqual([first, second])
    expect(comments[0].message).toEqual('first')
    const task = comments[0].$lookup?.attachedTo as Task
    expect(task._id).toEqual(docId)
    expect(task.name).toEqual('projected')
    // `_class` and `space` always come: the security middleware drops a joined doc without them.
    expect(task._class).toEqual(taskPlugin.class.Task)
    expect(task.space).toBeDefined()
    expect(task.description).toBeUndefined()
    expect(task.rate).toBeUndefined()

    // A reverse join: every comment comes back with `message` only.
    const tasks = await client.findAll<Task>(
      taskPlugin.class.Task,
      { _id: docId },
      {
        lookup: { _id: { comment: taskPlugin.class.TaskComment } },
        projection: { '$lookup.comment.message': 1 }
      }
    )
    expect(tasks[0].rate).toEqual(7)
    const projected = (tasks[0].$lookup as any).comment as TaskComment[]
    expect(projected.map((it) => it.message).sort()).toEqual(['first', 'second'])
    expect(projected.every((it) => it.date === undefined)).toBe(true)
    expect(projected.every((it) => it.space !== undefined)).toBe(true)

    // A filter on a join field that the projection leaves out still applies: WHERE reads the
    // joined table, not the SELECT list.
    const filtered = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { attachedTo: docId, '$lookup.attachedTo.rate': 7 } as any,
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        projection: { '$lookup.attachedTo.name': 1 }
      }
    )
    expect(filtered).toHaveLength(2)
    expect((filtered[0].$lookup?.attachedTo as Task).rate).toBeUndefined()
    const none = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { attachedTo: docId, '$lookup.attachedTo.rate': 8 } as any,
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        projection: { '$lookup.attachedTo.name': 1 }
      }
    )
    expect(none).toHaveLength(0)

    // A nested direct lookup: each level keeps its own fields.
    const reply = await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      first,
      taskPlugin.class.TaskComment,
      'comments',
      { message: 'reply', date: new Date() }
    )
    const nested = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { _id: reply },
      {
        lookup: { attachedTo: [taskPlugin.class.TaskComment, { attachedTo: taskPlugin.class.Task } as any] },
        projection: { '$lookup.attachedTo.message': 1, '$lookup.attachedTo.$lookup.attachedTo.name': 1 }
      }
    )
    const parent = nested[0].$lookup?.attachedTo as any
    expect(parent.message).toEqual('first')
    expect(parent.date).toBeUndefined()
    expect(parent.$lookup.attachedTo.name).toEqual('projected')
    expect(parent.$lookup.attachedTo.description).toBeUndefined()
  })

  it('exclusion projection drops the listed fields of the base doc and of the joins', async () => {
    const docId = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'kept',
      description: 'dropped',
      rate: 3
    })
    await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      docId,
      taskPlugin.class.Task,
      'tasks',
      { message: 'kept too', date: new Date() }
    )

    // Base document: a jsonb key and a column excluded, every other column still there.
    const [task] = await client.findAll<Task>(
      taskPlugin.class.Task,
      { _id: docId },
      { projection: { description: 0, modifiedBy: 0 } }
    )
    expect(task.name).toEqual('kept')
    expect(task.rate).toEqual(3)
    expect(task.description).toBeUndefined()
    expect(task.modifiedBy).toBeUndefined()
    expect(typeof task.modifiedOn).toBe('number')
    expect(task.space).toBeDefined()

    // Direct join: the same, independently of the base mode.
    const [comment] = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { attachedTo: docId },
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        projection: { message: 1, '$lookup.attachedTo.description': 0, '$lookup.attachedTo.modifiedBy': 0 }
      }
    )
    expect(comment.message).toEqual('kept too')
    expect(comment.date).toBeUndefined()
    const joined = comment.$lookup?.attachedTo as Task
    expect(joined.name).toEqual('kept')
    expect(joined.rate).toEqual(3)
    expect(joined.description).toBeUndefined()
    expect(joined.modifiedBy).toBeUndefined()
    expect(typeof joined.modifiedOn).toBe('number')

    // Reverse join.
    const [withComments] = await client.findAll<Task>(
      taskPlugin.class.Task,
      { _id: docId },
      {
        lookup: { _id: { comment: taskPlugin.class.TaskComment } },
        projection: { '$lookup.comment.date': 0 }
      }
    )
    expect(withComments.description).toEqual('dropped')
    const [projected] = (withComments.$lookup as any).comment as TaskComment[]
    expect(projected.message).toEqual('kept too')
    expect(projected.date).toBeUndefined()
    expect(typeof projected.modifiedOn).toBe('number')
  })

  it('sorts by a projected lookup field and keeps the rest of the join out', async () => {
    const low = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'low',
      description: 'not selected',
      rate: 1
    })
    const high = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'high',
      description: 'not selected',
      rate: 9
    })
    const tag = `sorted-${Date.now()}`
    for (const task of [low, high]) {
      await operations.addCollection(
        taskPlugin.class.TaskComment,
        '' as Ref<Space>,
        task,
        taskPlugin.class.Task,
        'tasks',
        {
          message: tag,
          date: new Date()
        }
      )
    }

    // ORDER BY reads the joined table; the SELECT list of the join holds `name` only.
    const comments = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { message: tag },
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        projection: { '$lookup.attachedTo.name': 1 },
        sort: { '$lookup.attachedTo.rate': SortingOrder.Descending }
      }
    )
    expect(comments.map((it) => it.attachedTo)).toEqual([high, low])
    for (const comment of comments) {
      const task = comment.$lookup?.attachedTo as Task
      expect(task.name).toBeDefined()
      expect(task.rate).toBeUndefined()
      expect(task.description).toBeUndefined()
    }

    const ascending = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { message: tag },
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        projection: { '$lookup.attachedTo.name': 1 },
        sort: { '$lookup.attachedTo.rate': SortingOrder.Ascending }
      }
    )
    expect(ascending.map((it) => it.attachedTo)).toEqual([low, high])

    // A comment whose task is gone has no joined row: it sorts last in both directions.
    const orphan = await operations.addCollection(
      taskPlugin.class.TaskComment,
      '' as Ref<Space>,
      generateId(),
      taskPlugin.class.Task,
      'tasks',
      { message: tag, date: new Date() }
    )
    const withOrphan = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { message: tag },
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        sort: { '$lookup.attachedTo.rate': SortingOrder.Descending }
      }
    )
    expect(withOrphan.map((it) => it._id)).toEqual([...comments.map((it) => it._id), orphan])
    const withOrphanAsc = await client.findAll<TaskComment>(
      taskPlugin.class.TaskComment,
      { message: tag },
      {
        lookup: { attachedTo: taskPlugin.class.Task },
        sort: { '$lookup.attachedTo.rate': SortingOrder.Ascending }
      }
    )
    expect(withOrphanAsc.map((it) => it._id)).toEqual([orphan, ...ascending.map((it) => it._id)])
  })

  it('nested lookup on model docs does not mutate ModelDb instances', async () => {
    // Reproduces the bug: parseLookup mutates shared ModelDb objects on nested lookups, so the
    // model doc keeps $lookup for good, and later findAll crashes REST clients (no lookupMap).
    await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'task-with-stat-a',
      description: '',
      rate: 1,
      stat: taskPlugin.ids.StatA
    })
    await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'task-with-stat-b',
      description: '',
      rate: 2,
      stat: taskPlugin.ids.StatB
    })

    const tasks = await client.findAll<Task>(
      taskPlugin.class.Task,
      {},
      {
        lookup: { stat: [taskPlugin.class.TStat, { category: taskPlugin.class.TStatCat }] }
      }
    )
    expect(tasks).toHaveLength(2)
    const stat = tasks[0].$lookup?.stat as any
    expect(stat).toBeDefined()
    expect(stat.$lookup?.category).toBeDefined()

    // The shared in-memory TStat doc must NOT be polluted with $lookup.
    const pristine = (await client.findAll<TStat>(taskPlugin.class.TStat, {})) as Array<TStat & { $lookup?: any }>
    for (const s of pristine) {
      expect(s.$lookup).toBeUndefined()
    }

    // And a follow-up findAll without lookup options must not return $lookup.
    const tasksNoLookup = (await client.findAll<Task>(taskPlugin.class.Task, {})) as Array<Task & { $lookup?: any }>
    for (const t of tasksNoLookup) {
      expect(t.$lookup).toBeUndefined()
    }
  })

  it('check associations', async () => {
    const association = await operations.findOne(core.class.Association, {})
    if (association == null) {
      throw new Error('Association not found')
    }

    const firstTask = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'my-task',
      description: 'Descr',
      rate: 20
    })

    const secondTask = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'my-task2',
      description: 'Descr',
      rate: 20
    })

    await operations.createDoc(core.class.Relation, '' as Ref<Space>, {
      docA: firstTask,
      docB: secondTask,
      association: association._id
    })

    const r = await client.findAll(
      taskPlugin.class.Task,
      { _id: firstTask },
      {
        associations: [[association._id, 1]]
      }
    )
    expect(r.length).toEqual(1)
    expect((r[0].$associations?.[association._id + '_b'][0] as unknown as Task)?._id).toEqual(secondTask)
  })

  it('check deep associations', async () => {
    const association = await operations.findOne(core.class.Association, {})
    if (association == null) {
      throw new Error('Association not found')
    }

    const firstTask = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'my-task',
      description: 'Descr',
      rate: 20
    })

    const secondTask = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'my-task2',
      description: 'Descr',
      rate: 20
    })

    const thirdTask = await operations.createDoc(taskPlugin.class.Task, '' as Ref<Space>, {
      name: 'my-task2',
      description: 'Descr',
      rate: 20
    })

    await operations.createDoc(core.class.Relation, '' as Ref<Space>, {
      docA: firstTask,
      docB: secondTask,
      association: association._id
    })

    await operations.createDoc(core.class.Relation, '' as Ref<Space>, {
      docA: secondTask,
      docB: thirdTask,
      association: association._id
    })

    const r = await client.findAll(
      taskPlugin.class.Task,
      { _id: firstTask },
      {
        associations: [[association._id, 1, [[association._id, 1]]]]
      }
    )
    expect(r.length).toEqual(1)
    expect((r[0].$associations?.[`${association._id}_b`][0] as unknown as Task)?._id).toEqual(secondTask)
    expect(
      (r[0].$associations?.[`${association._id}_b`][0]?.$associations?.[`${association._id}_b`][0] as unknown as Task)
        ?._id
    ).toEqual(thirdTask)
  })
})
