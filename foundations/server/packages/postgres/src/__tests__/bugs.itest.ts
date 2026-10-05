/* eslint-disable import/first */
//
// Copyright © 2025 Hardcore Engineering Inc.
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

// Query translation bugs checked against a real Postgres (testcontainers).

jest.mock('../version', () => ({
  waitForSchemaVersion: jest.fn().mockResolvedValue(undefined),
  EXPECTED_SCHEMA_VERSION: 10
}))

import core, {
  type AccountUuid,
  type Class,
  ClassifierKind,
  type Client,
  createClient,
  type Doc,
  type Domain,
  DOMAIN_SPACE,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  type Ref,
  type Space,
  TxFactory,
  TxOperations,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type IntlString } from '@hcengineering/platform'
import { type DbAdapter, wrapAdapterToClient } from '@hcengineering/server-core'
import {
  createPostgresAdapter,
  createPostgresTxAdapter,
  getDBClient,
  shutdownPostgres,
  type PostgresClientReference
} from '..'
import { createAttribute, createClass, genMinModel } from './minmodel'
import { createTaskModel, type Task, taskPlugin } from './tasks'
import { withDatabase } from './utils'
import { postgresUrl } from '@hcengineering/test-containers'

interface Tagged extends Doc {
  tags: string[]
  links?: Array<{ _id: string }>
  info?: { note: string }
}

const taggedClass = 'bugs:class:Tagged' as Ref<Class<Tagged>>
const spaceLikeClass = 'bugs:class:SpaceLike' as Ref<Class<Space>>

const txes = genMinModel()
createTaskModel(txes)
txes.push(
  createClass(taggedClass, {
    kind: ClassifierKind.CLASS,
    label: 'Tagged' as IntlString,
    domain: 'test-task' as Domain
  }),
  createAttribute({
    attributeOf: taggedClass,
    name: 'tags',
    type: { _class: core.class.ArrOf, label: 'tags' as IntlString, type: core.class.TypeString } as any
  }),
  createAttribute({
    attributeOf: taggedClass,
    name: 'links',
    type: { _class: core.class.ArrOf, label: 'links' as IntlString, type: core.class.TypeString } as any
  }),
  createClass(spaceLikeClass, {
    kind: ClassifierKind.CLASS,
    label: 'SpaceLike' as IntlString,
    extends: core.class.Space,
    domain: DOMAIN_SPACE
  }),
  createAttribute({
    attributeOf: spaceLikeClass,
    name: 'members',
    type: { _class: core.class.ArrOf, label: 'members' as IntlString, type: core.class.TypeString } as any
  })
)

jest.setTimeout(120000)

