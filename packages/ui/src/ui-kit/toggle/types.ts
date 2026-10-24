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

import type { LabelAndProps, TooltipWithLabel } from '../../types'

/** Track heights 1.5 / 1.25 / 1 / 0.875rem, twice as wide; `medium` by default, a settings row. */
export type ToggleSize = 'large' | 'medium' | 'small' | 'extra-small'

/** Color of the on track: `brand` (default), `primary` - the accent, `positive` - green, `negative` - red. */
export type ToggleKind = 'brand' | 'primary' | 'positive' | 'negative'

/** Side of the label relative to the switch: `end` by default, `start` for a settings row with the switch at its end. */
export type ToggleLabelPosition = 'start' | 'end'

/** Attributes passed through to the native `<input type="checkbox" role="switch">`. */
export interface ToggleAttributes extends AriaAttributes {
  id?: string
  name?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

interface ToggleBaseProps extends Omit<ToggleAttributes, 'aria-label' | 'aria-labelledby'> {
  /** On or off; supports `bind:checked`. */
  checked?: boolean
  size?: ToggleSize
  kind?: ToggleKind
  labelPosition?: ToggleLabelPosition
  /** Takes the width of the place: the label at one edge, the switch at the other. */
  fullWidth?: boolean
  disabled?: boolean
  /** Shows the state as is, not faded, and does not change it. */
  readonly?: boolean
}

interface ToggleLabelled {
  label: IntlString
  labelParams?: Record<string, any>
  /** Second line under the label, announced as the switch description. */
  description?: IntlString
  descriptionParams?: Record<string, any>
  tooltip?: LabelAndProps
  'aria-label'?: string
  'aria-labelledby'?: string
}

interface ToggleUnlabelled {
  label?: undefined
  labelParams?: undefined
  description?: undefined
  descriptionParams?: undefined
}

/** A switch must be named for assistive technology: by its label, its tooltip, `aria-label` or `aria-labelledby`. */
export type ToggleProps = ToggleBaseProps &
  (
    | ToggleLabelled
    | (ToggleUnlabelled & { tooltip: TooltipWithLabel, 'aria-label'?: string, 'aria-labelledby'?: string })
    | (ToggleUnlabelled & { tooltip?: LabelAndProps, 'aria-label': string, 'aria-labelledby'?: string })
    | (ToggleUnlabelled & { tooltip?: LabelAndProps, 'aria-label'?: string, 'aria-labelledby': string })
  )

export interface ToggleEvents {
  /** The new state after the user switched it. */
  change: CustomEvent<boolean>
}
