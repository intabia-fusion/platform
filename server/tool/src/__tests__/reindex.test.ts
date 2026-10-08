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
 * Migrations' reindex requests are stored in DOMAIN_MIGRATION and sent only by sendPendingReindex.
 */

import core, {
  DOMAIN_MIGRATION,
  type Class,
  type Doc,
  type Domain,
  type MeasureContext,
  type Ref,
  type WorkspaceUuid
} from '@hcengineering/core'
import { workspaceEvents, type PlatformQueueProducer, type QueueWorkspaceMessage } from '@hcengineering/server-core'

import { dropPendingReindex, reindexRequestPlugin, sendPendingReindex } from '../reindex'
import { MigrateClientImpl } from '../upgrade'

const ctx = {} as unknown as MeasureContext
const ws = 'ws-1' as WorkspaceUuid
const task = 'task' as Domain
const chunter = 'chunter' as Domain
const classA = 'class:A' as Ref<Class<Doc>>
const classB = 'class:B' as Ref<Class<Doc>>

describe('migration reindex requests', () => {
  let docs: Map<string, any>
  let lowLevel: { upload: jest.Mock, clean: jest.Mock, rawFindAll: jest.Mock }
  let queue: { send: jest.Mock }
  let client: MigrateClientImpl

  function stored (): any[] {
    return Array.from(docs.values()).filter((it) => it.plugin === reindexRequestPlugin)
  }

  async function send (): Promise<QueueWorkspaceMessage[]> {
    return await sendPendingReindex(
      ctx,
      lowLevel as any,
      queue as unknown as PlatformQueueProducer<QueueWorkspaceMessage>,
      ws
    )
  }

  beforeEach(() => {
    // An in-memory DOMAIN_MIGRATION: upload is an upsert by _id, like the postgres adapter.
    docs = new Map()
    lowLevel = {
      upload: jest.fn(async (_ctx: MeasureContext, domain: Domain, items: Doc[]) => {
        expect(domain).toBe(DOMAIN_MIGRATION)
        for (const it of items) docs.set(it._id, { ...it })
      }),
      clean: jest.fn(async (_ctx: MeasureContext, domain: Domain, ids: string[]) => {
        expect(domain).toBe(DOMAIN_MIGRATION)
        for (const id of ids) docs.delete(id)
      }),
      rawFindAll: jest.fn(async (domain: Domain, query: Record<string, any>) =>
        Array.from(docs.values()).filter((it) => Object.entries(query).every(([k, v]) => it[k] === v))
      )
    }
    queue = { send: jest.fn().mockResolvedValue(undefined) }
    client = new MigrateClientImpl(
      { context: { lowLevelStorage: lowLevel } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { uuid: ws } as any,
      ctx
    )
  })

  it('a migration stores the request instead of sending it', async () => {
    await client.reindex(task, [classA])
    await client.fullReindex()

    expect(queue.send).not.toHaveBeenCalled()
    expect(
      stored()
        .map((it) => it.state)
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(['full', 'task'])
    expect(stored().every((it) => it._class === core.class.MigrationState)).toBe(true)
  })

  it('repeated requests for one domain keep one record with the classes of both', async () => {
    await client.reindex(task, [classA])
    await client.reindex(task, [classB, classA])
    await client.fullReindex()
    await client.fullReindex()

    expect(stored()).toHaveLength(2)
    expect(stored().find((it) => it.state === 'task')?.classes).toEqual([classA, classB])
  })

  it('partial requests are sent as they are, then removed', async () => {
    await client.reindex(task, [classA])
    await client.reindex(chunter, [classB])

    const msgs = await send()

    expect(msgs).toEqual([workspaceEvents.reindex(task, [classA]), workspaceEvents.reindex(chunter, [classB])])
    expect(queue.send).toHaveBeenCalledWith(ctx, ws, msgs)
    expect(stored()).toHaveLength(0)
  })

  it('a full request covers the partial ones', async () => {
    await client.reindex(task, [classA])
    await client.fullReindex()

    const msgs = await send()

    expect(msgs).toEqual([workspaceEvents.fullReindex()])
    expect(stored()).toHaveLength(0)
  })

  it('nothing stored, nothing sent', async () => {
    expect(await send()).toEqual([])
    expect(queue.send).not.toHaveBeenCalled()
  })

  it('a failed send keeps the requests for the next upgrade', async () => {
    await client.fullReindex()
    queue.send.mockRejectedValue(new Error('queue down'))

    await expect(send()).rejects.toThrow('queue down')

    expect(stored()).toHaveLength(1)
  })

  it('drop removes only the requests, not the migration state', async () => {
    docs.set('state-1', { _id: 'state-1', _class: core.class.MigrationState, plugin: 'core', state: 'some-migration' })
    await client.fullReindex()

    await dropPendingReindex(ctx, lowLevel as any)

    expect(queue.send).not.toHaveBeenCalled()
    expect(stored()).toHaveLength(0)
    expect(docs.has('state-1')).toBe(true)
  })
})
