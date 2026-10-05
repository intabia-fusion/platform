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
  readonly released: string[] = []
  constructor (readonly classes: Set<string>) {}

  async releaseHeld (held: { notificationId: string }): Promise<void> {
    this.released.push(held.notificationId)
  }

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
  createRestClient: () => ({})
}))
jest.mock('@hcengineering/server-storage', () => ({
  buildStorageFromConfig: () => ({}),
  storageConfigFrom: () => ({})
}))
jest.mock('@hcengineering/server-token', () => ({ generateToken: () => 'token' }))
const mockFindAiBot = jest.fn()
jest.mock('@hcengineering/server-client', () => ({
  getAccountClient: () => ({ findFullSocialIdBySocialKey: mockFindAiBot })
}))
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

describe('Worker.heldNotification', () => {
  const ctx = new MeasureMetricsContext('test', {})

  it('loads the workspace and hands it the fired letter', async () => {
    mockModel = new Set([Issue])
    mockGate = Promise.resolve()
    mockCreated.length = 0
    const worker = new Worker(ctx, createModel(), queue)
    await worker.heldNotification(ctx, ws, { notificationId: 'n-1' } as any)
    expect(mockCreated).toHaveLength(1)
    expect(mockCreated[0].released).toEqual(['n-1'])
    await worker.close()
  })
})

describe('Worker.close', () => {
  const ctx = new MeasureMetricsContext('test', {})

  // A held push is published from Workspace.close(); the producer must outlive the workspaces.
  it('closes every open workspace before the producers', async () => {
    mockModel = new Set([Issue])
    mockGate = Promise.resolve()
    mockCreated.length = 0
    const order: string[] = []
    const orderedQueue: any = {
      getProducer: () => ({
        send: async () => {},
        close: async () => {
          order.push('producer')
        }
      })
    }
    const worker = new Worker(ctx, createModel(), orderedQueue)
    await worker.tx(ctx, ws, createTx(Issue))
    expect(mockCreated).toHaveLength(1)
    const original = mockCreated[0].close.bind(mockCreated[0])
    mockCreated[0].close = async () => {
      order.push('workspace')
      await original()
    }

    await worker.close()

    expect(mockCreated[0].closed).toBe(true)
    expect(order[0]).toBe('workspace')
    expect(order.slice(1).every((it) => it === 'producer')).toBe(true)
  })
})

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

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('Worker AI bot account', () => {
  const ctx = new MeasureMetricsContext('test', {})
  let worker: Worker
  let now: number

  beforeEach(() => {
    now = 1_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    mockFindAiBot.mockReset()
    worker = new Worker(ctx, createModel(), queue)
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await worker.close()
  })

  it('finds a bot created after the service started', async () => {
    mockFindAiBot.mockResolvedValueOnce(null)
    expect(await worker.getAiBotAccount()).toBeUndefined()

    mockFindAiBot.mockResolvedValue({ personUuid: 'bot-acc' })
    // Within the interval the lookup is not repeated.
    now += 1000
    expect(await worker.getAiBotAccount()).toBeUndefined()
    expect(mockFindAiBot).toHaveBeenCalledTimes(1)

    now += 60 * 1000
    await worker.getAiBotAccount()
    await flush()
    expect(await worker.getAiBotAccount()).toBe('bot-acc')
    expect(mockFindAiBot).toHaveBeenCalledTimes(2)
  })

  it('does not wait for a hanging repeated lookup', async () => {
    mockFindAiBot.mockResolvedValueOnce(null)
    await worker.getAiBotAccount()

    mockFindAiBot.mockReturnValue(new Promise(() => {}))
    now += 60 * 1000
    expect(await worker.getAiBotAccount()).toBeUndefined()
    expect(await worker.getAiBotAccount()).toBeUndefined()
    expect(mockFindAiBot).toHaveBeenCalledTimes(2)
  })

  it('shares one lookup between concurrent callers', async () => {
    mockFindAiBot.mockResolvedValue({ personUuid: 'bot-acc' })

    const results = await Promise.all([worker.getAiBotAccount(), worker.getAiBotAccount()])

    expect(results).toEqual(['bot-acc', 'bot-acc'])
    expect(mockFindAiBot).toHaveBeenCalledTimes(1)
  })

  it('retries after a failed lookup', async () => {
    mockFindAiBot.mockRejectedValueOnce(new Error('account service down'))
    expect(await worker.getAiBotAccount()).toBeUndefined()

    mockFindAiBot.mockResolvedValue({ personUuid: 'bot-acc' })
    now += 60 * 1000
    await worker.getAiBotAccount()
    await flush()
    expect(await worker.getAiBotAccount()).toBe('bot-acc')
  })
})
