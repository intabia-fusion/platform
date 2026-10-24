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

import type { AnyComponent, AnySvelteComponent, IconComponent } from '../../types'

export type MenuItemId = string | number

/** A popup opened as the submenu of a row: a picker that applies its value itself, or reports it in `submenu`. */
export interface MenuItemPopup {
  component: AnySvelteComponent | AnyComponent
  props?: Record<string, any>
}

export interface MenuItem<Id extends MenuItemId = MenuItemId> {
  id: Id
  /** A text label goes through `getEmbeddedLabel`; also names the row and is what search matches. */
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  /** A platform color index: a swatch in place of the icon; the label keeps the text color. */
  color?: number
  /** A second line under the label. */
  description?: IntlString
  descriptionParams?: Record<string, any>
  /** A line above the item. */
  divider?: boolean
  /** A group heading above the item. */
  heading?: IntlString
  /** With `multiselect`, choosing it clears the others and choosing another clears it. */
  exclusive?: boolean
  /** Markup of the row instead of the label and description. */
  component?: AnySvelteComponent
  componentProps?: Record<string, any>
  /** Items of a submenu: it opens on hover, ArrowRight or click; its first row is this item unless `submenuOnly`. */
  children?: Array<MenuItem<Id>>
  /** With `children` or `popup`: the item only opens the submenu and is not a choice itself. */
  submenuOnly?: boolean
  /** A popup of its own opened as the submenu: hover, ArrowRight or click. */
  popup?: MenuItemPopup
  /** The row is a link: a plain click chooses the item, a modifier click opens the address in a new tab. */
  href?: string
  /** An arrow at the end: choosing the item opens another page; on by default with `href`. */
  opensPage?: boolean
}

/** `fit` - by the rows, 10-16.5rem; `wide` - 32rem and `x-wide` - 40rem for long rows. */
export type MenuWidth = 'fit' | 'wide' | 'x-wide'

/** `lines` - the label between two lines; `divider` - a line above every heading after the first; `plain` - the label alone, for short groups of a picker. */
export type MenuHeadings = 'lines' | 'divider' | 'plain'

export interface MenuProps<Id extends MenuItemId = MenuItemId> {
  items: Array<MenuItem<Id>>
  /** Rows with a check: one id, or several. */
  selected?: Id | Id[]
  /** Rows toggle and the menu stays open; every change comes in `update`. */
  multiselect?: boolean
  /** A search field above the rows. */
  withSearch?: boolean
  /** How group headings part the groups, `lines` by default. */
  headings?: MenuHeadings
  /** The query; set from outside it filters the rows without the field (suggestions under the caret). */
  search?: string
  /** `ui.string.SearchDots` by default. */
  searchPlaceholder?: IntlString
  width?: MenuWidth
  /** Not narrower than the trigger that opened it: the trigger passes its own width. */
  minWidth?: string
  /** No surface of its own: the list inside a tooltip or another popup; with `fit` it fills the width of the place. */
  embedded?: boolean
  /** The choice is being applied: the rows are inactive, the chosen (else the checked) one shows a spinner. */
  loading?: boolean
  /** Focuses the search field, or the checked (else the first) row on mount, so the keyboard works at once. */
  autofocus?: boolean
  'aria-label'?: string
  /** Set by the parent menu on its submenu: a choice goes to the root. */
  onSelect?: (id: Id) => void
  /** Set by the parent menu on its submenu: a multiselect toggle goes to the root. */
  onToggle?: (id: Id) => void
  /** Set by the parent menu on its submenu: ArrowLeft returns to the parent row. */
  onBack?: () => void
  /** Set by the parent menu on its submenu: a `popup` row result goes to the root. */
  onResult?: (id: Id, result: unknown, close: boolean) => void
}

export interface MenuEvents<Id extends MenuItemId = MenuItemId> {
  /**
   * The popup closes: `detail` is the chosen id, or `null` after a `popup` submenu returned its result.
   * Escape and a click outside close the popup without it.
   */
  close: CustomEvent<Id | null>
  /** With `multiselect`: the checked ids after a toggle. */
  update: CustomEvent<Id[]>
  /** A `popup` submenu closed or updated with a result. */
  submenu: CustomEvent<{ id: Id, result: unknown }>
  /** The size changed: the popup host moves the popup to fit. */
  changeContent: CustomEvent<null>
}

export interface MenuSlots {
  /** Under the search field, above the rows: the current value, a date field, a profile. */
  header: Record<string, never>
  /** Next to the search field: an action such as "create". */
  actions: Record<string, never>
}
