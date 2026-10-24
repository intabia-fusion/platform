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

/**
 * - `primary` - fill of the main accent;
 * - `brand` - fill of the brand base accent: the second accent in Intabia, the accent itself elsewhere;
 * - `secondary` - neutral fill;
 * - `tertiary` - transparent, accent-colored text and icon;
 * - `ghost` - transparent, neutral text and icon;
 * - `positive` - green fill for a confirming action;
 * - `negative` - red fill for a destructive action;
 * - `positive-ghost`, `negative-ghost` - transparent, green or red icon and text: a state that is on or off
 *   (microphone, camera, screen sharing), tinted on hover;
 * - `chip` - an oval pill of a list row (a milestone, a component, a due date), as the labels next to it.
 */
/** `light` and `dark` keep their color in both themes: buttons on brand surfaces (login, onboarding). */
export type ButtonKind =
  | 'primary'
  | 'brand'
  | 'secondary'
  | 'tertiary'
  | 'ghost'
  | 'positive'
  | 'negative'
  | 'positive-ghost'
  | 'negative-ghost'
  | 'chip'
  | 'light'
  | 'dark'

/** `min` is for icon-only buttons; `extra-large` for the main actions of the login and onboarding screens. */
export type ButtonSize = 'extra-large' | 'large' | 'medium' | 'small' | 'extra-small' | 'min'

export type ButtonShape = 'rectangle' | 'round'

export type ButtonType = 'button' | 'submit' | 'reset'

/** Attributes passed through to the native `<button>`; `class` and `style` are deliberately not among them. */
export interface ButtonAttributes extends AriaAttributes {
  id?: string
  name?: string
  value?: string
  form?: string
  /** `-1` takes the button out of the Tab order when the keyboard reaches its action another way (number steppers). */
  tabindex?: number
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
  /** Neutral gray pressed look (an open popup, a hovered row); with `hasMenu` it is reported as `aria-expanded`. */
  pressed?: boolean
  /**
   * Toggle that is on or off (`aria-pressed`): `undefined` for a plain button. On is tinted with the accent in
   * `secondary`, `tertiary`, `ghost`.
   */
  selected?: boolean
  /** Opens a popup; `pressed` then means the popup is open (`aria-expanded`). */
  hasMenu?: boolean
  /** Icon and label take the surrounding text color. */
  inheritColor?: boolean
  inheritFont?: boolean
  noPrint?: boolean
  /** `true` by default: the click does not reach the containers around the button; `false` lets it bubble. */
  stopPropagation?: boolean
  /** Shows after 500 ms unless `timeout` is set; also names an icon-only button unless `aria-label` is given. */
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
/** `Selected` is the id type, or an array of ids with `multiselect`. */
export interface MenuButtonProps<
  Id extends DropdownIntlItem['id'] = DropdownIntlItem['id'],
  Selected extends Id | Id[] = Id
> extends Omit<ButtonProps, 'hasMenu' | 'pressed' | 'selected'> {
  items: Array<DropdownIntlItem<Id>>
  /** One id, or an array of them with `multiselect`. */
  selected?: Selected
  /** The list stays open and toggles items; `selected` reports the whole array on every change. */
  multiselect?: boolean
  /** Keeps the selected item unmarked in the list. */
  noSelection?: boolean
  /** A single item is selected right away, without opening the list. */
  autoSelectSingle?: boolean
  /** Params for the item labels. */
  itemParams?: Record<string, any>
}

export interface MenuButtonEvents<
  Selected extends DropdownIntlItem['id'] | Array<DropdownIntlItem['id']> = DropdownIntlItem['id']
> extends ButtonEvents {
  selected: CustomEvent<Selected>
}
