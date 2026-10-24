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

/** How the current row is marked: `neutral` - a gray plate (popups, pickers); `tint` - a pale shade of the selection, as in NavItem (lists beside an open object). */
export type ListTone = 'neutral' | 'tint'

/** Rows the keyboard or the pointer walks through; the place draws each row in the `item` slot. */
export interface ListProps<Item = unknown> {
  /** Number of rows; with `items`, their count. */
  count: number
  /** Values handed to the `item` slot as `value`; without them the slot gets only the index. */
  items?: Item[]
  /** Bindable index of the current row: the one Enter acts on, moved by the arrows of the place or the pointer. */
  selection?: number
  /** Index of the row whose object is open now, shown apart from the current row. */
  highlighted?: number
  /** `true` by default: rows are inset from the sides and rounded; `false` - rows go edge to edge. */
  inset?: boolean
  /** `neutral` by default. */
  tone?: ListTone
  /** `true` by default: the list scrolls itself; `false` - it grows and the place scrolls. */
  scroll?: boolean
  /** `true` by default: the pointer moves the current row. */
  hoverSelects?: boolean
  /** Rows mount when scrolled into view; `rowMinHeight` keeps the scroll height meanwhile. */
  lazy?: boolean
  rowMinHeight?: string
  /** Key of a row for the keyed loop; the index by default. */
  getKey?: (index: number) => string
  'aria-label'?: string
}

export interface ListEvents {
  /** The current row moved: the new index. */
  select: CustomEvent<number>
  /** A row was clicked: its index. */
  activate: CustomEvent<number>
  /** The list changed its size: a popup around it can reposition; nothing to pass, so `null`. */
  resize: CustomEvent<null>
}
