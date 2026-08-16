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

import type { Class, Data, Doc, Obj, Ref } from '../classes'
import { ClassifierKind, DOMAIN_MODEL } from '../classes'
import core from '../component'
import { Hierarchy } from '../hierarchy'
import { MeasureMetricsContext } from '@hcengineering/measurements'
import { ModelDb } from '../memdb'
import type { Tx } from '../tx'
import { TxFactory } from '../tx'

const ctx = new MeasureMetricsContext('test', {})
const factory = new TxFactory(core.account.System)

const PARENT = 'test:class:Parent' as Ref<Class<Doc>>

function classTx (_id: Ref<Class<Obj>>, ext: Ref<Class<Obj>>): Tx {
  return factory.createTxCreateDoc(
    core.class.Class,
    core.space.Model,
    { kind: ClassifierKind.CLASS, extends: ext, label: '' as any, domain: DOMAIN_MODEL } as unknown as Data<Class<Obj>>,
    _id
  )
}

// Mirrors the real model: core:class:Obj is an instance of core:class:Class, created later.
function baseModel (): Tx[] {
  return [
    classTx(core.class.Obj, undefined as unknown as Ref<Class<Obj>>),
    classTx(core.class.Doc as Ref<Class<Obj>>, core.class.Obj),
    classTx(core.class.Class as Ref<Class<Obj>>, core.class.Doc as Ref<Class<Obj>>)
  ]
}

describe('hierarchy derives chains regardless of tx order', () => {
  it('keeps unknown classifiers non-derived instead of throwing', () => {
    const h = new Hierarchy()
    for (const tx of baseModel()) h.tx(tx)

    expect(h.isDerived('no:such:class' as Ref<Class<Doc>>, core.class.Doc)).toBe(false)
    expect(() => h.getAncestors('no:such:class' as Ref<Class<Doc>>)).toThrow()
  })
})

describe('ModelDb owns model documents', () => {
  function build (txes: Tx[]): { h: Hierarchy, db: ModelDb } {
    const h = new Hierarchy()
    for (const tx of txes) h.tx(tx)
    const db = new ModelDb(h)
    db.addTxes(ctx, txes, true)
    return { h, db }
  }

  it('indexes a document whose class is created later', () => {
    const { db } = build(baseModel())

    expect(db.findAllSync(core.class.Class, {}).map((it) => it._id)).toEqual([
      core.class.Obj,
      core.class.Doc,
      core.class.Class
    ])
    expect(db.findAllSync(core.class.Doc, { _id: core.class.Obj })).toHaveLength(1)
  })

  it('does not double-apply $push on a shared classifier', () => {
    const txes = [...baseModel(), classTx(PARENT, core.class.Doc)]
    const { h, db } = build(txes)
    const push = factory.createTxUpdateDoc(core.class.Class, core.space.Model, PARENT, {
      $push: { implements: 'test:interface:Marker' }
    } as any)

    // both structures see the tx, exactly as ModelMiddleware feeds them
    h.tx(push)
    db.addTxes(ctx, [push], true)

    expect((h.getClass(PARENT).implements ?? []).length).toBe(1)
  })

  it('keeps hierarchy self-sufficient without a ModelDb', () => {
    const h = new Hierarchy()
    for (const tx of [...baseModel(), classTx(PARENT, core.class.Doc)]) h.tx(tx)
    h.tx(factory.createTxUpdateDoc(core.class.Class, core.space.Model, PARENT, { label: 'solo' as any }))

    expect(h.getClass(PARENT).label).toBe('solo')
  })
})
