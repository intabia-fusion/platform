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

import core, {
  type Doc,
  type RefTo,
  type AnyAttribute,
  type Hierarchy,
  type Collection,
  type AttachedDoc,
  type Ref,
  type Class
} from '@hcengineering/core'
import { translate } from '@hcengineering/platform'
import { type IconComponent } from '@hcengineering/ui'
import { getClient } from '@hcengineering/presentation'

export interface DisplayAttribute {
  id: string
  label: string
  collection: boolean
  icon?: IconComponent
  iconProps?: Record<string, any>
}

const buildAttributeDisplayItem = async (
  hierarchy: Hierarchy,
  it: AnyAttribute,
  collection: boolean,
  lang: string
): Promise<DisplayAttribute> => {
  if (hierarchy.isDerived(it.type._class, core.class.RefTo)) {
    const refTo = it.type as RefTo<Doc>
    const toClass = hierarchy.findClass(refTo.to)
    return {
      id: it._id,
      label: await translate(it.label, {}, lang),
      icon: it.icon ?? toClass?.icon ?? it.type?.icon,
      iconProps: it.iconProps,
      collection
    }
  } else if (hierarchy.isDerived(it.type._class, core.class.Collection)) {
    const refTo = it.type as Collection<AttachedDoc>
    const ofClass = hierarchy.findClass(refTo.of)
    return {
      id: it._id,
      label: await translate(it.label, {}, lang),
      icon: it.icon ?? ofClass?.icon ?? it.type?.icon,
      iconProps: it.iconProps,
      collection
    }
  }
  return {
    id: it._id,
    label: await translate(it.label, {}, lang),
    icon: it.icon ?? it.type?.icon,
    iconProps: it.iconProps,
    collection
  }
}

export async function getDisplayAttributes (
  _class: Ref<Class<Doc>>,
  lang: string
): Promise<{
    regular: DisplayAttribute[]
    collection: DisplayAttribute[]
  }> {
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const attrs = Array.from(hierarchy.getAllAttributes(_class).values()).filter(
    (it) => it.hidden !== true && it.readonly !== true
  )

  const regularAttrs: typeof attrs = []
  const collectionAttrs: typeof attrs = []

  for (const it of attrs) {
    if (hierarchy.isDerived(it.type._class, core.class.Collection) || it.type._class === core.class.ArrOf) {
      collectionAttrs.push(it)
    } else {
      regularAttrs.push(it)
    }
  }

  const regularItems = await Promise.all(
    regularAttrs.map(async (it) => await buildAttributeDisplayItem(hierarchy, it, false, lang))
  )
  const collectionItems = await Promise.all(
    collectionAttrs.map(async (it) => await buildAttributeDisplayItem(hierarchy, it, true, lang))
  )

  regularItems.sort((a, b) => a.label.localeCompare(b.label, lang))
  collectionItems.sort((a, b) => a.label.localeCompare(b.label, lang))

  return {
    regular: regularItems,
    collection: collectionItems
  }
}
