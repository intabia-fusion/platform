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

import type { LabelAndProps } from '../../types'

/**
 * Color and glyph:
 * - `positive` - green, a check: yes, done, works;
 * - `negative` - the red of a dangerous action, a cross: no, rejected;
 * - `error` - the red of errors, a cross: failed, an error with its details;
 * - `warning` - orange, an exclamation mark: works with problems;
 * - `info` - main accent, an "i";
 * - `neutral` - grey, a question mark: unknown, not set.
 */
export type StatusIconTone = 'positive' | 'negative' | 'error' | 'warning' | 'info' | 'neutral'

/**
 * - `solid` - a filled circle with a light glyph (default);
 * - `outline` - a ring and the glyph in a paler shade of the tone, no fill: quieter, inside dense content.
 */
export type StatusIconKind = 'solid' | 'outline'

/** `small` 1rem (default) - next to body text; `medium` 1.25rem - next to a title. */
export type StatusIconSize = 'medium' | 'small'

/** A state shown by a colored round icon, alone or next to its text. */
export interface StatusIconProps {
  tone: StatusIconTone
  kind?: StatusIconKind
  size?: StatusIconSize
  /** A small colored dot instead of the icon, for a compact state mark (an integration that is connected). */
  dot?: boolean
  /** Details on hover, such as the error text. */
  tooltip?: LabelAndProps
  /** Names the state when no text next to the icon does; without it the icon is decorative. */
  'aria-label'?: string
}
