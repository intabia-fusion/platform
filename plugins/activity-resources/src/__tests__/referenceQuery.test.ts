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

import { type Class, type Doc, type Hierarchy, type Ref } from '@hcengineering/core'
import { getReferenceQueryClass } from '../referenceQuery'

const oldType = 'old-type' as Ref<Class<Doc>>
const taskClass = 'task:class:Task' as Ref<Class<Doc>>

describe('getReferenceQueryClass', () => {
  it('queries the domain parent so a source that changed type can still be found', () => {
    const getParentClass = jest.fn(() => taskClass)
    const hierarchy = {
      hasClass: () => true,
      getParentClass
    } as unknown as Hierarchy
    expect(getReferenceQueryClass(hierarchy, oldType)).toBe(taskClass)
    expect(getParentClass).toHaveBeenCalledWith(oldType)
  })

  it('does not resolve or query a deleted class', () => {
    const getParentClass = jest.fn(() => { throw new Error('ancestors not found') })
    const hierarchy = {
      hasClass: () => false,
      getParentClass
    } as unknown as Hierarchy
    expect(getReferenceQueryClass(hierarchy, oldType)).toBeUndefined()
    expect(getParentClass).not.toHaveBeenCalled()
  })

  it('keeps the root class of a domain', () => {
    const hierarchy = {
      hasClass: () => true,
      getParentClass: () => taskClass
    } as unknown as Hierarchy
    expect(getReferenceQueryClass(hierarchy, taskClass)).toBe(taskClass)
  })
})
