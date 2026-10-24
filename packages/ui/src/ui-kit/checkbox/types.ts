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

import type { ButtonShape } from '../button/types'

/**
 * Color of the checked box:
 * - `primary` - the accent (default);
 * - `brand` - the brand color, frame included: choices in forms, to-dos, marks in menu rows;
 * - `positive` - green: a done item, a correct answer;
 * - `negative` - red: a wrong answer.
 */
export type CheckboxKind = 'primary' | 'brand' | 'positive' | 'negative' | 'neutral'

/** Box 1rem with 0.875rem text (`medium`, default) or 0.875rem with 0.75rem text (`small`: table and list rows). */
export type CheckboxSize = 'medium' | 'small'

/** Attributes passed through to the native `<input type="checkbox">`. */
export interface CheckboxAttributes extends AriaAttributes {
  id?: string
  name?: string
  value?: string
  form?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

interface CheckboxBaseProps extends Omit<CheckboxAttributes, 'aria-label' | 'aria-labelledby'> {
  /** Supports `bind:checked`. */
  checked?: boolean
  /** Mixed state (part of the rows selected): a dash instead of the check; a click clears it and toggles `checked`. */
  indeterminate?: boolean
  labelParams?: Record<string, any>
  kind?: CheckboxKind
  size?: CheckboxSize
  /** `round` - a circle: a to-do to complete, a selectable message. */
  shape?: ButtonShape
  /** Border and fill instead of the kind color, e.g. `var(--global-urgent-PriorityColor)`. */
  color?: string
  disabled?: boolean
  /** Shows the state as is, not faded, and does not change it. */
  readonly?: boolean
  /** Red border, `aria-invalid`. */
  error?: boolean
  /** `true` by default: the click does not reach the row or card around; `false` lets it bubble. */
  stopPropagation?: boolean
}

interface CheckboxLabelled {
  /** Text next to the box; markup goes to the default slot instead. */
  label: IntlString
  decorative?: false
  'aria-label'?: string
  'aria-labelledby'?: string
}

interface CheckboxUnlabelled {
  label?: undefined
  decorative?: false
}

/**
 * Only the box, without an input: a mark inside a row that toggles itself (a menu item, a list of options).
 * The row carries the state for assistive technology (`role="menuitemcheckbox"`, `aria-checked`).
 */
interface CheckboxDecorative {
  decorative: true
  label?: undefined
  'aria-label'?: undefined
  'aria-labelledby'?: undefined
}

/**
 * A checkbox must be named for assistive technology: by its label, `aria-label` or `aria-labelledby` (markup in
 * the default slot is named by `aria-labelledby` pointing at it); a decorative box is not announced at all.
 */
export type CheckboxProps = CheckboxBaseProps &
  (
    | CheckboxLabelled
    | (CheckboxUnlabelled & { 'aria-label': string, 'aria-labelledby'?: string })
    | (CheckboxUnlabelled & { 'aria-label'?: string, 'aria-labelledby': string })
    | CheckboxDecorative
  )

export interface CheckboxEvents {
  /** The new `checked` after the user toggled it. */
  change: CustomEvent<boolean>
}
