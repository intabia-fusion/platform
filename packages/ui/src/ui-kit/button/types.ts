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
import type { AriaAttributes } from 'svelte/elements'

import type { DropdownIntlItem, IconComponent, IconSize, LabelAndProps, TooltipWithLabel } from '../../types'

export type ButtonKind = 'primary' | 'secondary' | 'tertiary' | 'negative'

/** `min` is for icon-only buttons. */
export type ButtonSize = 'large' | 'medium' | 'small' | 'extra-small' | 'min'

export type ButtonShape = 'rectangle' | 'round'

export type ButtonType = 'button' | 'submit' | 'reset'

/** Attributes passed through to the native `<button>`; `class` and `style` are deliberately not among them. */
export interface ButtonAttributes extends AriaAttributes {
  id?: string
  name?: string
  value?: string
  form?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface ButtonProps extends ButtonAttributes {
  kind?: ButtonKind
  size?: ButtonSize
  shape?: ButtonShape
  type?: ButtonType
  /** Text of the button; custom content goes to the default slot instead. */
  label?: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  /** Defaults to `medium` next to a label and `small` for icon-only and menu buttons. */
  iconSize?: IconSize
  iconProps?: Record<string, any>
  loading?: boolean
  disabled?: boolean
  /** Toggle state: `undefined` for a plain button, `true`/`false` for a toggle (`aria-pressed`). */
  pressed?: boolean
  /** Opens a popup; `pressed` then means the popup is open (`aria-expanded`). */
  hasMenu?: boolean
  /** Icon and label take the surrounding text color. */
  inheritColor?: boolean
  inheritFont?: boolean
  noPrint?: boolean
  /** `true` by default: the click does not reach the containers around the button; `false` lets it bubble. */
  stopPropagation?: boolean
  /** Also names an icon-only button for assistive technology unless `aria-label` is given. */
  tooltip?: LabelAndProps
  autofocus?: boolean
  focusIndex?: number
  element?: HTMLButtonElement
}

export interface ButtonEvents {
  click: MouseEvent
  keydown: KeyboardEvent
  focus: FocusEvent
  blur: FocusEvent
}

/** An icon-only button must be named for assistive technology: by its tooltip or by `aria-label`. */
export type IconButtonProps = Omit<ButtonProps, 'label' | 'labelParams' | 'icon' | 'tooltip' | 'aria-label'> & {
  icon: IconComponent
} & ({ tooltip: TooltipWithLabel, 'aria-label'?: string } | { tooltip?: LabelAndProps, 'aria-label': string })

/** `Id` is the item id type, so `selected` and the `selected` event carry it as is. */
export interface MenuButtonProps<Id extends DropdownIntlItem['id'] = DropdownIntlItem['id']>
  extends Omit<ButtonProps, 'hasMenu' | 'pressed'> {
  items: Array<DropdownIntlItem<Id>>
  selected?: Id
  /** Keeps the selected item unmarked in the list. */
  noSelection?: boolean
  /** A single item is selected right away, without opening the list. */
  autoSelectSingle?: boolean
  /** Params for the item labels. */
  itemParams?: Record<string, any>
}

export interface MenuButtonEvents<Id extends DropdownIntlItem['id'] = DropdownIntlItem['id']> extends ButtonEvents {
  selected: CustomEvent<Id>
}
