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

import core, {
  ClassifierKind,
  DOMAIN_MODEL_TX,
  AccountRole,
  MeasureMetricsContext,
  TxFactory,
  TxOperations,
  type Class,
  type Doc,
  type Domain,
  type Ref,
  type WorkspaceIds,
  type WorkspaceUuid
} from '@hcengineering/core'
import buildModel, { migrateOperations } from '@hcengineering/model-all'
import { addLocation, type IntlString } from '@hcengineering/platform'
import {
  createPostgresAdapter,
  createPostgresTxAdapter,
  createPostgreeDestroyAdapter,
  getDBClient,
  shutdownPostgres,
  setDBExtraOptions
} from '@hcengineering/postgres'
import serverCore, {
  SessionDataImpl,
  createDummyStorageAdapter,
  wrapPipeline,
  type Pipeline
} from '@hcengineering/server-core'
import serverGuest, { serverGuestId } from '@hcengineering/server-guest'
import { postgresUrl, stopContainers } from '@hcengineering/test-containers'
import { PublicFileAccessClient, PublicFileAccessError } from '@hcengineering/datalake'
import { getPublicLink } from '@hcengineering/server-guest-resources'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { promisify } from 'util'
import {
  createBackupPipeline,
  createEmptyBroadcastOps,
  getServerPipeline,
  registerTxAdapterFactory,
  registerAdapterFactory,
  registerDestroyFactory,
  registerStringLoaders
} from '../index'

