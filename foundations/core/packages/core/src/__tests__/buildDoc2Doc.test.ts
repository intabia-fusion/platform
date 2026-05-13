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

import type { Ref } from '../classes'
import core from '../component'
import { TxProcessor } from '../tx'
import { createDoc, deleteDoc, updateDoc, type Task } from './minmodel'

describe('TxProcessor.buildDoc2Doc', () => {
  const taskClass = 'task.Task' as Ref<any>
  const space = core.space.Model

  it('empty txes -> undefined', () => {
    expect(TxProcessor.buildDoc2Doc([])).toBeUndefined()
  })

  it('[create] -> doc', () => {
    const create = createDoc<Task>(taskClass, { name: 'a', state: 0, number: 1 })
    const doc = TxProcessor.buildDoc2Doc<Task>([create])
    expect(doc).toBeDefined()
    expect(doc).not.toBeNull()
    expect(doc?._id).toBe(create.objectId)
    expect(doc?.name).toBe('a')
  })

  it('[create, update] -> doc with applied update', () => {
    const create = createDoc<Task>(taskClass, { name: 'a', state: 0, number: 1 })
    const update = updateDoc(taskClass, space, create.objectId, { name: 'b' })
    const doc = TxProcessor.buildDoc2Doc<Task>([create, update])
    expect(doc).toBeDefined()
    expect(doc?.name).toBe('b')
  })

  it('[create, update, remove] -> null (remove wins)', () => {
    const create = createDoc<Task>(taskClass, { name: 'a', state: 0, number: 1 })
    const update = updateDoc(taskClass, space, create.objectId, { name: 'b' })
    const remove = deleteDoc(taskClass, space, create.objectId)
    expect(TxProcessor.buildDoc2Doc([create, update, remove])).toBeNull()
  })

  it('[create, remove] -> null (remove wins even right after create)', () => {
    const create = createDoc<Task>(taskClass, { name: 'a', state: 0, number: 1 })
    const remove = deleteDoc(taskClass, space, create.objectId)
    expect(TxProcessor.buildDoc2Doc([create, remove])).toBeNull()
  })

  it('[remove] alone -> null (remove always wins; deletion is NOT lost across batches)', () => {
    const remove = deleteDoc(taskClass, space, 'task1' as Ref<Task>)
    // Important: buildDoc2Doc checks remove FIRST, so even if the create was in
    // a previous batch and only the remove tx arrives now, the result is null,
    // and loadDocsFromTx puts it into toRemove correctly.
    expect(TxProcessor.buildDoc2Doc([remove])).toBeNull()
  })

  it('[update] alone -> undefined (no create -> docsToRetrieve path)', () => {
    // When only an update arrives in a batch (no create, no remove), we need
    // to retrieve the actual doc from storage to apply the update on top.
    const update = updateDoc(taskClass, space, 'task1' as Ref<Task>, { name: 'b' })
    expect(TxProcessor.buildDoc2Doc([update])).toBeUndefined()
  })

  it('[update, remove] -> null', () => {
    const update = updateDoc(taskClass, space, 'task1' as Ref<Task>, { name: 'b' })
    const remove = deleteDoc(taskClass, space, 'task1' as Ref<Task>)
    expect(TxProcessor.buildDoc2Doc([update, remove])).toBeNull()
  })

  it('[remove, create] (unusual order) -> null (remove wins regardless of position)', () => {
    // buildDoc2Doc uses .find for both create and remove - order in array does
    // not matter as long as a remove tx is present.
    const create = createDoc<Task>(taskClass, { name: 'a', state: 0, number: 1 })
    const remove = deleteDoc(taskClass, space, create.objectId)
    expect(TxProcessor.buildDoc2Doc([remove, create])).toBeNull()
  })
})
