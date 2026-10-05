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

import type { Doc, Ref } from '../classes'
import core from '../component'
import { Hierarchy } from '../hierarchy'
import { TxOperations } from '../operations'
import { genMinModel, test } from './minmodel'

describe('TxOperations.mixinDiffUpdate', () => {
  function prepare (): { ops: TxOperations, hierarchy: Hierarchy } {
    const hierarchy = new Hierarchy()
    for (const tx of genMinModel()) hierarchy.tx(tx)
    const client: any = { getHierarchy: () => hierarchy, tx: async () => ({}) }
    return { ops: new TxOperations(client, core.account.System), hierarchy }
  }

  it('keeps updated attributes under the mixin key, like TxMixin on the server', async () => {
    const { ops, hierarchy } = prepare()
    const doc = {
      _id: 'd1' as Ref<Doc>,
      _class: core.class.Doc,
      space: core.space.Model,
      [test.mixin.TestMixin]: { arr: ['a'] }
    }

    await ops.mixinDiffUpdate(doc as any, { arr: ['b'] } as any, test.mixin.TestMixin, core.account.System, 1)

    expect((doc as any)[test.mixin.TestMixin].arr).toEqual(['b'])
    expect((doc as any).arr).toBeUndefined()
    expect(hierarchy.as(doc as any, test.mixin.TestMixin).arr).toEqual(['b'])
  })

  it('keeps attributes of a newly created mixin under the mixin key', async () => {
    const { ops } = prepare()
    const doc = { _id: 'd1' as Ref<Doc>, _class: core.class.Doc, space: core.space.Model }

    await ops.mixinDiffUpdate(doc as any, { arr: ['a'] } as any, test.mixin.TestMixin, core.account.System, 1)

    expect((doc as any)[test.mixin.TestMixin]?.arr).toEqual(['a'])
    expect((doc as any).arr).toBeUndefined()
  })
})
