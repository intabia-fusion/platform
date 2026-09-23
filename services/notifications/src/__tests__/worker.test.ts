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
  type Tx,
  type TxCUD,
  TxFactory,
  type WorkspaceUuid
} from '@hcengineering/core'
import notification from '@hcengineering/notification'
import { Worker } from '../worker'

// Classes the workspace model has right now; a restore changes it under a running service.
let mockModel = new Set<string>()
let mockGate: Promise<void> = Promise.resolve()
const mockCreated: FakeWorkspace[] = []

class FakeWorkspace {
  closed = false
  readonly handled: string[] = []
  constructor (readonly classes: Set<string>) {}

  async tx (tx: TxCUD<Doc>): Promise<void> {
    // The real Workspace skips a tx whose class its model lacks (findDomain returns undefined).
    if (this.classes.has(tx.objectClass)) this.handled.push(tx.objectClass)
  }

  async close (): Promise<void> {
    this.closed = true
  }
}

jest.mock('../config', () => ({ __esModule: true, default: { ServiceId: 'notifications', BrandingPath: '' } }))
jest.mock('../utils/utils', () => ({
  getWorkspaceInfo: async () => ({ uuid: 'ws' }),
  getTransactorApiEndpoint: () => 'http://transactor',
  isTxTrigger: () => true,
  MAX_NOTIFICATION_TYPE_PRIORITY: 1000
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

// Just enough model for the constructor to look up the notification types.
function createModel (): Tx[] {
  const factory = new TxFactory(core.account.System)
  const cls = (_id: Ref<Class<Doc>>, ext?: Ref<Class<Doc>>): Tx =>
    factory.createTxCreateDoc(core.class.Class, core.space.Model, { kind: 0, extends: ext } as any, _id as any)
  return [
    cls(core.class.Obj),
    cls(core.class.Doc, core.class.Obj),
    cls(core.class.Class, core.class.Doc),
    cls(notification.class.TxNotificationType, core.class.Doc)
  ]
}

const queue: any = {
  getProducer: () => ({ send: async () => {}, close: async () => {} })
}

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
    worker = new Worker(ctx, createModel(), queue)
  })

  afterEach(async () => {
    await worker.close()
  })

  it('reloads the model for classes created after restore', async () => {
    await worker.tx(ctx, ws, createTx(Issue))

    mockModel.add(Custom)
    // Without a drop the cached model silently skips the tx, and its notifications are lost.
    await worker.tx(ctx, ws, createTx(Custom))
    expect(mockCreated[0].handled).toEqual([Issue])

    await worker.dropWorkspace(ws)
    await worker.tx(ctx, ws, createTx(Custom))

    expect(mockCreated).toHaveLength(2)
    expect(mockCreated[0].closed).toBe(true)
    expect(mockCreated[1].handled).toEqual([Custom])
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
    expect(mockCreated[1].handled).toEqual([Custom])
  })

  it('ignores a drop of a workspace it never loaded', async () => {
    await worker.dropWorkspace(ws)
    expect(mockCreated).toHaveLength(0)
  })
})
