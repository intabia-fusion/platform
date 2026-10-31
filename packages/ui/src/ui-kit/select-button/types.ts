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

import type { IconComponent, IconSize, LabelAndProps } from '../../types'
import type { ButtonAttributes, ButtonKind, ButtonSize } from '../button/types'

/**
 * `secondary` - a chip in dialogs and forms; `ghost` - a value in an attribute panel or a table cell;
 * `primary` and `brand` - an accented choice in a toolbar; `chip` - an oval pill of a list row, no chevron.
 */
export type SelectButtonKind = Extract<ButtonKind, 'secondary' | 'ghost' | 'primary' | 'brand' | 'chip'>

export type SelectButtonSize = Exclude<ButtonSize, 'min' | 'extra-large'>

/** Where the value text sits when the button is wider than it, as with `fullWidth`; the chevron stays at the end. */
export type SelectButtonJustify = 'start' | 'center'

/** `hover` keeps the room for the chevron and shows it on hover, focus and while the popup is open. */
export type SelectButtonChevron = boolean | 'hover'

export interface SelectButtonProps extends ButtonAttributes {
  kind?: SelectButtonKind
  size?: SelectButtonSize
  /** The value; a name or a date goes through `getEmbeddedLabel`. Markup values go to the default slot. */
  label?: IntlString
  labelParams?: Record<string, any>
  /** Shown while there is no value. */
  placeholder?: IntlString
  /** No value: defaults to no `label` and no slot; set it when the slot is always there. */
  empty?: boolean
  /** Icon of the value or, while empty, of the placeholder. */
  icon?: IconComponent
  iconProps?: Record<string, any>
  iconSize?: IconSize
  chevron?: SelectButtonChevron
  /** The popup is open (`aria-expanded`). */
  pressed?: boolean
  /** Stretches to the width of the place: the value starts at the left, the chevron sits at the right end. */
  fullWidth?: boolean
  /** `center` - the value text in the middle; `start` (default) - at the start. */
  justify?: SelectButtonJustify
  /** A long value wraps onto more lines; the button grows from its size's height. */
  wrap?: boolean
  /** A value of a form: with `secondary` takes the fill and border of the text fields (`--input-*`) instead of a button's. */
  field?: boolean
  disabled?: boolean
  loading?: boolean
  tooltip?: LabelAndProps
  autofocus?: boolean
  focusIndex?: number
  stopPropagation?: boolean
  element?: HTMLButtonElement
}
