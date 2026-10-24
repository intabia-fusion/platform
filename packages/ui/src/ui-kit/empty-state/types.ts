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

/**
 * `large` - the whole view is empty (no issues, no messages): fills the place and centres a bold message and an explanation;
 * `small` - an empty block inside a section (no applications yet): a plate with a short message.
 */
export type EmptyStateSize = 'large' | 'small'

/**
 * The picture of a `large` state:
 * - `brand` - a circle in the selection tint (default);
 * - `plate` - the icon on a soft neutral square.
 */
export type EmptyStateKind = 'plate' | 'brand'

export interface EmptyStateProps {
  /** The message: what is missing. */
  label: IntlString
  labelParams?: Record<string, any>
  /** What to do about it, under the message. */
  description?: IntlString
  descriptionParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  size?: EmptyStateSize
  /** Only for `large`. */
  kind?: EmptyStateKind
  /** Only for `small`: the whole plate becomes a dashed add button with this text, the label describes it. */
  action?: IntlString
  actionParams?: Record<string, any>
}

export interface EmptyStateEvents {
  /** The add plate (`action`) was clicked. */
  click: MouseEvent
}
