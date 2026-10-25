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

// Only the plugins whose icons the kit uses are globbed: other icon folders pull in heavy dependencies
// Icon of the product components by kit icon name: a sprite fragment ('tracker/parent-issue'), a ui Svelte icon ('ui/Mixin')
// or a kit sprite icon ('kit/Camera')
import type { Asset } from '@hcengineering/platform'
import ui from '@hcengineering/ui'
import type { ComponentType } from 'svelte'
import { spriteAssets } from '../setup'
import type { IconName } from './types'

const uiIcons = import.meta.glob<ComponentType>('../../../../../packages/ui/src/components/icons/*.svelte', {
  eager: true,
  import: 'default'
})
const pluginIcons = import.meta.glob<ComponentType>(
  '../../../../../plugins/{contact,setting,text-editor,chunter,media}-resources/src/components/icons/*.svelte',
  { eager: true, import: 'default' }
)

export function productIcon (name: IconName | undefined): Asset | ComponentType | undefined {
  if (name === undefined) return undefined
  const [ns, id] = name.split('/')
  if (ns === 'kit') return (ui.icon as Record<string, Asset>)[id]
  if (ns === 'ui') return uiIcons[`../../../../../packages/ui/src/components/icons/${id}.svelte`]
  return (
    spriteAssets.get(name.toLowerCase()) ??
    pluginIcons[`../../../../../plugins/${ns}-resources/src/components/icons/${id}.svelte`]
  )
}
