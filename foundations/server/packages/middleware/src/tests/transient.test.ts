//
// Copyright © 2026 Intabia Fusion
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
  generateId,
  Hierarchy,
  MeasureMetricsContext,
  type MeasureContext,
  ModelDb,
  type Ref,
  type Space,
  type Tx
} from '@intabiafusion/core'
import type { DbAdapter, PipelineContext } from '@intabiafusion/server-core'
import { TransientMiddleware } from '../transient'

interface TransientDoc extends Doc {
  payload: string
}

const transientClass = 'test:class:Transient' as Ref<Class<TransientDoc>>
const transientSpace = 'test:space:Transient' as Ref<Space>

class FakeAdapter {
  store = new Map<Ref<Doc>, Doc>()
  loadCalls = 0
  cleanCalls = 0

  put (doc: Doc): void {
    this.store.set(doc._id, doc)
  }

  load = async (_ctx: MeasureContext, _domain: string, ids: Ref<Doc>[]): Promise<Doc[]> => {
    this.loadCalls++
    const out: Doc[] = []
    for (const id of ids) {
      const v = this.store.get(id)
      if (v !== undefined) out.push(v)
    }
    return out
  }

  clean = async (_ctx: MeasureContext, _domain: string, ids: Ref<Doc>[]): Promise<void> => {
    this.cleanCalls++
    for (const id of ids) {
      this.store.delete(id)
    }
  }
}

async function createMiddleware (ttl: number): Promise<{
  mw: TransientMiddleware
  adapter: FakeAdapter
  broadcasts: Tx[][]
  ctx: MeasureContext
  pipelineContext: PipelineContext
}> {
  const ctx = new MeasureMetricsContext('test', {})
  const hierarchy = new Hierarchy()
  const modelDb = new ModelDb(hierarchy)

  // We don't need to populate the model — tests drive ttlObjectMap directly.
  // Stub findAllSync so the constructor's TransientTTL lookup doesn't need a real model.
  ;(modelDb as any).findAllSync = (): any[] => []
  void ttl

  const adapter = new FakeAdapter()
  const broadcasts: Tx[][] = []

  const pipelineContext: PipelineContext = {
    workspace: { uuid: 'test-ws' as any, url: 'test', dataId: 'test' as any },
    hierarchy,
    modelDb,
    branding: null as any,
    adapterManager: {
      getAdapter: (_domain: string, _required: boolean): DbAdapter => adapter as unknown as DbAdapter
    } as any,
    storageAdapter: {} as any,
    contextVars: {},
    lastTx: '',
    lastHash: '',
    broadcastEvent: async (_c: MeasureContext, txes: Tx[]): Promise<void> => {
      broadcasts.push(txes)
    }
  }

  const mw = await TransientMiddleware.create(ctx, pipelineContext, undefined)
  return { mw, adapter, broadcasts, ctx, pipelineContext }
}

async function flush (): Promise<void> {
  // reduceCalls schedules the actual op asynchronously; flush microtasks until it settles.
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

describe('TransientMiddleware.checkTTL', () => {
  let env: Awaited<ReturnType<typeof createMiddleware>>

  afterEach(async () => {
    await env?.mw.close()
  })

  it('removes expired entries from ttlObjectMap after processing', async () => {
    env = await createMiddleware(2)
    const id = generateId<TransientDoc>()
    const doc: TransientDoc = {
      _id: id,
      _class: transientClass,
      space: transientSpace,
      modifiedOn: Date.now(),
      modifiedBy: core.account.System,
      payload: 'p'
    }
    env.adapter.put(doc)

    const map = (env.mw as any).ttlObjectMap as Map<Ref<Doc>, number>
    map.set(id, Date.now() / 1000 - 10) // already expired

    await (env.mw as any).checkTTL()
    await flush()

    expect(map.has(id)).toBe(false)
    expect(env.adapter.store.has(id)).toBe(false)
    expect(env.broadcasts.length).toBe(1)
    expect(env.broadcasts[0].length).toBe(1)
    expect(env.broadcasts[0][0]._class).toBe(core.class.TxRemoveDoc)
  })

  it('does not re-broadcast on repeated checkTTL ticks for same expired doc', async () => {
    env = await createMiddleware(2)
    const id = generateId<TransientDoc>()
    const doc: TransientDoc = {
      _id: id,
      _class: transientClass,
      space: transientSpace,
      modifiedOn: Date.now(),
      modifiedBy: core.account.System,
      payload: 'p'
    }
    env.adapter.put(doc)

    const map = (env.mw as any).ttlObjectMap as Map<Ref<Doc>, number>
    map.set(id, Date.now() / 1000 - 10)

    await (env.mw as any).checkTTL()
    await flush()
    await (env.mw as any).checkTTL()
    await flush()
    await (env.mw as any).checkTTL()
    await flush()

    expect(env.broadcasts.length).toBe(1)
    expect(env.adapter.loadCalls).toBe(1)
    expect(env.adapter.cleanCalls).toBe(1)
  })

  it('skips load/clean/broadcast when no entries are expired', async () => {
    env = await createMiddleware(2)
    const id = generateId<TransientDoc>()
    const map = (env.mw as any).ttlObjectMap as Map<Ref<Doc>, number>
    map.set(id, Date.now() / 1000 + 100) // far in the future

    await (env.mw as any).checkTTL()
    await flush()

    expect(env.broadcasts.length).toBe(0)
    expect(env.adapter.loadCalls).toBe(0)
    expect(env.adapter.cleanCalls).toBe(0)
    expect(map.has(id)).toBe(true)
  })

  it('does not broadcast when expired doc was already removed by client', async () => {
    env = await createMiddleware(2)
    const id = generateId<TransientDoc>()
    // Doc is NOT in adapter.store (already removed externally).
    const map = (env.mw as any).ttlObjectMap as Map<Ref<Doc>, number>
    map.set(id, Date.now() / 1000 - 10)

    await (env.mw as any).checkTTL()
    await flush()

    expect(env.broadcasts.length).toBe(0)
    expect(map.has(id)).toBe(false)
  })
})
