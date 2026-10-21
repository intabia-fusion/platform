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

// The visitor of a public link in the real pipeline on a real Postgres: the middleware and the
// adapter together, which neither package shows alone.

import contact from '@hcengineering/contact'
import core, {
  type AccountUuid,
  AccountRole,
  type Class,
  ClassifierKind,
  type Doc,
  type Domain,
  type FindOptions,
  type FindResult,
  type MeasureContext,
  MeasureMetricsContext,
  type PersonId,
  type Ref,
  type SessionData,
  type Space,
  TxFactory,
  TxOperations,
  type WorkspaceIds,
  type WorkspaceUuid
} from '@hcengineering/core'
import buildModel, { migrateOperations } from '@hcengineering/model-all'
import { type IntlString, plugin, type Plugin } from '@hcengineering/platform'
import {
  createPostgreeDestroyAdapter,
  createPostgresAdapter,
  createPostgresTxAdapter,
  getDBClient,
  setDBExtraOptions,
  shutdownPostgres
} from '@hcengineering/postgres'
import { createDummyStorageAdapter, type Pipeline, SessionDataImpl, wrapPipeline } from '@hcengineering/server-core'
import { postgresUrl, stopContainers } from '@hcengineering/test-containers'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { promisify } from 'util'
import {
  getServerPipeline,
  registerAdapterFactory,
  registerDestroyFactory,
  registerStringLoaders,
  registerTxAdapterFactory
} from '../index'

jest.setTimeout(300000)

const ids = plugin('guestTest' as Plugin, {
  class: {
    Task: '' as Ref<Class<Doc>>,
    Note: '' as Ref<Class<Doc>>,
    Sync: '' as Ref<Class<Doc>>
  }
})
const publicLink = 'guest:class:PublicLink' as Ref<Class<Doc>>
const guestUuid = 'b6996120-416f-49cd-841e-e4a5d2e49c9b' as AccountUuid

// Both Ref<Person> fields are free text on write: the second holds the id of a private task.
function testModel (): ReturnType<ReturnType<typeof buildModel>['getTxes']> {
  const factory = new TxFactory(core.account.System)
  const txes = buildModel().getTxes()
  const create = (_class: Ref<Class<Doc>>, extend: Ref<Class<Doc>>, domain: string): void => {
    const attrs = {
      kind: ClassifierKind.CLASS,
      label: _class as unknown as IntlString,
      extends: extend,
      domain: domain as Domain
    }
    txes.push(factory.createTxCreateDoc(core.class.Class, core.space.Model, attrs, _class))
  }
  create(ids.class.Task, core.class.Doc, 'guest-test')
  create(ids.class.Note, core.class.AttachedDoc, 'guest-test')
  create(ids.class.Sync, core.class.Doc, 'guest-test-sync')
  for (const name of ['assignee', 'reviewer']) {
    const type = { _class: core.class.RefTo, label: 'Ref' as IntlString, to: contact.class.Person }
    const attr = { attributeOf: ids.class.Task, name, label: name as unknown as IntlString, type }
    txes.push(factory.createTxCreateDoc(core.class.Attribute, core.space.Model, attr as any))
  }
  return txes
}

