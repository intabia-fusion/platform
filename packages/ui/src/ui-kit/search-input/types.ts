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

import type { ButtonKind, ButtonSize } from '../button/types'

/** `secondary` - filled like a secondary button next to it; `ghost` - transparent, inside a panel or a popup. */
export type SearchInputKind = Extract<ButtonKind, 'secondary' | 'ghost'>

/** Heights match the kit buttons of the same name. */
export type SearchInputSize = Exclude<ButtonSize, 'min' | 'extra-large'>

export interface SearchInputProps {
  /** The query as of the last `change`; typing updates it after `delay`. */
  value?: string
  /** `ui.string.Search` by default; also names the field for assistive technology. */
  placeholder?: IntlString
  placeholderParams?: Record<string, any>
  kind?: SearchInputKind
  size?: SearchInputSize
  /** While empty and not focused, only the search icon shows, as a square button of the size. */
  collapsed?: boolean
  /** Milliseconds of no typing before `change`; Enter and the clear button report at once. */
  delay?: number
  /** Stretches to the width of the place. */
  fullWidth?: boolean
  /** A spinner in place of the search icon while the results of the query load. */
  loading?: boolean
  autofocus?: boolean
  'aria-label'?: string
  /** Id of a visible label of the place; it names the field instead of the placeholder. */
  'aria-labelledby'?: string
  'aria-describedby'?: string
}

export interface SearchInputEvents {
  /** The query after typing settled, on Enter or cleared (`''`). */
  change: CustomEvent<string>
  focus: FocusEvent
  blur: FocusEvent
  /** Arrows and Enter of the place, e.g. to move through the list below; Enter also reports `change`. */
  keydown: KeyboardEvent
}
