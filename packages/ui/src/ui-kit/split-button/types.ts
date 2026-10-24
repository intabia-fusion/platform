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

import type { IntlString } from '@hcengineering/platform'

import type { DropdownIntlItem, IconComponent, IconSize, LabelAndProps } from '../../types'
import type { ButtonAttributes, ButtonKind, ButtonSize } from '../button/types'

/**
 * Without a fill or a border (`tertiary`, the state ghost kinds) the halves would not read as two; `ghost` gets a divider
 * between them instead, for a quiet secondary action (add a sub-issue).
 */
export type SplitButtonKind = Exclude<ButtonKind, 'tertiary' | 'positive-ghost' | 'negative-ghost'>

export type SplitButtonSize = Exclude<ButtonSize, 'min'>

/** A main action and a menu of related ones, joined into one control. Attributes go to the main button. */
export interface SplitButtonProps<Id extends DropdownIntlItem['id'] = DropdownIntlItem['id']> extends ButtonAttributes {
  kind?: SplitButtonKind
  size?: SplitButtonSize
  label?: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  /** Size of the main button's icon; by default the size of the button decides. */
  iconSize?: IconSize
  iconProps?: Record<string, any>
  tooltip?: LabelAndProps
  loading?: boolean
  disabled?: boolean
  /** Without it only the main button shows, so a list of one action needs no menu. */
  hasMenu?: boolean
  /** Related actions: the menu button opens them as a list and reports the chosen one through `selected`. */
  items?: Array<DropdownIntlItem<Id>>
  /** A menu popup the place opens itself (without `items`) is open: `aria-expanded` on the menu button. */
  menuPressed?: boolean
  /** Names the menu button; defaults to "More options". */
  menuTooltip?: LabelAndProps
  /** The chevron points down by default; a control bar at the bottom of the screen opens its menu upwards. */
  menuIcon?: IconComponent
  /** Stretches to the width of the place; the main button takes the room. */
  fill?: boolean
  /** Aligns the main button content to the start, for a full-width button in a side panel. */
  alignStart?: boolean
  focusIndex?: number
  element?: HTMLButtonElement
}

export interface SplitButtonEvents<Id extends DropdownIntlItem['id'] = DropdownIntlItem['id']> {
  click: MouseEvent
  /** The menu button was clicked without `items`; `detail` is its click, to anchor the place's own popup. */
  menu: CustomEvent<MouseEvent>
  /** An item from `items` was chosen. */
  selected: CustomEvent<Id>
}
