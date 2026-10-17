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
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type { Ref } from '@hcengineering/core'
import type { TaskType } from '@hcengineering/task'
import { addParentTo, getAncestorLevels, getChildTypes, removeParentFrom } from '../hierarchy'

function tt (id: string, parents: string[] = [], any = false): TaskType {
  return {
    _id: id as Ref<TaskType>,
    name: id,
    allowedAsChildOf: parents as Array<Ref<TaskType>>,
    allowAnyParent: any
  } as any
}

const ids = (levels: ReturnType<typeof getAncestorLevels>): string[][] => levels.map((l) => l.types.map((t) => t._id))

describe('getAncestorLevels', () => {
  it('returns levels topmost first', () => {
    const a = tt('a')
    const b = tt('b', ['a'])
    const c = tt('c', ['b'])
    const d = tt('d', ['c'])
    expect(ids(getAncestorLevels(d, [a, b, c, d]))).toEqual([['a'], ['b']])
  })

  it('shows each type once at its closest level', () => {
    const a = tt('a')
    const b = tt('b', ['a'])
    const c = tt('c', ['a', 'b'])
    const d = tt('d', ['b', 'c'])
    expect(ids(getAncestorLevels(d, [a, b, c, d]))).toEqual([['a']])
  })

  it('terminates on cycles and self reference', () => {
    const a = tt('a', ['b'])
    const b = tt('b', ['a'])
    const c = tt('c', ['c', 'a'])
    expect(ids(getAncestorLevels(c, [a, b, c]))).toEqual([['b']])
  })

  it('stops at an any-parent level', () => {
    const a = tt('a')
    const b = tt('b', [], true)
    const c = tt('c', ['b'])
    const levels = getAncestorLevels(c, [a, b, c])
    expect(levels).toEqual([{ any: true, types: [] }])
  })

  it('has no ancestors when the type itself allows any parent', () => {
    const a = tt('a')
    expect(getAncestorLevels(tt('b', [], true), [a])).toEqual([])
  })
})

describe('getChildTypes', () => {
  it('includes explicit children, any-parent types and itself when allowed', () => {
    const a = tt('a', ['a'])
    const b = tt('b', ['a'])
    const c = tt('c', [], true)
    const d = tt('d', ['b'])
    expect(getChildTypes(a, [a, b, c, d]).map((t) => t._id)).toEqual(['a', 'b', 'c'])
  })
})

describe('addParentTo / removeParentFrom', () => {
  const a = tt('a')
  const b = tt('b', ['a'])
  const c = tt('c', [], true)
  const all = [a, b, c]

  it('adds a parent without duplicates', () => {
    expect(addParentTo(b, 'c' as Ref<TaskType>, all)).toEqual({ allowAnyParent: false, allowedAsChildOf: ['a', 'c'] })
    expect(addParentTo(b, 'a' as Ref<TaskType>, all).allowedAsChildOf).toEqual(['a'])
  })

  it('turns on allowAnyParent when every type is selected', () => {
    const t = tt('b', ['a', 'b'])
    expect(addParentTo(t, 'c' as Ref<TaskType>, all)).toEqual({
      allowAnyParent: true,
      allowedAsChildOf: ['a', 'b', 'c']
    })
  })

  it('removes a parent', () => {
    expect(removeParentFrom(tt('b', ['a', 'c']), 'a' as Ref<TaskType>, all)).toEqual({
      allowAnyParent: false,
      allowedAsChildOf: ['c']
    })
  })

  it('expands any-parent into all types except the removed one', () => {
    expect(removeParentFrom(c, 'b' as Ref<TaskType>, all)).toEqual({
      allowAnyParent: false,
      allowedAsChildOf: ['a', 'c']
    })
  })
})
