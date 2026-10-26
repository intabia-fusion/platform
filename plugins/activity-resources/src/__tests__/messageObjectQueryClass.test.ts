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

jest.mock('@hcengineering/presentation', () => ({}))
jest.mock('@hcengineering/view-resources', () => ({}))

// eslint-disable-next-line import/first
import { getMessageObjectQueryClass } from '../activityMessagesUtils'

const bugClass = 'class:Bug' as Ref<Class<Doc>>
const epicClass = 'class:Epic' as Ref<Class<Doc>>
const issueClass = 'tracker:class:Issue' as Ref<Class<Doc>>
const taskClass = 'task:class:Task' as Ref<Class<Doc>>
const removedObjectClass = 'class:RemovedBug' as Ref<Class<Doc>>
const removedContainerClass = 'class:RemovedEpic' as Ref<Class<Doc>>

function makeHierarchy (): Hierarchy {
  const isRemoved = (it: Ref<Class<Doc>>): boolean => it === removedObjectClass || it === removedContainerClass
  return {
    hasClass: (it: Ref<Class<Doc>>) => !isRemoved(it),
    getParentClass: (it: Ref<Class<Doc>>) => {
      if (isRemoved(it)) throw new Error('domain not found: ' + it)
      return it === bugClass || it === epicClass ? taskClass : it
    }
  } as unknown as Hierarchy
}

describe('getMessageObjectQueryClass', () => {
  it('looks the object up by the topmost class, so a doc that changed class is still found', () => {
    expect(getMessageObjectQueryClass(makeHierarchy(), { objectClass: bugClass, attachedToClass: issueClass })).toBe(
      taskClass
    )
  })

  it('keeps a class without a parent in the same domain as is', () => {
    expect(getMessageObjectQueryClass(makeHierarchy(), { objectClass: issueClass, attachedToClass: issueClass })).toBe(
      issueClass
    )
  })

  it('lifts the container class of a collection record when the class of the object was removed', () => {
    expect(
      getMessageObjectQueryClass(makeHierarchy(), { objectClass: removedObjectClass, attachedToClass: epicClass })
    ).toBe(taskClass)
  })

  it('returns the container class as is when both classes were removed', () => {
    expect(
      getMessageObjectQueryClass(makeHierarchy(), {
        objectClass: removedObjectClass,
        attachedToClass: removedContainerClass
      })
    ).toBe(removedContainerClass)
  })
})
