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

/** `small` 1rem (default), `extra-small` 0.75rem - inside a line of small text. */
export type ProgressCircleSize = 'small' | 'extra-small'

interface ProgressCircleBaseProps {
  /** Clamped to `min`...`max`. */
  value: number
  min?: number
  max?: number
  size?: ProgressCircleSize
}

/** Compact progress next to a counter ("3/5", "40%"): a ring filled with the brand accent, as `ProgressBar`; must be named. */
export type ProgressCircleProps = ProgressCircleBaseProps &
  ({ 'aria-label': string, 'aria-labelledby'?: string } | { 'aria-label'?: string, 'aria-labelledby': string })
