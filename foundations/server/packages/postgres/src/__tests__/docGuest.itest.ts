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

// The visitor of a public link (DocGuest) reads through the postgres adapter only what
// addDocGuestSecurity lets by: its SQL, run against a real database.

jest.mock('../version', () => ({
  waitForSchemaVersion: jest.fn().mockResolvedValue(undefined),
  EXPECTED_SCHEMA_VERSION: 10
}))

import core, {
  AccountRole,
  type AccountUuid,
  type Class,
  ClassifierKind,
  type Doc,
  type Domain,
  DOMAIN_MODEL_TX,
  DOMAIN_SPACE,
  DOMAIN_TX,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  type PersonId,
  type Ref,
  type SessionData,
  type Space,
  TxFactory,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type IntlString, plugin, type Plugin } from '@hcengineering/platform'
import { type DbAdapter } from '@hcengineering/server-core'
import { postgresUrl, stopContainers } from '@hcengineering/test-containers'
import { createPostgresAdapter, createTables, getDBClient, shutdownPostgres } from '..'
import { createClass, genMinModel } from './minmodel'
import { withDatabase } from './utils'

const ids = plugin('guestTest' as Plugin, {
  class: {
    Hall: '' as Ref<Class<Space>>,
    Task: '' as Ref<Class<Doc>>,
    Note: '' as Ref<Class<Doc>>,
    Person: '' as Ref<Class<Doc>>,
    Link: '' as Ref<Class<Doc>>,
    Sync: '' as Ref<Class<Doc>>
  }
})

// Same table name as GUEST_DOMAIN of models/guest, which holds PublicLink alone.
const classes: Array<[Ref<Class<Doc>>, Ref<Class<Doc>>, Domain]> = [
  [ids.class.Hall, core.class.Space, DOMAIN_SPACE],
  [ids.class.Task, core.class.Doc, 'gtask' as Domain],
  [ids.class.Note, core.class.AttachedDoc, 'gtask' as Domain],
  [ids.class.Person, core.class.Doc, 'gcontact' as Domain],
  [ids.class.Link, core.class.Doc, 'guest' as Domain],
  [ids.class.Sync, core.class.Doc, 'gsync' as Domain]
]

const [open, closed] = ['open-hall', 'closed-hall'] as Array<Ref<Space>>

