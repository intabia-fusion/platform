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

import type { ButtonKind, ButtonSize } from '../button/types'

/** One value of a category. */
export interface FilterButtonOption {
  id: string
  label: IntlString
}

/** A category of the list with its values; at most one value of it is active. */
export interface FilterButtonCategory {
  id: string
  label: IntlString
  options: FilterButtonOption[]
}

/** The value picked in a category; the labels are kept so the popup shows it without looking the category up. */
export interface FilterButtonActiveFilter {
  categoryId: string
  optionId: string
  categoryLabel: IntlString
  optionLabel: IntlString
}

/** Kinds of a toolbar control next to a search field. */
export type FilterButtonKind = Extract<ButtonKind, 'secondary' | 'ghost'>

export type FilterButtonSize = Exclude<ButtonSize, 'min' | 'extra-large'>

/** How active filters show: `count` - their number after the label, `dot` - a dot on the funnel, when the count means nothing. */
export type FilterButtonIndicator = 'count' | 'dot'

/** Filters of a list by fixed categories: one option per category, picked in `FilterCategoryPopup`. */
export interface FilterButtonProps {
  categories: FilterButtonCategory[]
  /** At most one per category; their count shows on the button and a reset button appears next to it. */
  activeFilters?: FilterButtonActiveFilter[]
  kind?: FilterButtonKind
  size?: FilterButtonSize
  indicator?: FilterButtonIndicator
  disabled?: boolean
}

export interface FilterButtonEvents {
  /** The whole new list of active filters: a category set, changed, cleared, or all reset. */
  change: CustomEvent<FilterButtonActiveFilter[]>
}
