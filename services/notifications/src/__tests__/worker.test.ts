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
  systemAccountUuid,
  type Tx,
  type TxCUD,
  TxFactory,
  type WorkspaceUuid
} from '@hcengineering/core'
import notification from '@hcengineering/notification'
import { QueueTopic } from '@hcengineering/server-core'
import { Worker } from '../worker'

// Classes the workspace model has right now; a restore changes it under a running service.
let mockModel = new Set<string>()
let mockGate: Promise<void> = Promise.resolve()
// Whether the tx is one the service loads a workspace for; a status change is not.
let mockTriggers = true
const mockCreated: FakeWorkspace[] = []

class FakeWorkspace {
  closed = false
  readonly handled: string[] = []
  readonly released: string[] = []
  // What the database says about the reader's contexts with unread notifications.
  readonly client = { findOne: jest.fn().mockResolvedValue(undefined) }
  readonly cache = { getUserStatuses: jest.fn().mockResolvedValue([]) }
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
  isTxTrigger: () => mockTriggers,
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
    cls(notification.class.TxNotificationType, core.class.Doc),
    cls(notification.class.DocNotifyContext, core.class.Doc),
    cls(notification.class.ReadState, core.class.Doc),
    cls(core.class.UserStatus, core.class.Doc)
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

describe('Worker cross-workspace unread flag', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const user = 'acc-1'
  let sent: Array<{ ws: string, user: string, hasUnread: boolean }>
  let sendGate: Promise<void>
  let worker: Worker

  beforeEach(() => {
    mockModel = new Set([Issue])
    mockGate = Promise.resolve()
    mockCreated.length = 0
    mockFindAiBot.mockReset().mockResolvedValue(null)
    sent = []
    sendGate = Promise.resolve()
    const statusQueue: any = {
      getProducer: (_ctx: unknown, topic: QueueTopic) => ({
        send: async (_ctx: unknown, ws: string, msgs: any[]) => {
          await sendGate
          if (topic !== QueueTopic.Users) return
          for (const msg of msgs) sent.push({ ws, user: msg.user, hasUnread: msg.hasUnread })
        },
        close: async () => {}
      })
    }
    worker = new Worker(ctx, createModel(), statusQueue)
  })

  afterEach(async () => {
    await worker.close()
  })

  function contextCreated (unreadCount: number): TxCUD<Doc> {
    return {
      ...createTx(notification.class.DocNotifyContext),
      _id: `tx-ctx-${unreadCount}` as any,
      attributes: { user, unreadCount }
    } as unknown as TxCUD<Doc>
  }

  function read (account: string, timestamp: number): TxCUD<Doc> {
    return {
      ...createTx(notification.class.ReadState),
      _id: `tx-read-${account}-${timestamp}` as any,
      _class: core.class.TxUpdateDoc,
      operations: { [account]: { timestamp }, latestMessageTimestamp: timestamp }
    } as unknown as TxCUD<Doc>
  }

  it('does not light the flag for a context created already read', async () => {
    await worker.tx(ctx, ws, contextCreated(0))
    await worker.close()

    expect(sent).toEqual([])
  })

  it('lights the flag for a context created with unread notifications', async () => {
    await worker.tx(ctx, ws, contextCreated(1))
    await worker.close()

    expect(sent).toEqual([{ ws, user, hasUnread: true }])
  })

  it('re-checks a reader against the database, at most once a minute', async () => {
    await worker.tx(ctx, ws, read(user, 10))
    await worker.tx(ctx, ws, read(user, 20))
    await worker.close()

    expect(sent).toEqual([{ ws, user, hasUnread: false }])
    expect(mockCreated[0].client.findOne).toHaveBeenCalledTimes(1)
    expect(mockCreated[0].client.findOne).toHaveBeenCalledWith(
      notification.class.DocNotifyContext,
      { user, unreadCount: { $gt: 0 } },
      expect.anything()
    )
  })

  it('does not fail the read when the re-check fails, and tries again on the next read', async () => {
    await worker.tx(ctx, ws, createTx(Issue))
    mockCreated[0].client.findOne.mockRejectedValueOnce(new Error('db is down'))

    await expect(worker.tx(ctx, ws, read(user, 10))).resolves.toBeUndefined()
    await worker.tx(ctx, ws, read(user, 20))
    await worker.close()

    expect(mockCreated[0].client.findOne).toHaveBeenCalledTimes(2)
    expect(sent).toEqual([{ ws, user, hasUnread: false }])
  })

  function statusChanged (_class: Ref<Class<Doc>>, fields: Record<string, unknown>): TxCUD<Doc> {
    return {
      ...createTx(core.class.UserStatus),
      _id: `tx-status-${JSON.stringify(fields)}` as any,
      _class,
      objectId: 'us-2' as any,
      ...fields
    } as unknown as TxCUD<Doc>
  }

  it('re-checks an account that comes online in a workspace already open here', async () => {
    await worker.tx(ctx, ws, createTx(Issue))
    mockCreated[0].cache.getUserStatuses.mockResolvedValue([{ _id: 'us-2', user: 'acc-2' }])

    await worker.tx(ctx, ws, statusChanged(core.class.TxCreateDoc, { attributes: { user, online: true } }))
    await worker.tx(ctx, ws, statusChanged(core.class.TxUpdateDoc, { operations: { away: true } }))
    await worker.tx(ctx, ws, statusChanged(core.class.TxUpdateDoc, { operations: { online: true } }))
    await worker.close()

    expect(sent).toEqual([
      { ws, user, hasUnread: false },
      { ws, user: 'acc-2', hasUnread: false }
    ])
  })

  it('loads no workspace for a status change', async () => {
    mockTriggers = false
    try {
      await worker.tx(ctx, ws, statusChanged(core.class.TxCreateDoc, { attributes: { user, online: true } }))
      await worker.close()

      expect(mockCreated).toHaveLength(0)
      expect(sent).toEqual([])
    } finally {
      mockTriggers = true
    }
  })

  it('sends a re-checked flag only when it differs from the one sent last', async () => {
    const w = worker as any
    // Unknown after a start: sent, which is what heals a flag left stale before it.
    await worker.tx(ctx, ws, read(user, 10))
    await w.flushPendingUpdates()
    w.rechecked.clear()
    await worker.tx(ctx, ws, read(user, 20))
    await w.flushPendingUpdates()
    w.rechecked.clear()
    mockCreated[0].client.findOne.mockResolvedValueOnce({ _id: 'ctx-1' })
    await worker.tx(ctx, ws, read(user, 30))
    await worker.close()

    expect(mockCreated[0].client.findOne).toHaveBeenCalledTimes(3)
    expect(sent.map((it) => it.hasUnread)).toEqual([false, true])
  })

  it('does not re-check the system account or a position reset', async () => {
    await worker.tx(ctx, ws, read(systemAccountUuid, 10))
    await worker.tx(ctx, ws, read(user, 0))
    await worker.close()

    expect(sent).toEqual([])
  })

  it('never lets a newer flag be overtaken by an older one still being sent', async () => {
    let release: () => void = () => {}
    sendGate = new Promise((resolve) => {
      release = resolve
    })
    const w = worker as any

    w.scheduleStatusUpdate(user, ws, true)
    const first = w.flushPendingUpdates()
    w.scheduleStatusUpdate(user, ws, false)
    // Overlaps the first one: must wait for the next tick instead of racing it.
    await w.flushPendingUpdates()
    release()
    await first
    await w.flushPendingUpdates()

    expect(sent.map((it) => it.hasUnread)).toEqual([true, false])
  })
})