describe('DocGuest on a real postgres', () => {
  const factory = new TxFactory(core.account.System)
  let admin: ReturnType<typeof getDBClient>
  let dbName: WorkspaceUuid
  let adapter: DbAdapter

  function guest (guestLink: SessionData['guestLink']): MeasureMetricsContext {
    const ctx = new MeasureMetricsContext('guest', {})
    ctx.contextData = {
      account: {
        uuid: 'guest' as AccountUuid,
        role: AccountRole.DocGuest,
        primarySocialId: '' as PersonId,
        socialIds: [],
        fullSocialIds: []
      },
      isTriggerCtx: false,
      guestLink
    } as unknown as SessionData
    return ctx
  }

  async function names (_class: Ref<Class<Doc>>, link: SessionData['guestLink'], query: any = {}): Promise<string[]> {
    const found = await adapter.findAll<any>(guest(link), _class, query)
    return found.map((it) => it.name ?? it._id).sort((a, b) => a.localeCompare(b))
  }

  async function create (_class: Ref<Class<Doc>>, space: Ref<Space>, id: string, attrs: object): Promise<void> {
    await adapter.tx(
      new MeasureMetricsContext('data', {}),
      factory.createTxCreateDoc(_class, space, attrs as any, id as Ref<Doc>)
    )
  }

  beforeAll(async () => {
    const baseUri = await postgresUrl()
    admin = getDBClient(baseUri)
    dbName = crypto.randomUUID() as WorkspaceUuid
    const client = await admin.getClient()
    await client`CREATE DATABASE ${client(dbName)}`

    const txes = genMinModel()
    for (const [_class, extend, domain] of classes) {
      txes.push(
        createClass(_class, {
          kind: ClassifierKind.CLASS,
          label: _class as unknown as IntlString,
          extends: extend,
          domain
        })
      )
    }
    const hierarchy = new Hierarchy()
    for (const tx of txes) hierarchy.tx(tx)
    const model = new ModelDb(hierarchy)
    for (const tx of txes) await model.tx(tx)

    const ctx = new MeasureMetricsContext('guest-itest', {})
    const uri = withDatabase(baseUri, dbName)
    adapter = await createPostgresAdapter(ctx, hierarchy, uri, { uuid: dbName, url: uri }, model)
    await adapter.init?.(ctx, {})
    const txClient = getDBClient(uri)
    await createTables(ctx, await txClient.getClient(), uri, [DOMAIN_TX, DOMAIN_MODEL_TX])
    txClient.close()

    const hall = { description: '', archived: false, members: [] }
    await create(ids.class.Hall, core.space.Space, open, { name: 'open', private: false, ...hall })
    await create(ids.class.Hall, core.space.Space, closed, { name: 'closed', private: true, ...hall })
    await create(ids.class.Task, open, 'd', { name: 'shared' })
    await create(ids.class.Task, closed, 'x', { name: 'private' })
    // GitHub keeps a DocSyncInfo under the id of its task, in a domain of its own.
    await create(ids.class.Sync, open, 'd', { name: 'sync of d' })
    const note = (attachedTo: string, name: string): object => ({
      attachedTo,
      attachedToClass: ids.class.Task,
      collection: 'notes',
      name
    })
    await create(ids.class.Note, open, 'c', note('d', 'comment'))
    await create(ids.class.Note, closed, 'c2', note('x', 'secret comment'))
    // Txes of a comment on the shared document carry the document in attachedTo.
    const commentTx = {
      ...factory.createTxCreateDoc(ids.class.Note, open, { name: 'deleted comment' } as any, 'c3' as any),
      attachedTo: 'd'
    }
    await adapter.upload(new MeasureMetricsContext('data', {}), DOMAIN_TX, [commentTx as unknown as Doc])
    await adapter.upload(new MeasureMetricsContext('data', {}), DOMAIN_MODEL_TX, [
      { ...commentTx, _id: 'mtx' } as unknown as Doc
    ])
    await create(ids.class.Person, core.space.Space, 'p', { name: 'named' })
    await create(ids.class.Person, core.space.Space, 'q', { name: 'other' })
    // Each link to the document carries its own token in url.
    await create(ids.class.Link, open, 'l1', { attachedTo: 'd', name: 'own link', url: 'token-1' })
    await create(ids.class.Link, open, 'l2', { attachedTo: 'd', name: 'second link', url: 'token-2' })
  })

  afterAll(async () => {
    try {
      await adapter?.close()
      const client = await admin.getClient()
      await client`DROP DATABASE IF EXISTS ${client(dbName)}`
      admin.close()
      await shutdownPostgres()
    } finally {
      await stopContainers()
    }
  })

  // The session scope the middleware builds: the document, space and persons, per domain.
  const scope = {
    _id: 'l1' as Ref<Doc>,
    attachedTo: 'd' as Ref<Doc>,
    ids: { gtask: ['d'], space: [open], gcontact: ['p'] } as unknown as Record<string, Array<Ref<Doc>>>
  }

  it('does not read a document of another space, however it is asked for', async () => {
    expect(await names(ids.class.Task, scope, { _id: 'x' })).toEqual([])
    expect(await names(ids.class.Task, scope, { space: closed })).toEqual([])
    expect(await names(ids.class.Note, scope, { attachedTo: 'x' })).toEqual([])
    expect(await names(ids.class.Hall, scope, { _id: closed })).toEqual([])
    expect(await names(ids.class.Person, scope, { _id: 'q' })).toEqual([])
  })

  it('counts only the rows it reads', async () => {
    const found = await adapter.findAll<any>(guest(scope), ids.class.Task, {}, { total: true })
    expect(found.total).toBe(1)
  })

  it('reads nothing but the link row once the link names no document, and nothing without a link', async () => {
    const revoked = { _id: 'l1' as Ref<Doc> }
    expect(await names(ids.class.Task, revoked)).toEqual([])
    expect(await names(ids.class.Link, revoked)).toEqual(['own link'])
    expect(await names(ids.class.Link, undefined)).toEqual([])
    expect(await names(ids.class.Task, undefined)).toEqual([])
  })

  it('reads only its own link in the link domain', async () => {
    expect(await names(ids.class.Link, scope)).toEqual(['own link'])
    expect(await names(ids.class.Link, scope, { attachedTo: 'd' })).toEqual(['own link'])
    expect(await names(ids.class.Link, scope, { _id: 'l2' })).toEqual([])
  })

  it('does not read another link whose id the scope lists', async () => {
    const listed = { ...scope, ids: { ...scope.ids, guest: ['l2' as Ref<Doc>] } }
    expect(await names(ids.class.Link, listed)).toEqual(['own link'])
  })

  it('gets every link to the document from a reverse lookup, the middleware keeps its own', async () => {
    const found = await adapter.findAll<any>(
      guest(scope),
      ids.class.Task,
      { _id: 'd' as Ref<Doc> },
      {
        lookup: { _id: { links: ids.class.Link } }
      }
    )
    // Joined rows come unfiltered, with _class and attachedTo for the middleware to judge by.
    const links = found[0].$lookup.links as Array<{ _id: string, _class: string, attachedTo: string }>
    expect(links.map((it) => it._id).sort()).toEqual(['l1', 'l2'])
    expect(links.every((it) => it._class === ids.class.Link && it.attachedTo === 'd')).toBe(true)
  })

  it('does not read the txes of the shared document, whose attachedTo holds the parent', async () => {
    for (const _class of [core.class.Tx, core.class.TxCUD, core.class.TxCreateDoc]) {
      expect(await names(_class, scope)).toEqual([])
      expect(await names(_class, scope, { attachedTo: 'd' })).toEqual([])
    }
    const found = await adapter.findAll<any>(guest(scope), core.class.Tx, {}, { total: true })
    expect(found.total).toBe(0)
  })

  it('has the adapter say that it filters a guest', () => {
    expect(adapter.docGuestSecurity).toBe(true)
  })
})
