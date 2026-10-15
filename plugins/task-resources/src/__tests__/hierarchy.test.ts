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
import { addParentTo, cannotBeCreated, getAncestorLevels, getChildTypes, removeParentFrom } from '../hierarchy'

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

  it('does not count ids of deleted types as selected types', () => {
    const x = tt('x', ['a', 'deleted'])
    expect(addParentTo(x, 'b' as Ref<TaskType>, [a, b, x])).toEqual({
      allowAnyParent: false,
      allowedAsChildOf: ['a', 'deleted', 'b']
    })
    const y = tt('y', ['a', 'deleted', 'y'])
    expect(addParentTo(y, 'b' as Ref<TaskType>, [a, b, y]).allowAnyParent).toBe(true)
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

describe('cannotBeCreated', () => {
  const a = tt('a')
  const b = tt('b', ['a'])
  const all = [a, b]
  const nonRoot = (t: TaskType): TaskType => ({ ...t, isRootTaskType: false })
  // The state of `child` after `parent` is removed from its parents, as in the hierarchy editor
  const afterRemoval = (child: TaskType, parent: string): TaskType => ({
    ...child,
    ...removeParentFrom(child, parent as Ref<TaskType>, all)
  })

  it('is false for root types, any-parent types and types with an existing parent', () => {
    expect(cannotBeCreated(tt('x'), all)).toBe(false)
    expect(cannotBeCreated({ ...tt('x'), isRootTaskType: true }, all)).toBe(false)
    expect(cannotBeCreated(nonRoot(tt('x', [], true)), all)).toBe(false)
    expect(cannotBeCreated(nonRoot(tt('x', ['a'])), all)).toBe(false)
  })

  it('is true for a non-root type without parents', () => {
    expect(cannotBeCreated(nonRoot(tt('x')), all)).toBe(true)
  })

  it('does not treat ids of deleted types as parents', () => {
    expect(cannotBeCreated(nonRoot(tt('x', ['deleted'])), all)).toBe(true)
    expect(cannotBeCreated(nonRoot(tt('x', ['deleted', 'a'])), all)).toBe(false)
  })

  it('detects the removal of the last parent of a non-root type', () => {
    expect(cannotBeCreated(afterRemoval(nonRoot(tt('x', ['a'])), 'a'), all)).toBe(true)
    expect(cannotBeCreated(afterRemoval(nonRoot(tt('x', ['a', 'deleted'])), 'a'), all)).toBe(true)
    expect(cannotBeCreated(afterRemoval(nonRoot(tt('x', ['a', 'b'])), 'a'), all)).toBe(false)
    expect(cannotBeCreated(afterRemoval(nonRoot(tt('x', [], true)), 'a'), all)).toBe(false)
    expect(cannotBeCreated(afterRemoval(tt('x', ['a']), 'a'), all)).toBe(false)
  })
})
