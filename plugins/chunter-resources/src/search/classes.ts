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

import activity from '@hcengineering/activity'
import { type Class, type Doc, type Ref } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import chunter from '@hcengineering/chunter'

export function getActivityDocClasses (): Array<Ref<Class<Doc>>> {
  const hierarchy = getClient().getHierarchy()

  return hierarchy.getMixinClasses(activity.mixin.ActivityDoc).filter((_class) => {
    try {
      const clazz = hierarchy.getClass(_class)
      return hierarchy.hasMixin(clazz, activity.mixin.ActivityDoc)
    } catch (err: any) {
      // Ignore missing classes
      return false
    }
  })
}

const PRIMARY_CLASSES: Array<Ref<Class<Doc>>> = [
  chunter.class.Channel,
  chunter.class.DirectMessage,
  'tracker:class:Issue',
  'document:class:Document'
] as Array<Ref<Class<Doc>>>

export function splitPrimaryClasses (classes: Array<Ref<Class<Doc>>>): {
  primary: Array<Ref<Class<Doc>>>
  rest: Array<Ref<Class<Doc>>>
} {
  const available = new Set(classes)
  const primary = PRIMARY_CLASSES.filter((c) => available.has(c))
  const primarySet = new Set(primary)

  return { primary, rest: classes.filter((c) => !primarySet.has(c)) }
}

export function expandClasses (classes: Array<Ref<Class<Doc>>>): Array<Ref<Class<Doc>>> {
  const hierarchy = getClient().getHierarchy()
  const result = new Set<Ref<Class<Doc>>>()

  for (const _class of classes) {
    result.add(_class)
    try {
      for (const descendant of hierarchy.getDescendants(_class)) {
        result.add(descendant)
      }
    } catch (err: any) {
      // Ignore missing classes
    }
  }

  return Array.from(result)
}