const mockStates = new Map<string, { revision: number, revoked: boolean, blobs: string[] }>()
const previousStorage = process.env.STORAGE_CONFIG
let mockFail = false
jest.mock('@hcengineering/datalake', () => ({
  ...jest.requireActual('@hcengineering/datalake'),
  PublicFileAccessClient: jest.fn(() => ({
    state: async (_ws: string, id: string) =>
      structuredClone(mockStates.get(id) ?? { revision: 0, revoked: false, blobs: [] }),
    replace: async (_ws: string, id: string, revision: number, blobs: string[]) => {
      if (mockFail) throw new PublicFileAccessError(503)
      mockStates.set(id, { revision, blobs, revoked: false })
    },
    revoke: async (_ws: string, id: string, revision: number) => {
      if (mockFail) throw new PublicFileAccessError(503)
      mockStates.set(id, { revision, blobs: [], revoked: true })
    },
    activeLinks: async (_ws: string, after: string) =>
      [...mockStates]
        .filter(([id, state]) => !state.revoked && id > after)
        .map(([id]) => id)
        .sort()
        .slice(0, 10)
  }))
}))
jest.setTimeout(300000)
const root = 'publicFileTest:class:Document' as Ref<Class<Doc>>
const publicLink = 'guest:class:PublicLink' as Ref<Class<Doc>>
const space = 'public-file-space' as any
const ctx = new MeasureMetricsContext('public-files', {})
const ws: WorkspaceIds = { uuid: randomUUID() as WorkspaceUuid, url: 'public-files' }
let pipeline: Pipeline
let dbUrl: string
function model (): any[] {
  const result = buildModel()
    .getTxes()
    .filter((tx) => {
      const create = tx as any
      return (
        create.objectClass !== serverCore.class.Trigger ||
        create.attributes?.trigger === serverGuest.trigger.OnPublicLinkCreate
      )
    })
  const f = new TxFactory(core.account.System)
  result.push(
    f.createTxCreateDoc(
      core.class.Class,
      core.space.Model,
      {
        kind: ClassifierKind.CLASS,
        extends: core.class.Doc,
        domain: 'public-file-test' as Domain,
        label: 'test' as IntlString
      },
      root
    )
  )
  result.push(
    f.createTxCreateDoc(core.class.Attribute, core.space.Model, {
      attributeOf: root,
      name: 'file',
      label: 'file' as IntlString,
      type: { _class: core.class.TypeBlob }
    } as any)
  )
  return result
}
function client (): TxOperations {
  return new TxOperations(wrapPipeline(new MeasureMetricsContext('system', {}), pipeline, ws), core.account.System)
}
async function reopen (): Promise<void> {
  pipeline = await getServerPipeline(ctx, model(), dbUrl, ws, createDummyStorageAdapter(), {
    disableTriggers: false
  })
}
beforeAll(async () => {
  process.env.STORAGE_CONFIG = 'datalake|http://datalake:4030'
  const serverUrl = await postgresUrl()
  const dbName = `public_files_${randomUUID().replace(/-/g, '')}`
  const admin = getDBClient(serverUrl)
  try {
    const sql = await admin.getClient()
    await sql`CREATE DATABASE ${sql(dbName)}`
  } finally {
    admin.close()
  }
  const url = new URL(serverUrl)
  url.pathname = '/' + dbName
  dbUrl = url.toString()
  await promisify(execFile)(process.execPath, [require.resolve('@hcengineering/pod-db-migrator')], {
    env: { ...process.env, DB_URL: dbUrl }
  })
  setDBExtraOptions({ prepare: true })
  registerTxAdapterFactory('postgresql', createPostgresTxAdapter, true)
  registerAdapterFactory('postgresql', createPostgresAdapter, true)
  registerDestroyFactory('postgresql', createPostgreeDestroyAdapter, true)
  registerStringLoaders()
  addLocation(serverGuestId, async () => require('@hcengineering/server-guest-resources'))
  await reopen()
  await client().createDoc(
    core.class.Space,
    core.space.Space,
    {
      name: 'public files',
      description: '',
      archived: false,
      private: false,
      members: []
    },
    space
  )
})
afterAll(async () => {
  try {
    await pipeline?.close()
    await shutdownPostgres()
  } finally {
    if (previousStorage === undefined) delete process.env.STORAGE_CONFIG
    else process.env.STORAGE_CONFIG = previousStorage
    await stopContainers()
  }
})
beforeEach(() => {
  mockFail = false
})
async function publish (url = 'already-filled'): Promise<{ doc: any, link: any }> {
  const doc = randomUUID() as Ref<Doc>
  const link = randomUUID() as Ref<Doc>
  await client().createDoc(root, space, { file: 'old' } as any, doc)
  await client().createDoc(
    publicLink,
    space,
    {
      attachedTo: doc,
      attachedToClass: root,
      url,
      restrictions: {},
      revokable: true
    } as any,
    link
  )
  return { doc, link }
}
it('registers an already-filled public link through the real pipeline', async () => {
  expect(PublicFileAccessClient).toHaveBeenCalledWith('http://datalake:4030', expect.any(String))
  const { link } = await publish()
  expect(mockStates.get(link)?.blobs).toEqual(['old'])
})
it('registers a link whose URL is filled by the real public-link trigger', async () => {
  const { link } = await publish('')
  expect(mockStates.get(link)?.blobs).toEqual(['old'])
  const stored = await client().findOne(publicLink, { _id: link })
  expect((stored as any)?.url).toContain('?token=')
})
it('persists failed reductions and repairs them after a pipeline restart', async () => {
  const { doc, link } = await publish()
  mockFail = true
  await expect(client().updateDoc(root, space, doc, { file: 'new' } as any)).rejects.toThrow()
  const storage = pipeline.context.lowLevelStorage
  if (storage === undefined) throw new Error('Missing storage')
  const [stored] = await storage.rawFindAll<Doc>('guest' as Domain, { _id: link })
  expect((stored as any).publicFileSyncPending).toBe(true)
  await pipeline.close()
  mockFail = false
  await reopen()
  await client().updateDoc(root, space, doc, { file: 'new' } as any)
  expect(mockStates.get(link)?.blobs).not.toContain('old')
  const reopenedStorage = pipeline.context.lowLevelStorage
  if (reopenedStorage === undefined) throw new Error('Missing reopened storage')
  const [repaired] = await reopenedStorage.rawFindAll<Doc>('guest' as Domain, { _id: link })
  expect((repaired as any).publicFileSyncPending).toBe(false)
})
it('restores a persisted revoke job after restarting the real PostgreSQL pipeline', async () => {
  const { link } = await publish()
  mockFail = true
  await expect(client().removeDoc(publicLink, space, link)).rejects.toThrow()
  expect(await client().findOne(publicLink, { _id: link })).toBeUndefined()
  const domain = 'public_file_sync' as Domain
  expect(await pipeline.context.lowLevelStorage?.rawFindAll(domain, { _id: link })).toHaveLength(1)

  // A worker may already have retried while the API was down. Make that
  // persisted retry due without waiting a minute in the integration suite.
  await pipeline.close()
  mockFail = false
  await reopen()
  await pipeline.context.lowLevelStorage?.rawUpdate<Doc & { readyAt: number }>(
    domain,
    { _id: link },
    { readyAt: Date.now() }
  )
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await pipeline.context.lowLevelStorage?.rawFindAll(domain, { _id: link }))?.length === 0) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  expect(await pipeline.context.lowLevelStorage?.rawFindAll(domain, { _id: link })).toHaveLength(0)
  expect(mockStates.get(link)?.revoked).toBe(true)
})

it('revokes deletion of the public link', async () => {
  const { link } = await publish()
  await client().removeDoc(publicLink, space, link)
  expect(mockStates.get(link)?.revoked).toBe(true)
})
it('revokes deletion of the published object', async () => {
  const { doc, link } = await publish()
  await client().removeDoc(root, space, doc)
  expect(mockStates.get(link)?.revoked).toBe(true)
})

