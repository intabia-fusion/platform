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

import type { IconComponent, IconSize } from '../../types'
import type { ButtonShape } from '../button/types'

/** Heights match the kit buttons of the same name; `small` by default, as next to a title field. */
export type IconBoxSize = 'large' | 'medium' | 'small' | 'extra-small'

export interface IconBoxProps {
  icon: IconComponent
  iconProps?: Record<string, any>
  /** `small` by default at every box size. */
  iconSize?: IconSize
  size?: IconBoxSize
  /** `rectangle` by default, as the buttons of the same size. */
  shape?: ButtonShape
  /** A palette color name (`getPlatformColorByName`): a soft tinted plate instead of the button look. */
  color?: string
}
