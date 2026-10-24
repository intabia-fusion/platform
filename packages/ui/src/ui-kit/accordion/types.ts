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
 * `large` - a section with a chevron and a 16px title; `medium` - a subgroup inside one, uppercase caption;
 * `small` - a compact disclosure inside a form or a list (statistics, reports, settings blocks).
 */
export type AccordionItemSize = 'large' | 'medium' | 'small'

/** A collapsible section: the header toggles the content below it. */
export interface AccordionItemProps {
  /** Text without translation (a project or floor name) - `getEmbeddedLabel(text)`. */
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  size?: AccordionItemSize
  /** Bindable; the content stays mounted while closed. `large` and `medium` content is a region named by the title. */
  open?: boolean
  /** The header does not toggle (a leaf of a tree); the title of a selectable section still selects. */
  disabled?: boolean
  /**
   * Makes the title a button of its own that selects the section (`on:select`), the chevron keeps toggling:
   * `undefined` - the whole header toggles, `true`/`false` - selectable, and whether it is the selected one.
   */
  selected?: boolean
  /** Number of entries, after the title. */
  counter?: number
  /** Milliseconds, shown formatted after the counter. */
  duration?: number
  /** The header sticks to the top of the scroll container; its background comes from `--accordion-header-BackgroundColor`. */
  sticky?: boolean
  /** The header sits on a plate: rows of a list of disclosures that should read as separate blocks. */
  filled?: boolean
  /** The content is not rendered until the first open (heavy trees, lists that query data). */
  lazy?: boolean
}

export interface AccordionItemEvents {
  /** The new open state, after a click on the header or the chevron. */
  toggle: CustomEvent<boolean>
  /** A click on the title of a selectable section; nothing to pass, so `null`. */
  select: CustomEvent<null>
}
