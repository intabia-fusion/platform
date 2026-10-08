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

import type { Class, Doc, Hierarchy, Ref } from '@hcengineering/core'
import type { DescendantAttribute } from '@hcengineering/view'

interface CustomAttributesPref {
  customAttributes?: string[]
  descendantAttributes?: DescendantAttribute[]
}

// Places `${oldMixin}.${attr}` keys of a mixin turned into newClass the way ViewletSetting stores newClass
// attributes. Needs no attribute in the hierarchy. Undefined if there are none or the viewlet is unrelated.
export function remapMixinCustomAttributes (
  hierarchy: Hierarchy,
  attachTo: Ref<Class<Doc>>,
  pref: CustomAttributesPref,
  oldMixin: string,
  newClass: Ref<Class<Doc>>
): Required<CustomAttributesPref> | undefined {
  const prefix = `${oldMixin}.`
  const stale = (pref.customAttributes ?? []).filter((key) => key.startsWith(prefix))
  if (stale.length === 0) return undefined
  const own = attachTo === newClass
  if (!own && !hierarchy.isDerived(newClass, attachTo)) return undefined

  const customAttributes = (pref.customAttributes ?? []).filter((key) => !key.startsWith(prefix))
  const descendantAttributes = [...(pref.descendantAttributes ?? [])]
  for (const key of stale) {
    const name = key.substring(prefix.length)
    if (own) {
      if (!customAttributes.includes(name)) customAttributes.push(name)
    } else if (!descendantAttributes.some((it) => it._class === newClass && it.key === name)) {
      descendantAttributes.push({ _class: newClass, key: name })
    }
  }
  return { customAttributes, descendantAttributes }
}