describe('DocGuest in the real pipeline', () => {
  const ctx = new MeasureMetricsContext('doc-guest', {})
  const wsIds: WorkspaceIds = { uuid: randomUUID() as WorkspaceUuid, url: 'doc-guest' }
  const [open, closed] = ['open-hall', 'closed-hall'] as Array<Ref<Space>>
  let pipeline: Pipeline

  function system (): TxOperations {
    return new TxOperations(wrapPipeline(new MeasureMetricsContext('system', {}), pipeline, wsIds), core.account.System)
  }

  // A guest request as ClientSession makes it: fresh session data, the link from the token.
  async function read<T extends Doc> (
    linkId: string,
    _class: Ref<Class<T>>,
    query: object = {},
    options?: FindOptions<T>
  ): Promise<FindResult<T>> {
    const account = {
      uuid: guestUuid,
      role: AccountRole.DocGuest,
      primarySocialId: '' as PersonId,
      socialIds: [],
      fullSocialIds: []
    }
    const data = new SessionDataImpl(
      account,
      'guest',
      false,
      undefined,
      wsIds,
      false,
      undefined,
      undefined,
      pipeline.context.modelDb,
      new Map(),
      'transactor'
    )
    data.guestLink = { _id: linkId as Ref<Doc> }
    const guestCtx = new MeasureMetricsContext('guest', {}) as MeasureContext<SessionData>
    guestCtx.contextData = data
    return await pipeline.findAll(guestCtx, _class, query, options)
  }

  const idsOf = (docs: Doc[]): string[] => docs.map((it) => it._id).sort()

  beforeAll(async () => {
    const serverUrl = await postgresUrl()
    const dbName = `guest_${randomUUID().replace(/-/g, '')}`
    const admin = getDBClient(serverUrl)
    try {
      const client = await admin.getClient()
      await client`CREATE DATABASE ${client(dbName)}`
    } finally {
      admin.close()
    }
    const url = new URL(serverUrl)
    url.pathname = '/' + dbName
    const dbUrl = url.toString()
    await promisify(execFile)(process.execPath, [require.resolve('@hcengineering/pod-db-migrator')], {
      env: { ...process.env, DB_URL: dbUrl }
    })

    setDBExtraOptions({ prepare: true })
    registerTxAdapterFactory('postgresql', createPostgresTxAdapter, true)
    registerAdapterFactory('postgresql', createPostgresAdapter, true)
    registerDestroyFactory('postgresql', createPostgreeDestroyAdapter, true)
    registerStringLoaders()

    pipeline = await getServerPipeline(ctx, testModel(), dbUrl, wsIds, createDummyStorageAdapter(), {
      disableTriggers: true
    })

    const sys = system()
    const hall = { description: '', archived: false, members: [] }
    await sys.createDoc(core.class.Space, core.space.Space, { name: 'open', private: false, ...hall }, open)
    await sys.createDoc(core.class.Space, core.space.Space, { name: 'closed', private: true, ...hall }, closed)
    for (const person of ['p', 'q']) {
      await sys.createDoc(contact.class.Person, contact.space.Contacts, { name: person } as any, person as Ref<Doc>)
    }
    await sys.createDoc(ids.class.Task, open, { name: 'shared', assignee: 'p', reviewer: 'x' } as any, 'd' as Ref<Doc>)
    await sys.createDoc(ids.class.Task, closed, { name: 'private' } as any, 'x' as Ref<Doc>)
    // GitHub keeps a DocSyncInfo under the id of its task, in a domain of its own.
    await sys.createDoc(ids.class.Sync, closed, { name: 'raw answer of github' } as any, 'd' as Ref<Doc>)
    const note = async (space: Ref<Space>, task: string, id: string): Promise<void> => {
      await sys.addCollection(
        ids.class.Note,
        space,
        task as Ref<Doc>,
        ids.class.Task,
        'notes',
        { name: id } as any,
        id as any
      )
    }
    await note(open, 'd', 'c')
    await note(closed, 'x', 'c2')

    // l1 and l2 are made like createPublicLink does, with a token each. l0 predates
    // attachedToClass and sits in core.space.Workspace.
    const fragment = encodeURIComponent(['view:component:EditDoc', 'd', ids.class.Task, 'content'].join('|'))
    const body = { attachedTo: 'd', url: 'token', location: { path: [], fragment }, restrictions: {}, revokable: true }
    await sys.createDoc(publicLink, open, { ...body, attachedToClass: ids.class.Task } as any, 'l1' as Ref<Doc>)
    await sys.createDoc(publicLink, open, { ...body, attachedToClass: ids.class.Task } as any, 'l2' as Ref<Doc>)
    await sys.createDoc(publicLink, core.space.Workspace, body as any, 'l0' as Ref<Doc>)
    await sys.createDoc(core.class.UserStatus, core.space.Space, { user: guestUuid, online: true } as any)
  })

  afterAll(async () => {
    try {
      await pipeline?.close()
      await shutdownPostgres()
    } finally {
      await stopContainers()
    }
  })

  it('reads the document, what is attached to it, its space and the persons its fields name', async () => {
    expect(idsOf(await read('l1', ids.class.Task))).toEqual(['d'])
    expect(idsOf(await read('l1', ids.class.Note))).toEqual(['c'])
    expect(idsOf(await read('l1', core.class.Space))).toEqual([open])
    expect(idsOf(await read('l1', contact.class.Person))).toEqual(['p'])
  })

  it('does not read a row of another class that has the id of the document', async () => {
    expect(await read('l1', ids.class.Sync)).toHaveLength(0)
    expect(await read('l1', ids.class.Sync, { _id: 'd' })).toHaveLength(0)
    // LookupMiddleware drops the fields that the query names, _id among them.
    expect((await read('l1', ids.class.Task, { _id: 'd' })).map((it: any) => it.name)).toEqual(['shared'])
  })

  it('does not read a private document that a Ref<Person> field names', async () => {
    const [shared] = await read('l1', ids.class.Task)
    expect((shared as any).reviewer).toBe('x')
    expect(await read('l1', ids.class.Task, { _id: 'x' })).toHaveLength(0)
    expect(await read('l1', ids.class.Note, { attachedTo: 'x' })).toHaveLength(0)
  })

  it('reads only its own link, in a list and in a reverse lookup', async () => {
    expect(idsOf(await read('l1', publicLink))).toEqual(['l1'])
    const found = await read('l1', ids.class.Task, { _id: 'd' }, { lookup: { _id: { links: publicLink } } } as any)
    // LookupMiddleware leaves the joined documents in lookupMap and numbers in $lookup.
    const links = (found[0].$lookup as any).links.map((it: number) => found.lookupMap?.[it])
    expect(idsOf(links)).toEqual(['l1'])
  })

  it('answers a $lookup key in the query with nothing', async () => {
    // The parent is named 'shared': a joined database would answer to its first letter.
    const query = { attachedTo: 'd', '$lookup.attachedTo.name': { $like: 's%' } }
    const options = { lookup: { attachedTo: ids.class.Task } } as any
    expect(idsOf(await read('l1', ids.class.Note, { attachedTo: 'd' }, options))).toEqual(['c'])
    expect(await read('l1', ids.class.Note, query, options)).toHaveLength(0)
  })

  it('reads nothing from the transient domain, which only the system sees', async () => {
    expect(await system().findAll(core.class.UserStatus, {})).toHaveLength(1)
    expect(await read('l1', core.class.UserStatus)).toHaveLength(0)
    expect(await read('gone', core.class.UserStatus)).toHaveLength(0)
  })

  it('reads nothing with a link made before attachedToClass was recorded', async () => {
    expect(await read('l0', ids.class.Task)).toHaveLength(0)
    expect(await read('l0', publicLink)).toHaveLength(0)
  })

  it('reads nothing once the document has moved out of the space of its link', async () => {
    const sys = system()
    await sys.updateDoc(ids.class.Task, open, 'd' as Ref<Doc>, { space: closed } as any)
    try {
      expect(await read('l1', ids.class.Task)).toHaveLength(0)
      expect(await read('l1', publicLink)).toHaveLength(0)
    } finally {
      await sys.updateDoc(ids.class.Task, closed, 'd' as Ref<Doc>, { space: open } as any)
    }
    expect(idsOf(await read('l1', ids.class.Task))).toEqual(['d'])
  })

  it('migration files the old link into the space of its document and drops one without a document', async () => {
    const lowLevel = pipeline.context.lowLevelStorage
    if (lowLevel === undefined) throw new Error('no low level storage')
    const sys = system()
    const body = { attachedTo: 'nothing', url: 'token', location: { path: [] }, restrictions: {}, revokable: true }
    await sys.createDoc(publicLink, core.space.Workspace, body as any, 'l3' as Ref<Doc>)
    const operation = migrateOperations.find(([name]) => name === 'guest')?.[1]
    const states = new Map<string, Set<string>>()
    const client: any = {
      hierarchy: pipeline.context.hierarchy,
      migrateState: states,
      logger: { log: () => {}, error: console.error },
      find: async (domain: any, query: any, options: any) => await lowLevel.rawFindAll(domain, query, options),
      bulk: async (domain: any, ops: Array<{ filter: any, update: any }>) => {
        for (const { filter, update } of ops) await lowLevel.rawUpdate(domain, filter, update)
      },
      deleteMany: async (domain: any, query: any) => {
        await lowLevel.rawDeleteMany(domain, query)
      },
      create: async () => {}
    }

    await operation?.migrate(client, 'upgrade')

    const links = await sys.findAll(publicLink, {})
    expect(idsOf(links)).toEqual(['l1', 'l2', 'l0'].sort())
    const old = links.find((it) => it._id === ('l0' as Ref<Doc>)) as any
    // The id is also the id of its sync row: the address of the link says which one.
    expect(old.space).toBe(open)
    expect(old.attachedToClass).toBe(ids.class.Task)
    // Filed into the space of its document, the link now works for its guest.
    expect(idsOf(await read('l0', ids.class.Task))).toEqual(['d'])
    expect(idsOf(await read('l0', publicLink))).toEqual(['l0'])
  })
})
