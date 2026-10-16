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

import core, { type Class, type Doc, type DocumentQuery, type Ref, type TxOperations } from '@hcengineering/core'
import { sortNamedCategories } from '../categorySorting'
import { concatCategories } from '../categoryUtils'

interface NamedDoc extends Doc {
  name?: string
  label?: string
}

const docRef = (id: string): Ref<Doc> => id as Ref<Doc>
const classRef = (id: string): Ref<Class<Doc>> => id as Ref<Class<Doc>>
const namedDoc = (id: string, name: string): NamedDoc => ({ _id: docRef(id), name }) as unknown as NamedDoc

function makeClient (opts: { typeClasses?: Array<Ref<Class<Doc>>>, modelDocs?: NamedDoc[], runtimeDocs?: NamedDoc[] }): {
  client: TxOperations
  findAll: jest.Mock
} {
  const typeClasses = new Set(opts.typeClasses ?? [])
  const modelDocs = opts.modelDocs ?? []
  const runtimeDocs = opts.runtimeDocs ?? []
  const byQuery = (docs: NamedDoc[], query: DocumentQuery<Doc>): NamedDoc[] => {
    const ids = (query._id as any)?.$in as Array<Ref<Doc>> | undefined
    return ids === undefined ? docs : docs.filter((d) => ids.includes(d._id))
  }
  const findAll = jest.fn(async (_class: Ref<Class<Doc>>, query: DocumentQuery<Doc>) => byQuery(runtimeDocs, query))
  const client = {
    getHierarchy: () => ({
      isDerived: (a: Ref<Class<Doc>>, b: Ref<Class<Doc>>) => (b === core.class.Type ? typeClasses.has(a) : false)
    }),
    getModel: () => ({
      findAllSync: (_class: Ref<Class<Doc>>, query: DocumentQuery<Doc>) => byQuery(modelDocs, query)
    }),
    findAll
  } as unknown as TxOperations
  return { client, findAll }
}

describe('sortNamedCategories', () => {
  const attrClass = classRef('test:class:Target')

  it('sorts by document name and keeps empty values at the end', async () => {
    const { client } = makeClient({
      runtimeDocs: [namedDoc('r1', 'Beta'), namedDoc('r2', 'Alpha')]
    })
    const res = await sortNamedCategories(client, attrClass, [docRef('r1'), null, docRef('r2'), undefined])
    expect(res).toEqual([docRef('r2'), docRef('r1'), null, undefined])
  })

  it('treats objects without a name as empty and keeps them last', async () => {
    const { client } = makeClient({})
    const empty = { name: undefined, values: [] }
    const res = await sortNamedCategories(client, attrClass, [{ name: 'Z' }, empty, { name: 'A' }])
    expect(res.map((c: any) => c.name)).toEqual(['A', 'Z', undefined])
    expect(res[2]).toBe(empty)
  })

  it('sorts by title when the document has no name or label (parent issues)', async () => {
    const titled = (id: string, title: string): NamedDoc => ({ _id: docRef(id), title }) as unknown as NamedDoc
    const { client } = makeClient({
      runtimeDocs: [titled('i1', 'Zeta'), titled('i2', 'alpha'), titled('i3', 'Beta')]
    })
    const res = await sortNamedCategories(client, attrClass, [docRef('i1'), undefined, docRef('i2'), docRef('i3')])
    expect(res).toEqual([docRef('i2'), docRef('i3'), docRef('i1'), undefined])
  })

  it('reads model-resident classes synchronously without an async query', async () => {
    const { client, findAll } = makeClient({
      modelDocs: [namedDoc('m1', 'Beta'), namedDoc('m2', 'Alpha')]
    })
    const res = await sortNamedCategories(client, attrClass, [docRef('m1'), docRef('m2')])
    expect(res).toEqual([docRef('m2'), docRef('m1')])
    expect(findAll).not.toHaveBeenCalled()
  })

  it('fetches only keys missing from the model (runtime fallback, e.g. projects)', async () => {
    const { client, findAll } = makeClient({
      modelDocs: [namedDoc('m1', 'Beta')],
      runtimeDocs: [namedDoc('p1', 'Alpha')]
    })
    const res = await sortNamedCategories(client, attrClass, [docRef('m1'), docRef('p1')])
    expect(res).toEqual([docRef('p1'), docRef('m1')])
    expect(findAll).toHaveBeenCalledTimes(1)
    expect(findAll).toHaveBeenCalledWith(attrClass, { _id: { $in: [docRef('p1')] } })
  })

  it('does not reorder numbers', async () => {
    const { client, findAll } = makeClient({ typeClasses: [core.class.TypeNumber as Ref<Class<Doc>>] })
    const res = await sortNamedCategories(client, core.class.TypeNumber, [3, 1, 2])
    expect(res).toEqual([3, 1, 2])
    expect(findAll).not.toHaveBeenCalled()
  })

  it('does not reorder booleans', async () => {
    const { client } = makeClient({ typeClasses: [core.class.TypeBoolean as Ref<Class<Doc>>] })
    const res = await sortNamedCategories(client, core.class.TypeBoolean, [true, false, true])
    expect(res).toEqual([true, false, true])
  })

  it('sorts primitive string categories by value without queries', async () => {
    const { client, findAll } = makeClient({ typeClasses: [core.class.TypeString as Ref<Class<Doc>>] })
    const res = await sortNamedCategories(client, core.class.TypeString, ['b', 'a', 'B'])
    expect(res).toEqual(['a', 'b', 'B'])
    expect(findAll).not.toHaveBeenCalled()
  })

  it('returns categories as is when there is nothing to sort', async () => {
    const { client } = makeClient({})
    const input = [null, undefined]
    const res = await sortNamedCategories(client, attrClass, input)
    expect(res).toEqual(input)
  })

  it('preserves undefined (empty category) in concatCategories', () => {
    const result = concatCategories(['u1', undefined], ['u2', undefined])
    expect(result).toStrictEqual(['u1', 'u2', undefined])
    expect(result.length).toBe(3)
  })
})
