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

// PostgresTxAdapter.tx write failures checked against a real Postgres (testcontainers).

jest.mock('../version', () => ({
  waitForSchemaVersion: jest.fn().mockResolvedValue(undefined),
  EXPECTED_SCHEMA_VERSION: 10
}))

import core, {
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  type Ref,
  type Space,
  TxFactory,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type TxAdapter } from '@hcengineering/server-core'
import { createPostgresTxAdapter, getDBClient, shutdownPostgres, type PostgresClientReference } from '..'
import { genMinModel } from './minmodel'
import { withDatabase } from './utils'
import { postgresUrl } from '@hcengineering/test-containers'

jest.setTimeout(120000)

describe('PostgresTxAdapter.tx (real database)', () => {
  let baseDbUri: string
  let clientRef: PostgresClientReference
  let txStorage: TxAdapter
  const mctx = new MeasureMetricsContext('tx-adapter', {})
  const factory = new TxFactory(core.account.System)

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
    const dbUuid = crypto.randomUUID() as WorkspaceUuid
    const dbUri = withDatabase(baseDbUri, dbUuid)
    const pg = await clientRef.getClient()
    await pg`CREATE DATABASE ${pg(dbUuid)}`

    const hierarchy = new Hierarchy()
    const model = new ModelDb(hierarchy)
    for (const t of genMinModel()) hierarchy.tx(t)
    txStorage = await createPostgresTxAdapter(mctx, hierarchy, dbUri, { uuid: dbUuid, url: dbUri }, model)
    await txStorage.init?.(mctx, {})
  })

  afterEach(async () => {
    await txStorage.close()
  })

  it('rejects when a tx is not written', async () => {
    const tx = factory.createTxCreateDoc(core.class.Space, core.space.Space, {
      name: 'a',
      description: '',
      private: false,
      members: [],
      archived: false
    })
    await txStorage.tx(mctx, tx)
    await expect(txStorage.tx(mctx, tx)).rejects.toThrow()
  })

  it('rejects when a model tx is not written', async () => {
    const tx = factory.createTxUpdateDoc(core.class.Space, core.space.Model, 'sp' as Ref<Space>, { name: 'b' })
    await txStorage.tx(mctx, tx)
    await expect(txStorage.tx(mctx, tx)).rejects.toThrow()
  })

  it('writes both domains of a mixed batch', async () => {
    const base = factory.createTxRemoveDoc(core.class.Space, core.space.Space, 'x' as Ref<Space>)
    const modelTx = factory.createTxRemoveDoc(core.class.Space, core.space.Model, 'y' as Ref<Space>)
    await expect(txStorage.tx(mctx, base, modelTx)).resolves.toEqual([])
    const stored = (await txStorage.getModel(mctx)).map((it) => it._id)
    expect(stored).toEqual([modelTx._id])
  })
})
