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

import type { IntlString } from '@hcengineering/platform'

import type { AnySvelteComponent, IconComponent, IconSize, LabelAndProps } from '../../types'
import type { ButtonAttributes } from '../button/types'
import type {
  SelectButtonChevron,
  SelectButtonJustify,
  SelectButtonKind,
  SelectButtonSize
} from '../select-button/types'

export type DropdownItemId = string | number

export interface DropdownItem<Id extends DropdownItemId = DropdownItemId> {
  id: Id
  /** A text label goes through `getEmbeddedLabel`. */
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  /** A second line under the label in the list. */
  description?: IntlString
  descriptionParams?: Record<string, any>
  /** With `multiselect`, choosing it clears the others and choosing another clears it. */
  exclusive?: boolean
  /** A line above the item in the list. */
  divider?: boolean
  /** A group heading above the item in the list. */
  heading?: IntlString
  /** Markup of the row in the list instead of the label; the trigger draws it only through the `value` slot. */
  component?: AnySvelteComponent
  componentProps?: Record<string, any>
  /**
   * Items of a submenu: it opens on hover, ArrowRight or click; its first row is this item, chosen like any other.
   * Single choice only; search lists every level flat, with the parents in the second line.
   */
  children?: Array<DropdownItem<Id>>
}

/** Between the chosen values with `multiselect`: `dot` (default), `comma` or `none` - only a gap. */
export type DropdownSeparator = 'dot' | 'comma' | 'none'

/** `Selected` is the id type, or an array of ids with `multiselect`. */
export interface DropdownProps<Id extends DropdownItemId = DropdownItemId, Selected extends Id | Id[] = Id>
  extends ButtonAttributes {
  items: Array<DropdownItem<Id>>
  /** One id, or an array of them with `multiselect`. */
  selected?: Selected
  /** The popup stays open and toggles items; the trigger lists the chosen ones. */
  multiselect?: boolean
  separator?: DropdownSeparator
  /** Shown while nothing is chosen. */
  placeholder?: IntlString
  /** Icon of the trigger when the chosen item has none, and of the placeholder. */
  icon?: IconComponent
  iconSize?: IconSize
  iconProps?: Record<string, any>
  /** Label params of the items that have no `labelParams` of their own. */
  itemParams?: Record<string, any>
  kind?: SelectButtonKind
  size?: SelectButtonSize
  /** On by default. */
  chevron?: SelectButtonChevron
  withSearch?: boolean
  /** Chooses the first item while `selected` is `undefined`. */
  autoSelect?: boolean
  /**
   * Single choice: clicking the chosen item again clears it (`deselected`, `selected` becomes `undefined`).
   * Multiple choice: the last chosen item can be unchecked too. Defaults to `multiselect`.
   */
  allowDeselect?: boolean
  /** A long value wraps onto more lines instead of the ellipsis. */
  wrap?: boolean
  /** A wider list for long rows: `wide` - 32rem, `x-wide` - 40rem. */
  popupWidth?: 'wide' | 'x-wide'
  /** Stretches to the width of the place. */
  fullWidth?: boolean
  justify?: SelectButtonJustify
  disabled?: boolean
  loading?: boolean
  tooltip?: LabelAndProps
  focusIndex?: number
  element?: HTMLButtonElement
}

export interface DropdownEvents<Selected extends DropdownItemId | DropdownItemId[] = DropdownItemId> {
  /** `detail` is the id, or the array of ids with `multiselect`. */
  selected: CustomEvent<Selected>
  /** The chosen item was clicked again with `allowDeselect`; `null`: a DOM event detail cannot be `undefined`. */
  deselected: CustomEvent<null>
}

export interface DropdownSlots<Id extends DropdownItemId = DropdownItemId> {
  /** Markup of the value; shown while something is chosen, the placeholder otherwise. */
  value: { items: Array<DropdownItem<Id>> }
}
