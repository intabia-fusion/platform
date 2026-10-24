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

/** `section` - a top-level section of the navigator with a divider above; `nested` - a group inside a section (a space). */
export type NavGroupKind = 'section' | 'nested'

/** A titled group of navigator items, optionally collapsible or selectable itself. */
export interface NavGroupProps {
  /** Text without translation (a space name) - `getEmbeddedLabel(text)`. */
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  kind?: NavGroupKind
  /** `true` by default: the line above a section; a `nested` group has none. */
  divider?: boolean
  /** Shows a chevron; the header toggles the content. */
  expandable?: boolean
  /** Bindable, `true` by default; the content stays mounted while closed. */
  open?: boolean
  /** Nothing inside yet: no chevron and no content. */
  empty?: boolean
  /**
   * Makes the header a row that selects the group (`on:select`), the chevron keeps toggling:
   * `undefined` - the header only toggles, `true`/`false` - selectable, and whether it is the selected one.
   */
  selected?: boolean
  /** The selected item is inside: the caption gets a plate. */
  highlighted?: boolean
  /** The menu of the group is open: the caption keeps its plate and the tools stay visible. */
  pressed?: boolean
  draggable?: boolean
  /** `-1` takes the row out of the Tab order where the navigator has no keyboard navigation of its own. */
  tabindex?: number
  id?: string
  'data-id'?: string
}

export interface NavGroupEvents {
  /** The new open state, after a click on the header or the chevron. */
  toggle: CustomEvent<boolean>
  /** A click on the header of a selectable group; nothing to pass, so `null`. */
  select: CustomEvent<null>
  contextmenu: MouseEvent
  dragstart: DragEvent
  dragover: DragEvent
  dragend: DragEvent
  drop: DragEvent
}
