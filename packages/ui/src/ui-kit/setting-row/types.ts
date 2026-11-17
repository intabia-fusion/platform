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

/** `form` (default) - a row of a form; `list` - an item of a list of switches, with an icon plate and a description. */
export type SettingRowVariant = 'form' | 'list'

/**
 * `form` only:
 * - `line` (default) - a dialog or a short form: the caption in caps on the left, the control at the right edge, a line below;
 * - `column` - a settings page: the caption in a column of its own with the hint under it, the control right after it, no line.
 */
export type SettingRowKind = 'line' | 'column'

/** One setting of a form or a dialog: the caption on the left, its control on the right, a line below. */
export interface SettingRowProps {
  label: IntlString
  labelParams?: Record<string, any>
  variant?: SettingRowVariant
  kind?: SettingRowKind
  /** Explains the setting: an info button after the caption, with `column` - a line of text under it; `form` only. */
  hint?: IntlString
  hintParams?: Record<string, any>
  /** The caption above the control, for a wide control such as a text area; `form` only. */
  stacked?: boolean
  /** The control takes the rest of the row, also in the `column` kind: for a full-width field; `form` only. */
  fullWidth?: boolean
  /** `list` only: the mark of the setting on an `IconBox` plate. */
  icon?: IconComponent
  /** `list` only: a palette color name of the plate, as `IconBox` takes it. */
  color?: string
  /** `list` only: the second line under the caption, what the setting does. */
  description?: IntlString
  descriptionParams?: Record<string, any>
  /** `list` only: the caption and the description read as disabled, for a control that is disabled too. */
  disabled?: boolean
}

export interface SettingRowSlots {
  /** The control: ids for `aria-labelledby` and `aria-describedby`; in `list` the caption labels `id={controlId}`. */
  default: { labelId: string, descriptionId: string | undefined, controlId: string }
  /** Under the caption and the control, above the line: picked values of the setting. */
  details: Record<string, never>
}
