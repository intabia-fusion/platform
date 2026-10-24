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

/**
 * `link` - a page of the navigator (icon and 14px label); `object` - an object of the navigator (channel, card),
 * its icon on a plate; `anchor` - a section of the page in an in-page table of contents (12px, secondary text).
 */
export type NavItemKind = 'link' | 'object' | 'anchor'

/** A row of the navigator: a page, an object or a node of a tree. */
export interface NavItemProps {
  /** Text without translation (a channel or document title) - `getEmbeddedLabel(text)`. */
  label: IntlString
  labelParams?: Record<string, any>
  /** An object identifier before the label, 12px medium (an issue, a document): the label after it is cut instead. */
  identifier?: string
  /** Secondary text after the label: a member count, a subtitle. */
  description?: IntlString
  descriptionParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  /** A color square instead of the icon (a tag); the label of the selected item takes the color too. */
  color?: string
  kind?: NavItemKind
  /** Number at the end of the row (unread, entries); `undefined` hides it, `0` is shown. */
  count?: number
  /** The page or object shown now (`aria-current="page"`). */
  selected?: boolean
  /** Hover look while the menu of the item is open; keeps the actions visible. */
  pressed?: boolean
  disabled?: boolean
  /** Nesting depth in a tree, one step is 1.25rem. */
  level?: number
  /** Shows a chevron that opens the `children` slot. */
  expandable?: boolean
  /** Bindable; the place keeps it between sessions if needed. */
  open?: boolean
  /** An expandable item with nothing inside yet: the chevron space stays, so the label lines up with siblings. */
  empty?: boolean
  draggable?: boolean
  /** `-1` takes the row out of the Tab order where the navigator has no keyboard navigation of its own. */
  tabindex?: number
  id?: string
  'data-id'?: string
}

export interface NavItemEvents {
  /** A click on the row; on the selected expandable item it also toggles `open`. */
  click: MouseEvent
  contextmenu: MouseEvent
  /** The new open state, after a click on the chevron or on the selected item. */
  toggle: CustomEvent<boolean>
  dragstart: DragEvent
  dragover: DragEvent
  dragend: DragEvent
  drop: DragEvent
}
