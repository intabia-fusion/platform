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

import type { AriaAttributes } from 'svelte/elements'

/** Thumb 1rem (`medium`, default) or 0.75rem (`small`, a compact row); the track is a 0.25rem line in both. */
export type SliderSize = 'small' | 'medium'

/** Attributes passed through to the native `<input type="range">`. */
export interface SliderAttributes extends AriaAttributes {
  id?: string
  name?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

interface SliderBaseProps extends Omit<SliderAttributes, 'aria-label' | 'aria-labelledby' | 'aria-valuetext'> {
  /** Supports `bind:value`; the native range brings it into `min`..`max` and onto `step`. */
  value?: number
  min?: number
  max?: number
  /** Drag and arrow-key granularity, `1` by default; `'any'` - a continuous value such as a playback position. */
  step?: number | 'any'
  size?: SliderSize
  disabled?: boolean
  /** Writes the value after the track. */
  showValue?: boolean
  /** Text of the value for `showValue` and assistive technology, such as `1:05` for a playback position. */
  formatValue?: (value: number) => string
}

/** A value changed by dragging along a range, such as a zoom level or a playback position; must be named. */
export type SliderProps = SliderBaseProps &
  ({ 'aria-label': string, 'aria-labelledby'?: string } | { 'aria-label'?: string, 'aria-labelledby': string })

export interface SliderEvents {
  /** Every move while dragging or a key press. */
  input: CustomEvent<number>
  /** The committed value: the pointer released or a key pressed. */
  change: CustomEvent<number>
}
