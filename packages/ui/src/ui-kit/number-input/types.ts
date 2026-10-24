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

import type { ButtonSize } from '../button/types'

/** Heights match the kit buttons of the same name. */
export type NumberInputSize = Exclude<ButtonSize, 'min' | 'extra-large'>

export interface NumberInputProps {
  /** Updated while typing; brought into `min`..`max` and `fractionDigits` on commit (blur, Enter, a step). */
  value?: number
  min?: number
  max?: number
  /** What the `−` / `+` buttons and the arrow keys add; `1` by default. */
  step?: number
  /** Digits kept after the point on commit; `0` - whole numbers only. */
  fractionDigits?: number
  placeholder?: IntlString
  placeholderParams?: Record<string, any>
  size?: NumberInputSize
  /** Stretches to the width of the place; otherwise the field fits its value. */
  fullWidth?: boolean
  disabled?: boolean
  autofocus?: boolean
  focusIndex?: number
  /** Names the field; a visible label of the place is better linked with `aria-labelledby`. */
  'aria-label'?: string
  /** Id of the visible label next to the field, e.g. the text of a settings row. */
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

export interface NumberInputEvents {
  /**
   * The committed value when it differs from the previous one, `null` when the field is empty: a DOM event detail
   * cannot be `undefined`.
   */
  change: CustomEvent<number | null>
  focus: FocusEvent
  blur: FocusEvent
  keydown: KeyboardEvent
}
