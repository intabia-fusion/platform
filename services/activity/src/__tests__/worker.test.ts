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
  type Class,
  type Doc,
  MeasureMetricsContext,
  type Ref,
  type TxCUD,
  type WorkspaceUuid
} from '@hcengineering/core'
import { Worker } from '../worker'

// Classes the workspace model has right now; a restore changes it under a running service.
let mockModel = new Set<string>()
let mockGate: Promise<void> = Promise.resolve()
const mockCreated: FakeWorkspace[] = []

class FakeWorkspace {
  closed = false
  constructor (readonly classes: Set<string>) {}

  async tx (tx: TxCUD<Doc>): Promise<void> {
    // The real Workspace fails the same way on hierarchy.getDomain for a class its model lacks.
    if (!this.classes.has(tx.objectClass)) throw new Error(`domain not found: ${tx.objectClass}`)
  }

  async close (): Promise<void> {
    this.closed = true
  }
}

jest.mock('../config', () => ({ __esModule: true, default: { ServiceId: 'activity', BrandingPath: '' } }))
jest.mock('../utils', () => ({
  getWorkspaceInfo: async () => ({ uuid: 'ws' }),
  getTransactorApiEndpoint: () => 'http://transactor'
}))
jest.mock('@hcengineering/api-client', () => ({
  createRestClient: () => ({ getModel: async () => ({ model: {}, hierarchy: {} }) })
}))
jest.mock('@hcengineering/server-storage', () => ({
  buildStorageFromConfig: () => ({}),
  storageConfigFrom: () => ({})
}))
jest.mock('@hcengineering/server-token', () => ({ generateToken: () => 'token' }))
jest.mock('../workspace', () => ({
  __esModule: true,
  default: {
    create: async () => {
      // Snapshot before the gate: the model is read from the transactor before the load finishes.
      const classes = new Set(mockModel)
      await mockGate
      const ws = new FakeWorkspace(classes)
      mockCreated.push(ws)
      return ws
    }
  }
}))

const ws = 'ws' as WorkspaceUuid
const Issue = 'test:class:Issue' as Ref<Class<Doc>>
const Custom = 'test:class:Custom' as Ref<Class<Doc>>

function createTx (objectClass: Ref<Class<Doc>>): TxCUD<Doc> {
  return {
    _id: `tx-${objectClass}` as any,
    _class: core.class.TxCreateDoc,
    space: core.space.Tx,
    objectId: 'doc' as any,
    objectClass,
    objectSpace: core.space.Space,
    modifiedOn: Date.now(),
    modifiedBy: core.account.System,
    attributes: {}
  } as unknown as TxCUD<Doc>
}

describe('Worker after workspace restore', () => {
  const ctx = new MeasureMetricsContext('test', {})
  let worker: Worker

  beforeEach(() => {
    mockModel = new Set([Issue])
    mockGate = Promise.resolve()
    mockCreated.length = 0
    worker = new Worker(ctx, [])
  })

  afterEach(() => {
    worker.close()
  })

  it('reloads the model for classes created after restore', async () => {
    await worker.tx(ctx, ws, createTx(Issue))

    mockModel.add(Custom)
    // Without a drop the cached model rejects the tx, and the queue retries it forever.
    await expect(worker.tx(ctx, ws, createTx(Custom))).rejects.toThrow('domain not found')

    await worker.dropWorkspace(ws)
    await worker.tx(ctx, ws, createTx(Custom))

    expect(mockCreated).toHaveLength(2)
    expect(mockCreated[0].closed).toBe(true)
    expect(mockCreated[1].closed).toBe(false)
  })

  it('drops a workspace whose load was in flight when restore finished', async () => {
    let release: () => void = () => {}
    mockGate = new Promise((resolve) => {
      release = resolve
    })

    const loading = worker.tx(ctx, ws, createTx(Issue))
    await new Promise((resolve) => setImmediate(resolve))

    mockModel.add(Custom)
    const dropping = worker.dropWorkspace(ws)
    release()
    await Promise.all([loading, dropping])

    await worker.tx(ctx, ws, createTx(Custom))

    expect(mockCreated).toHaveLength(2)
    expect(mockCreated[0].closed).toBe(true)
  })
})