it('never revives a retired URL after A to B to A and publishes a new working link', async () => {
  const { doc, link } = await publish()
  const otherSpace = randomUUID() as any
  await client().createDoc(
    core.class.Space,
    core.space.Space,
    {
      name: 'other space',
      description: '',
      private: false,
      archived: false,
      members: []
    },
    otherSpace
  )
  await client().updateDoc(root, space, doc, { space: otherSpace } as any)
  expect(await client().findOne(publicLink, { _id: link })).toBeUndefined()
  expect(mockStates.get(link)?.revoked).toBe(true)
  await client().updateDoc(root, otherSpace, doc, { space } as any)
  const data = new SessionDataImpl(
    {
      uuid: 'b6996120-416f-49cd-841e-e4a5d2e49c9b',
      role: AccountRole.DocGuest,
      primarySocialId: '',
      socialIds: [],
      fullSocialIds: []
    } as any,
    'guest',
    false,
    undefined,
    ws,
    false,
    undefined,
    undefined,
    pipeline.context.modelDb,
    new Map(),
    'transactor'
  )
  data.guestLink = { _id: link }
  const guestContext = new MeasureMetricsContext('retired-guest', {}) as any
  guestContext.contextData = data
  expect(await pipeline.findAll(guestContext, root, { _id: doc })).toHaveLength(0)
  const restored = await client().findOne(root, { _id: doc })
  if (restored === undefined) throw new Error('Moved document missing')
  const url = await getPublicLink(restored, client(), ws, true, null)
  const fresh = await client().findOne(publicLink, { attachedTo: doc, space } as any)
  expect(fresh?._id).not.toBe(link)
  expect((fresh as any)?.url).toBe(url)
  expect(mockStates.get(fresh?._id ?? '')?.blobs).toEqual(['old'])
  expect(mockStates.get(link)?.revoked).toBe(true)
  if (fresh === undefined) throw new Error('New public link missing')
  data.guestLink = { _id: fresh._id }
  expect(await pipeline.findAll(guestContext, root, { _id: doc })).toHaveLength(1)
})

it('upgrades the v1 migration and retires a legacy source link whose id is revoked', async () => {
  const { link } = await publish()
  mockStates.set(link, { revision: 2, revoked: true, blobs: [] })
  const operation = migrateOperations.find(([name]) => name === 'guest')?.[1]
  if (operation === undefined) throw new Error('Guest migration missing')
  await operation.upgrade(
    new Map([['guest', new Set(['public-file-access-v1'])]]),
    async () => client() as any,
    'upgrade'
  )
  expect(await client().findOne(publicLink, { _id: link })).toBeUndefined()
  expect(
    await client().findOne(core.class.MigrationState, { plugin: 'guest', state: 'public-file-access-v2' })
  ).toBeDefined()
})

it('reconciles a public file whose custom class was written by the restore', async () => {
  const backup = await createBackupPipeline(ctx, dbUrl, model(), {
    externalStorage: createDummyStorageAdapter()
  })(ctx, ws, createEmptyBroadcastOps(), null)
  try {
    const storage = backup.context.lowLevelStorage
    if (storage === undefined) throw new Error('Missing storage')
    const customClass = 'publicFileTest:class:RestoredDocument' as Ref<Class<Doc>>
    expect(backup.context.hierarchy.hasClass(customClass)).toBe(false)
    const f = new TxFactory(core.account.System)
    const dataDomain = 'public-file-test' as Domain
    await storage.upload(ctx, DOMAIN_MODEL_TX, [
      f.createTxCreateDoc(
        core.class.Class,
        core.space.Model,
        {
          kind: ClassifierKind.CLASS,
          extends: root,
          domain: dataDomain,
          label: 'restored' as IntlString
        },
        customClass
      )
    ])
    const doc = randomUUID() as Ref<Doc>
    const link = randomUUID() as Ref<Doc>
    const metadata = { space, modifiedBy: core.account.System, modifiedOn: Date.now() }
    const restored = { ...metadata, _id: doc, _class: customClass, file: 'restored-file' }
    const restoredLink = { ...metadata, _id: link, _class: publicLink, attachedTo: doc, attachedToClass: customClass }
    await storage.upload(ctx, dataDomain, [restored])
    await storage.upload(ctx, 'guest' as Domain, [restoredLink])
    await backup.context.afterRestore?.(ctx)
    expect(mockStates.get(link)?.blobs).toEqual(['restored-file'])
  } finally {
    await backup.close()
  }
})
