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

import type { IntlString } from '@hcengineering/platform'

import type { IconComponent } from '../../types'

export type SegmentedControlId = string | number

export type SegmentedControlSize = 'medium' | 'small' | 'extra-small'

export interface SegmentedControlItem<Id extends SegmentedControlId = string> {
  id: Id
  /** Text of the segment; with `iconOnly` it names the segment and shows as its tooltip. */
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  /** Short hint after the visible label, e.g. a discount. */
  badge?: IntlString
  badgeParams?: Record<string, any>
  disabled?: boolean
}

/** Exactly one of a few options, always one on: a view mode, a filter, a period. */
export interface SegmentedControlProps<Id extends SegmentedControlId = string> {
  items: Array<SegmentedControlItem<Id>>
  selected?: Id
  size?: SegmentedControlSize
  /** Segments with an icon show only it; their labels become tooltips and accessible names, badges are hidden. */
  iconOnly?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface SegmentedControlEvents<Id extends SegmentedControlId = string> {
  /** The segment that became selected; not fired for a click on the selected one. */
  select: CustomEvent<Id>
}
