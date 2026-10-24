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

/**
 * Fill color of a single bar:
 * - `brand` - the brand base accent, pink in Intabia (default);
 * - `positive`, `warning`, `negative` - a usage level: enough left, running out, exhausted.
 */
export type ProgressBarKind = 'brand' | 'positive' | 'warning' | 'negative'

/** `small` - a 0.25rem line (default); `large` - a 1.5rem bar with the segment values written inside. */
export type ProgressBarSize = 'small' | 'large'

/** One part of a composite bar, such as the tasks in one status. */
export interface ProgressBarSegment {
  value: number
  /** Color from data, such as a status color. */
  color: string
}

interface ProgressBarBaseProps {
  min?: number
  max?: number
  kind?: ProgressBarKind
  size?: ProgressBarSize
}

type ProgressBarName =
  | { 'aria-label': string, 'aria-labelledby'?: string }
  | { 'aria-label'?: string, 'aria-labelledby': string }

/**
 * How much of a range is done or used, read-only; a changeable value is a slider, not this.
 * A single bar must be named (`aria-label` or `aria-labelledby`); a composite one is read by its numbers without a name.
 */
export type ProgressBarProps = ProgressBarBaseProps &
  (
    | (ProgressBarName & {
      /** Value of a single bar, clamped to `min`...`max`. */
      value?: number
      segments?: undefined
    })
    | {
      /** Composite bar: segments one after another, each as long as its value. */
      segments: ProgressBarSegment[]
      value?: number
      'aria-label'?: string
      'aria-labelledby'?: string
    }
  )
