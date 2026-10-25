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

import type { IconComponent } from '@hcengineering/ui'
import type { ComponentConstructorOptions } from 'svelte'
import Icon from './Icon.svelte'
import { kitIcons } from './icons'
import { productIcon } from './productIcon'
import type { IconName } from './types'

const drawn = new Map<IconName, IconComponent>()

// Product components take an icon component, so a hand-drawn icon becomes a component with its name bound
export function kitIcon (name: IconName | undefined): IconComponent | undefined {
  if (name === undefined) return undefined
  if (kitIcons[name] === undefined) return productIcon(name)
  let bound = drawn.get(name)
  if (bound === undefined) {
    bound = class extends Icon {
      constructor (options: ComponentConstructorOptions<any>) {
        super({ ...options, props: { ...options.props, name, size: 16 } })
      }
    }
    drawn.set(name, bound)
  }
  return bound
}