describe('postgres query bugs (real database)', () => {
  let baseDbUri: string
  let clientRef: PostgresClientReference
  let client: Client
  let operations: TxOperations
  let serverStorage: DbAdapter | undefined
  let dbUri: string
  let dbUuid: WorkspaceUuid
  let hierarchy: Hierarchy
  let model: ModelDb
  const mctx = new MeasureMetricsContext('bugs', {})

  beforeAll(async () => {
    baseDbUri = await postgresUrl()
    expect(baseDbUri).not.toMatch(/:(5432|5433)\b/)
    clientRef = getDBClient(baseDbUri)
  })

  afterAll(async () => {
    clientRef.close()
    await shutdownPostgres()
  })

  beforeEach(async () => {
    dbUuid = crypto.randomUUID() as WorkspaceUuid
    dbUri = withDatabase(baseDbUri, dbUuid)
    const pg = await clientRef.getClient()
    await pg`CREATE DATABASE ${pg(dbUuid)}`

    hierarchy = new Hierarchy()
    model = new ModelDb(hierarchy)
    for (const t of txes) hierarchy.tx(t)
    for (const t of txes) await model.tx(t)

    const mctx = new MeasureMetricsContext('', {})
    const wsInfo = { uuid: dbUuid, url: dbUri }
    const txStorage = await createPostgresTxAdapter(mctx, hierarchy, dbUri, wsInfo, model)
    await txStorage.init?.(mctx, {})
    for (const t of txes) await txStorage.tx(mctx, t)
    await txStorage.close()

    const ctx = new MeasureMetricsContext('client', {})
    serverStorage = await createPostgresAdapter(ctx, hierarchy, dbUri, wsInfo, model)
    await serverStorage.init?.(ctx, {})
    client = await createClient(async () => wrapAdapterToClient(ctx, serverStorage as DbAdapter, txes))
    operations = new TxOperations(client, core.account.System)
  })

  afterEach(async () => {
    await serverStorage?.close()
  })

  const sp = '' as Ref<Space>

  describe('#35 quote in jsonb literal', () => {
    it('$all by jsonb path with a quote in the value', async () => {
      await operations.createDoc(taggedClass, sp, { tags: ["it's", 'b'] })
      await operations.createDoc(taggedClass, sp, { tags: ['a'] })
      const r = await client.findAll<Tagged>(taggedClass, { tags: { $all: ["it's"] } })
      expect(r.length).toEqual(1)
    })

    it('SQL text in $all value stays a value', async () => {
      await operations.createDoc(taggedClass, sp, { tags: ['a'] })
      const r = await client.findAll<Tagged>(taggedClass, { tags: { $all: ["x']'::jsonb OR true OR '[]"] } })
      expect(r.length).toEqual(0)
    })

    it('object condition without operators with a quote in the value', async () => {
      await operations.createDoc(taggedClass, sp, { tags: [], info: { note: "it's" } })
      await operations.createDoc(taggedClass, sp, { tags: [], info: { note: 'other' } })
      const r = await client.findAll<Tagged>(taggedClass, { info: { note: "it's" } } as any)
      expect(r.length).toEqual(1)
    })
  })

  describe('#36 scalar against a number array', () => {
    it('{arr: 2} finds docs whose number array contains 2', async () => {
      await operations.createDoc(taskPlugin.class.Task, sp, { name: 'a', description: '', arr: [1, 2, 3] })
      await operations.createDoc(taskPlugin.class.Task, sp, { name: 'b', description: '', arr: [4] })
      const r = await client.findAll<Task>(taskPlugin.class.Task, { arr: 2 } as any)
      expect(r.map((it) => it.name)).toEqual(['a'])
    })
  })

  describe('#38 $nin on an array column', () => {
    it('{members: {$nin: [acc]}} does not fail and excludes spaces with acc', async () => {
      const a = 'a1' as AccountUuid
      const b = 'b1' as AccountUuid
      await operations.createDoc(spaceLikeClass, core.space.Space, {
        name: 'with-a',
        description: '',
        private: false,
        members: [a, b],
        archived: false
      })
      await operations.createDoc(spaceLikeClass, core.space.Space, {
        name: 'only-b',
        description: '',
        private: false,
        members: [b],
        archived: false
      })
      const r = await client.findAll<Space>(spaceLikeClass, { members: { $nin: [a] } })
      expect(r.map((it) => it.name)).toEqual(['only-b'])
    })
  })

  describe('#38 $nin on a jsonb array', () => {
    it('{tags: {$nin: [x]}} excludes docs with x', async () => {
      await operations.createDoc(taggedClass, sp, { tags: ['a', 'b'] })
      await operations.createDoc(taggedClass, sp, { tags: ['c'] })
      const r = await client.findAll<Tagged>(taggedClass, { tags: { $nin: ['a'] } })
      expect(r.map((it) => it.tags)).toEqual([['c']])
    })
  })

  describe('#32 process() merges updates', () => {
    it('does not mutate the first transaction of the caller', async () => {
      const id = await operations.createDoc(taskPlugin.class.Task, sp, { name: 'a', description: '', rate: 1 })
      const factory = new TxFactory(core.account.System)
      const tx1 = factory.createTxUpdateDoc(taskPlugin.class.Task, sp, id, { name: 'b' })
      const tx2 = factory.createTxUpdateDoc(taskPlugin.class.Task, sp, id, { description: 'd' })
      await (serverStorage as DbAdapter).tx(mctx, tx1, tx2)
      expect(tx1.operations).toEqual({ name: 'b' })
      const doc = await client.findOne<Task>(taskPlugin.class.Task, { _id: id })
      expect([doc?.name, doc?.description]).toEqual(['b', 'd'])
    })
  })

  describe('#30 dotted path through an array of objects', () => {
    it("{'links._id': id} finds docs whose links array holds the object", async () => {
      await operations.createDoc(taggedClass, sp, { tags: [], links: [{ _id: 'x' }, { _id: 'y' }] })
      await operations.createDoc(taggedClass, sp, { tags: [], links: [{ _id: 'z' }] })
      const r = await client.findAll<Tagged>(taggedClass, { 'links._id': 'x' } as any)
      expect(r.length).toEqual(1)
    })
  })

  describe('#47 update with an undefined value', () => {
    it('removes the key from the stored document', async () => {
      const id = await operations.createDoc(taggedClass, sp, { tags: ['a'], info: { note: 'n' } })
      await operations.updateDoc(taggedClass, sp, id, { tags: undefined } as any)
      const doc = await client.findOne<Tagged>(taggedClass, { _id: id })
      expect(doc?.tags).toBeUndefined()
      expect(doc?.info).toEqual({ note: 'n' })
    })
  })

  describe('#23 findOne by _id right after createDoc', () => {
    it('returns the document with its _id', async () => {
      const id = await operations.createDoc(taskPlugin.class.Task, sp, { name: 'a', description: '', rate: 1 })
      const byId = await client.findOne<Task>(taskPlugin.class.Task, { _id: id })
      const byName = await client.findOne<Task>(taskPlugin.class.Task, { name: 'a' })
      expect(byId?._id).toEqual(id)
      expect(byName?._id).toEqual(id)
      const all = await client.findAll<Task>(taskPlugin.class.Task, { _id: id })
      expect(all.map((it) => it._id)).toEqual([id])
      await operations.updateDoc(taskPlugin.class.Task, sp, id, { name: 'b' })
      expect((await client.findOne<Task>(taskPlugin.class.Task, { _id: id }))?._id).toEqual(id)
    })
  })

  describe('#61 operations.doneOn on tx', () => {
    it("{objectId, 'operations.doneOn': {$exists: true}} finds only updates that set doneOn", async () => {
      const txStorage = await createPostgresTxAdapter(mctx, hierarchy, dbUri, { uuid: dbUuid, url: dbUri }, model)
      try {
        const factory = new TxFactory(core.account.System)
        const todo = 'todo1' as Ref<Task>
        const done = factory.createTxUpdateDoc(taskPlugin.class.Task, sp, todo, { doneOn: 1 } as any)
        const title = factory.createTxUpdateDoc(taskPlugin.class.Task, sp, todo, { name: 'x' })
        const other = factory.createTxUpdateDoc(taskPlugin.class.Task, sp, 'todo2' as Ref<Task>, { doneOn: 2 } as any)
        await txStorage.tx(mctx, done, title, other)
        const r = await txStorage.findAll(mctx, core.class.TxUpdateDoc, {
          objectId: todo,
          'operations.doneOn': { $exists: true }
        } as any)
        expect(r.map((it) => it._id)).toEqual([done._id])
        const none = await txStorage.findAll(mctx, core.class.TxUpdateDoc, {
          objectId: 'todo3' as Ref<Doc>,
          'operations.doneOn': { $exists: true }
        } as any)
        expect(none.length).toEqual(0)
      } finally {
        await txStorage.close()
      }
    })
  })

  describe('#33 failed bulk update', () => {
    it('rejects tx and leaves the document untouched', async () => {
      const id = await operations.createDoc(taskPlugin.class.Task, sp, { name: 'a', description: '', rate: 1 })
      const bad = new TxFactory(core.account.System).createTxUpdateDoc(taskPlugin.class.Task, sp, id, { name: 'b' })
      bad.modifiedOn = 'not-a-number' as any
      await expect(serverStorage?.tx(mctx, bad)).rejects.toThrow()
      expect((await client.findOne<Task>(taskPlugin.class.Task, { _id: id }))?.name).toEqual('a')
    })
  })
})
