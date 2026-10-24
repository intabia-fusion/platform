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

import type { TextInputKind } from '../text-input/types'

/**
 * Same kinds as `TextInput`: `secondary` - a filled field of a form; `ghost` - text under a title, edited in place;
 * `subtle` - a ghost that becomes a field in focus: the fill and the ring.
 */
export type TextAreaKind = TextInputKind

/** `small` - 0.875rem text; `medium` - 1rem / 500, a description under a `TextInput` heading. */
export type TextAreaSize = 'medium' | 'small'

interface TextAreaBaseProps {
  /** Updated on every edit; supports `bind:value`. */
  value?: string
  kind?: TextAreaKind
  size?: TextAreaSize
  /** Lines shown while empty; `3` by default. */
  rows?: number
  /** The field grows with the text up to this many lines, then scrolls; without it - grows without a limit. */
  maxRows?: number
  maxlength?: number
  disabled?: boolean
  /** Shows the text as is, not faded, and does not let it change. */
  readonly?: boolean
  /** Red border; the message itself is shown by the place. */
  error?: boolean
  /**
   * Only for `ghost` and `subtle`: the text keeps the inset of a filled field instead of standing flush with the
   * content, and an error outlines the field; lines up with an `inset` TextInput above it.
   */
  inset?: boolean
  autofocus?: boolean
  focusIndex?: number
  id?: string
  name?: string
  'aria-describedby'?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

interface TextAreaNaming {
  /** Text of the empty field; names it when there is no `aria-label`. */
  placeholder?: IntlString
  placeholderParams?: Record<string, any>
  'aria-label'?: string
  'aria-labelledby'?: string
}

/** A field must be named for assistive technology: by its placeholder, `aria-label` or `aria-labelledby`. */
export type TextAreaProps = TextAreaBaseProps &
  TextAreaNaming &
  ({ placeholder: IntlString } | { 'aria-label': string } | { 'aria-labelledby': string })

export interface TextAreaEvents {
  /** The text after every edit. */
  input: CustomEvent<string>
  /** The committed text: on blur after an edit. */
  change: CustomEvent<string>
  focus: FocusEvent
  blur: FocusEvent
  keydown: KeyboardEvent
}
