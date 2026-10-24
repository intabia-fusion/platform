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

import type { CheckboxKind, CheckboxSize } from '../checkbox/types'

/** Color of the selected circle: `primary` (default), `brand`, `positive` - a correct answer, `negative` - a wrong one. */
export type RadioKind = CheckboxKind

/** Circle 1rem with 0.875rem text (`medium`, default) or 0.875rem with 0.75rem text (`small`). */
export type RadioSize = CheckboxSize

/** Attributes passed through to the native `<input type="radio">`. */
export interface RadioAttributes extends AriaAttributes {
  id?: string
  form?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

interface RadioBaseProps<Value> extends Omit<RadioAttributes, 'aria-label' | 'aria-labelledby'> {
  /** Value this option stands for. */
  value: Value
  /** Selected value of the whole set; supports `bind:group`. `null` - nothing selected. */
  group?: Value | null
  /** Same for every option of a set: arrows move between them, as in any native radio group. */
  name?: string
  labelParams?: Record<string, any>
  kind?: RadioKind
  size?: RadioSize
  disabled?: boolean
  /** Shows the selection as is, not faded, and does not change it. */
  readonly?: boolean
  /** Red border, `aria-invalid`. */
  error?: boolean
  /** `true` by default: the click does not reach the row or card around; `false` lets it bubble. */
  stopPropagation?: boolean
}

interface RadioLabelled {
  /** Text next to the circle; markup goes to the default slot instead. */
  label: IntlString
  'aria-label'?: string
  'aria-labelledby'?: string
}

/**
 * An option must be named for assistive technology: by its label, `aria-label` or `aria-labelledby` (markup in the
 * default slot is named by `aria-labelledby` pointing at it).
 */
export type RadioProps<Value = string> = RadioBaseProps<Value> &
  (
    | RadioLabelled
    | { label?: undefined, 'aria-label': string, 'aria-labelledby'?: string }
    | { label?: undefined, 'aria-label'?: string, 'aria-labelledby': string }
  )

export interface RadioEvents<Value = string> {
  /** This option became selected; `detail` is its value. */
  change: CustomEvent<Value>
}

export interface RadioGroupItem<Value = string> {
  value: Value
  label: IntlString
  labelParams?: Record<string, any>
  disabled?: boolean
}

/** A vertical list of options of which exactly one is selected. */
export interface RadioGroupProps<Value = string> extends AriaAttributes {
  items: Array<RadioGroupItem<Value>>
  /** Supports `bind:selected`; `null` or `undefined` - nothing selected yet. */
  selected?: Value | null
  /** Shared by the options; generated when not given. */
  name?: string
  kind?: RadioKind
  size?: RadioSize
  disabled?: boolean
  readonly?: boolean
  error?: boolean
  id?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface RadioGroupEvents<Value = string> {
  /** The option the user selected; `detail` is its value. */
  change: CustomEvent<Value>
}
