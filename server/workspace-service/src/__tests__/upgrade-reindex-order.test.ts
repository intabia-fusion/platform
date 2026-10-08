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

/**
 * Reindex requests stored by migrations reach the queue only after upgrade-done raised the workspace version:
 * the fulltext indexer skips anything that arrives while the workspace is still on the old one.
 */

import {
  DOMAIN_MIGRATION,
  type Class,
  type Doc,
  type Domain,
  type MeasureContext,
  type Ref,
  type WorkspaceInfoWithStatus,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type MigrateMode } from '@hcengineering/model'
import { workspaceEvents, type PlatformQueueProducer, type QueueWorkspaceMessage } from '@hcengineering/server-core'
import { reindexRequest, reindexRequestPlugin, upgradeModel } from '@hcengineering/server-tool'

import { upgradeWorkspaceWith } from '../ws-operations'

jest.mock('@hcengineering/server-tool', () => ({
  ...jest.requireActual('@hcengineering/server-tool'),
  upgradeModel: jest.fn()
}))
jest.mock('@hcengineering/server-token', () => ({
  ...jest.requireActual('@hcengineering/server-token'),
  generateToken: () => 'token'
}))
jest.mock('@hcengineering/server-client', () => ({
  ...jest.requireActual('@hcengineering/server-client'),
  getTransactorEndpoint: async () => 'ws://transactor'
}))

const ws = 'ws-1' as WorkspaceUuid
const version = { major: 0, minor: 8, patch: 8 }
const task = 'task' as Domain
const taskClass = 'task:class:Task' as Ref<Class<Doc>>

describe('migration reindex requests go out after upgrade-done', () => {
  let ctx: MeasureContext
  let log: string[]
  let docs: Map<string, any>
  let queue: { send: jest.Mock, close: jest.Mock, getQueue: jest.Mock }

  // An in-memory DOMAIN_MIGRATION, upload is an upsert by _id.
  const lowLevel = {
    upload: async (_ctx: MeasureContext, _domain: Domain, items: Doc[]) => {
      for (const it of items) docs.set(it._id, { ...it })
    },
    clean: async (_ctx: MeasureContext, _domain: Domain, ids: string[]) => {
      for (const id of ids) docs.delete(id)
    },
    rawFindAll: async (domain: Domain, query: Record<string, any>) =>
      domain === DOMAIN_MIGRATION
        ? Array.from(docs.values()).filter((it) => Object.entries(query).every(([k, v]) => it[k] === v))
        : []
  }

  function stored (): any[] {
    return Array.from(docs.values()).filter((it) => it.plugin === reindexRequestPlugin)
  }

  async function upgrade (mode: MigrateMode): Promise<void> {
    const info = { uuid: ws, url: 'ws-1', versionMajor: 0, versionMinor: 8, versionPatch: 7 }
    await upgradeWorkspaceWith(
      ctx,
      version,
      [],
      [],
      info as unknown as WorkspaceInfoWithStatus,
      { context: { modelDb: {}, lowLevelStorage: lowLevel } } as any,
      {} as any,
      {} as any,
      {} as any,
      queue as unknown as PlatformQueueProducer<QueueWorkspaceMessage>,
      undefined,
      async (event) => {
        log.push(event)
      },
      true,
      'skip',
      false,
      mode
    )
  }

  beforeEach(() => {
    jest.clearAllMocks()
    log = []
    docs = new Map()
    ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as MeasureContext
    queue = {
      send: jest.fn(async () => {
        log.push('send')
      }),
      close: jest.fn(),
      getQueue: jest.fn()
    }
    // A migration stores a reindex request in the middle of upgradeModel, as MigrateClientImpl.reindex does.
    ;(upgradeModel as jest.Mock).mockImplementation(async () => {
      await lowLevel.upload(ctx, DOMAIN_MIGRATION, [reindexRequest(task, [taskClass])])
      log.push('migrated')
      return []
    })
  })

  it('upgrade: the request is sent after upgrade-done and removed', async () => {
    await upgrade('upgrade')

    expect(log).toEqual(['upgrade-started', 'migrated', 'upgrade-done', 'send'])
    expect(queue.send).toHaveBeenCalledWith(ctx, ws, [workspaceEvents.reindex(task, [taskClass])])
    expect(stored()).toHaveLength(0)
  })

  it('a request left by an upgrade that died is sent by the next one', async () => {
    const left = reindexRequest()
    docs.set(left._id, left)
    ;(upgradeModel as jest.Mock).mockImplementation(async () => [])

    await upgrade('upgrade')

    expect(queue.send).toHaveBeenCalledWith(ctx, ws, [workspaceEvents.fullReindex()])
    expect(stored()).toHaveLength(0)
  })

  it('create: the request is removed without sending, Created brings a full reindex', async () => {
    await upgrade('create')

    expect(queue.send).not.toHaveBeenCalled()
    expect(stored()).toHaveLength(0)
  })

  it('a failed upgrade sends nothing and keeps the request for the retry', async () => {
    ;(upgradeModel as jest.Mock).mockImplementation(async () => {
      await lowLevel.upload(ctx, DOMAIN_MIGRATION, [reindexRequest(task, [taskClass])])
      throw new Error('migration failed')
    })

    await expect(upgrade('upgrade')).rejects.toThrow('migration failed')

    expect(queue.send).not.toHaveBeenCalled()
    expect(stored()).toHaveLength(1)
  })

  it('a failed send after upgrade-done is logged, the upgrade succeeds, the request stays', async () => {
    queue.send.mockRejectedValue(new Error('queue down'))

    await expect(upgrade('upgrade')).resolves.toBeUndefined()

    expect(ctx.error).toHaveBeenCalledWith('failed to send migration reindex requests', expect.anything())
    expect(stored()).toHaveLength(1)
  })
})
