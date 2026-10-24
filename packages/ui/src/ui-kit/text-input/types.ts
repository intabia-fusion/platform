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

import type { IconComponent } from '../../types'
import type { ButtonKind, ButtonSize } from '../button/types'

/**
 * - `secondary` - filled and outlined with the input tokens: a field of a form or a dialog;
 * - `ghost` - no fill, border or side padding, the text lines up with the content around it: a title of a dialog or a
 *   card, a value edited in place; clear in focus, only the caret shows it;
 * - `subtle` - a ghost that becomes a field in focus, the fill and the ring: a value edited in place where the bounds should be seen.
 */
export type TextInputKind = Extract<ButtonKind, 'secondary' | 'ghost'> | 'subtle'

/** Heights match the kit buttons of the same name; `extra-large` - login and onboarding forms, the label floats inside. */
export type TextInputSize = Exclude<ButtonSize, 'min'>

export type TextInputType = 'text' | 'password' | 'email' | 'tel' | 'url' | 'search'

export type TextInputMode = 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search'

interface TextInputBaseProps {
  /** Updated on every edit; supports `bind:value`. */
  value?: string
  kind?: TextInputKind
  size?: TextInputSize
  /**
   * Title typography: `large` 1.5rem / 500, `medium` 1.25rem / 400, `small` 1rem / 500 - the name of an object in a
   * creation dialog or a card.
   */
  heading?: boolean
  /**
   * Only for `ghost` and `subtle`: the text keeps the inset of a filled field of the same size instead of standing
   * flush with the content, and an error outlines the field. For a ghost field among filled ones or in a dialog body.
   */
  inset?: boolean
  /** Decorative icon at the start; actions go to the `before` / `after` slots. */
  icon?: IconComponent
  /** A clear button while there is text; clearing reports `input` and `change` with `''`. */
  clearable?: boolean
  type?: TextInputType
  inputmode?: TextInputMode
  /** Marks the label with an asterisk and the input as required. */
  required?: boolean
  maxlength?: number
  disabled?: boolean
  /** Shows the value as is, not faded, and does not let it change. */
  readonly?: boolean
  /** Red border; the message itself is shown by the place. */
  error?: boolean
  /** Stretches to the width of the place. */
  fullWidth?: boolean
  autofocus?: boolean
  focusIndex?: number
  id?: string
  name?: string
  autocomplete?: string
  'aria-describedby'?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

interface TextInputNaming {
  /** Visible label: above the field, inside it as a floating label at `extra-large`. Names the input. */
  label?: IntlString
  labelParams?: Record<string, any>
  /** Text of the empty field; names the input when there is no label. */
  placeholder?: IntlString
  placeholderParams?: Record<string, any>
  'aria-label'?: string
  'aria-labelledby'?: string
}

/** An input must be named for assistive technology: by its label, placeholder, `aria-label` or `aria-labelledby`. */
export type TextInputProps = TextInputBaseProps &
  TextInputNaming &
  ({ label: IntlString } | { placeholder: IntlString } | { 'aria-label': string } | { 'aria-labelledby': string })

export interface TextInputEvents {
  /** The text after every edit, the clear button included. */
  input: CustomEvent<string>
  /** The committed text: on blur after an edit, on Enter and when cleared. */
  change: CustomEvent<string>
  focus: FocusEvent
  blur: FocusEvent
  keydown: KeyboardEvent
}
