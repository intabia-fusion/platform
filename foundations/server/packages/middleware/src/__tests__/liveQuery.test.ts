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
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  TxFactory,
  TxProcessor,
  toFindResult,
  type Doc,
  type Domain,
  type Space,
  type Tx,
  type TxCreateDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { Middleware, PipelineContext } from '@hcengineering/server-core'
import { LiveQueryMiddleware } from '../liveQuery'

type Counted = Space & { counter: number }

const factory = new TxFactory(core.account.System)
const ctx = new MeasureMetricsContext('test', {})

async function buildModel (): Promise<{ hierarchy: Hierarchy, modelDb: ModelDb }> {
  const txes = [
    factory.createTxCreateDoc(
      core.class.Class,
      core.space.Model,
      { label: 'Obj' as any, kind: ClassifierKind.CLASS },
      core.class.Obj
    ),
    factory.createTxCreateDoc(
      core.class.Class,
      core.space.Model,
      { label: 'Doc' as any, extends: core.class.Obj, kind: ClassifierKind.CLASS },
      core.class.Doc
    ),
    factory.createTxCreateDoc(
      core.class.Class,
      core.space.Model,
      { label: 'Class' as any, extends: core.class.Doc, kind: ClassifierKind.CLASS, domain: 'model' as Domain },
      core.class.Class
    ),
    factory.createTxCreateDoc(
      core.class.Class,
      core.space.Model,
      { label: 'Space' as any, extends: core.class.Doc, kind: ClassifierKind.CLASS, domain: 'space' as Domain },
      core.class.Space
    )
  ]
  const hierarchy = new Hierarchy()
  const modelDb = new ModelDb(hierarchy)
  for (const tx of txes) hierarchy.tx(tx)
  for (const tx of txes) await modelDb.tx(tx)
  return { hierarchy, modelDb }
}

/**
 * Storage below the live query. `hold()` keeps the next `tx` open after (`writeFirst`) or before its
 * write until `release` - the window in which a trigger's `queryFind` can register.
 */
function storage (writeFirst: boolean): {
  next: Middleware
  hold: () => { inWindow: Promise<void>, release: () => void }
} {
  const stored: Doc[] = []
  let held: { entered: () => void, gate: Promise<void> } | undefined
  const write = (txes: Tx[]): void => {
    for (const tx of txes) {
      if (tx._class === core.class.TxCreateDoc) {
        stored.push(TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>))
      } else if (tx._class === core.class.TxUpdateDoc) {
        const i = stored.findIndex((it) => it._id === (tx as TxUpdateDoc<Doc>).objectId)
        stored[i] = TxProcessor.updateDoc2Doc(stored[i], tx as TxUpdateDoc<Doc>)
      }
    }
  }
  const next: any = {
    tx: async (_: unknown, txes: Tx[]) => {
      const h = held
      held = undefined
      if (writeFirst) write(txes)
      h?.entered()
      await h?.gate
      if (!writeFirst) write(txes)
      return {}
    },
    findAll: async () => toFindResult(stored.map((it) => ({ ...it })))
  }
  const hold = (): { inWindow: Promise<void>, release: () => void } => {
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const inWindow = new Promise<void>((resolve) => {
      entered = resolve
    })
    held = { entered, gate }
    return { inWindow, release }
  }
  return { next, hold }
}

async function middleware (next: Middleware): Promise<LiveQueryMiddleware> {
  const { hierarchy, modelDb } = await buildModel()
  const context: Partial<PipelineContext> = { hierarchy, modelDb }
  return new LiveQueryMiddleware(ctx, context as PipelineContext, next)
}

function createSpace (): TxCreateDoc<Counted> {
  return factory.createTxCreateDoc<Counted>(core.class.Space as any, core.space.Space, {
    name: 'person space',
    description: '',
    private: false,
    archived: false,
    members: [],
    counter: 0
  })
}

describe('LiveQueryMiddleware', () => {
  it('a query registered while a create is being stored still gets the created doc', async () => {
    const db = storage(false)
    const mw = await middleware(db.next)

    const create = createSpace()
    const window = db.hold()
    const done = mw.tx(ctx, [create])
    await window.inWindow
    // Registered before the write lands, so its load cannot see the doc.
    expect(await mw.liveQuery.queryFind(core.class.Space, {})).toHaveLength(0)
    window.release()
    await done

    const found = await mw.liveQuery.queryFind(core.class.Space, {})
    expect(found.map((it) => it._id)).toEqual([create.objectId])
  })

  it('a query loaded after the write does not get the created doc twice', async () => {
    const db = storage(true)
    const mw = await middleware(db.next)

    const window = db.hold()
    const done = mw.tx(ctx, [createSpace()])
    await window.inWindow
    expect(await mw.liveQuery.queryFind(core.class.Space, {})).toHaveLength(1)
    window.release()
    await done

    expect(await mw.liveQuery.queryFind(core.class.Space, {})).toHaveLength(1)
  })

  it('a query loaded after the write does not apply the same $inc twice', async () => {
    const db = storage(true)
    const mw = await middleware(db.next)
    const create = createSpace()
    await mw.tx(ctx, [create])

    const inc = factory.createTxUpdateDoc<Counted>(core.class.Space as any, core.space.Space, create.objectId, {
      $inc: { counter: 1 }
    })
    inc.modifiedOn = create.modifiedOn + 1000
    const window = db.hold()
    const done = mw.tx(ctx, [inc])
    await window.inWindow
    expect(((await mw.liveQuery.queryFind(core.class.Space, {}))[0] as Counted).counter).toBe(1)
    window.release()
    await done

    expect(((await mw.liveQuery.queryFind(core.class.Space, {}))[0] as Counted).counter).toBe(1)
  })
})
