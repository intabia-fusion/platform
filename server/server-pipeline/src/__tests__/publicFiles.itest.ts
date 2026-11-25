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
import buildModel from '@hcengineering/model-all'
import { addLocation, type IntlString } from '@hcengineering/platform'
import {
  createPostgresAdapter,
  createPostgresTxAdapter,
  createPostgreeDestroyAdapter,
  getDBClient,
  shutdownPostgres,
  setDBExtraOptions
} from '@hcengineering/postgres'
import serverCore, { createDummyStorageAdapter, wrapPipeline, type Pipeline } from '@hcengineering/server-core'
import serverGuest, { serverGuestId } from '@hcengineering/server-guest'
import { postgresUrl, stopContainers } from '@hcengineering/test-containers'
import { PublicFileAccessError } from '@hcengineering/datalake'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { promisify } from 'util'
import {
  getServerPipeline,
  registerTxAdapterFactory,
  registerAdapterFactory,
  registerDestroyFactory,
  registerStringLoaders
} from '../index'

const mockStates = new Map<string, { revision: number, revoked: boolean, blobs: string[] }>()
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
    disableTriggers: false,
    publicFileAccessUrl: 'http://datalake'
  })
}
beforeAll(async () => {
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
