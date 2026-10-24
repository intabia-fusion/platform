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

/** `large` 2rem, `medium` 1.5rem (default), `small` 1rem - next to body text, `extra-small` 0.75rem - in small text. */
export type SpinnerSize = 'large' | 'medium' | 'small' | 'extra-small'

/** `neutral` - main text color (default); `brand` - the brand base accent, pink in Intabia. */
export type SpinnerKind = 'neutral' | 'brand'

/** Shows that something next to it is busy; a whole area waiting for its content is `Loading`. */
export interface SpinnerProps {
  size?: SpinnerSize
  kind?: SpinnerKind
  /** Takes the text color of the place, as an icon inside a colored control does. */
  inheritColor?: boolean
  /** Visible text after the spinner ("Clearing", "Transcribing") in the font and color of the place; it also names the status. */
  label?: IntlString
  labelParams?: Record<string, any>
  /** Names the status when there is no visible label; without either the spinner is decorative. */
  'aria-label'?: string
  'aria-labelledby'?: string
}
