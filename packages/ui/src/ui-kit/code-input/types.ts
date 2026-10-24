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

import type { ButtonSize } from '../button/types'

/** Cell heights match the kit buttons of the same name; the cell is three quarters as wide. */
export type CodeInputSize = Extract<ButtonSize, 'large' | 'medium' | 'small'>

interface CodeInputBaseProps {
  /** The characters entered so far, without gaps; supports `bind:value`. */
  value?: string
  /** Number of cells; `6` by default. */
  length?: number
  /** `small` by default. */
  size?: CodeInputSize
  /** Digits only (the default) - other characters are dropped and the numeric keyboard opens. */
  numeric?: boolean
  /** A dash between the two halves of an even-length code; on by default. */
  separator?: boolean
  disabled?: boolean
  /** Red cell borders; the message itself is shown by the place. */
  error?: boolean
  /** Focuses the first empty cell on mount. */
  autofocus?: boolean
  'aria-describedby'?: string
}

/** The group of cells must be named for assistive technology: by `aria-label` or `aria-labelledby`. */
export type CodeInputProps = CodeInputBaseProps &
  ({ 'aria-label': string, 'aria-labelledby'?: string } | { 'aria-label'?: string, 'aria-labelledby': string })

export interface CodeInputEvents {
  /** The code after every change, possibly incomplete. */
  input: CustomEvent<string>
  /** The code once every cell is filled: typed, pasted or autofilled. */
  complete: CustomEvent<string>
}
