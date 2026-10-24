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

/**
 * How a narrow header makes room: `disabled` - always one row; `auto` - two rows below `breakpoint`, search, extra and
 * actions go to the second; `double` - always two rows; `extra` - two rows once the `extra` slot no longer fits.
 */
export type PanelHeaderAdaptive = 'disabled' | 'auto' | 'double' | 'extra'

/** The bar on top of a view, a panel or an aside: title, search, filters, actions and closing. */
export interface PanelHeaderProps {
  adaptive?: PanelHeaderAdaptive
  /** Width in px below which `auto` takes two rows; 768 by default. */
  breakpoint?: number
  /** In two rows the actions stay in the first one, next to the title. */
  pinActions?: boolean
  /** The `extra` slot scrolls sideways instead of being cut. */
  scrollExtra?: boolean
  /** `true` by default: the line under the header. */
  divider?: boolean
  /** A close button at the end (`on:close`); with `closeOnEscape` also the Esc hint and key. */
  closable?: boolean
  /** `true` by default; Esc waits while a popup is open above. */
  closeOnEscape?: boolean
  /** A button at the start that hides or shows the navigator. */
  navigatorToggle?: boolean
  noPrint?: boolean
}

export interface PanelHeaderSize {
  width: number
  titleWidth: number
  titleOverflow: boolean
  extraWidth: number
  extraOverflow: boolean
}

export interface PanelHeaderEvents {
  /** The close button or Esc; nothing to pass, so `null`. */
  close: CustomEvent<null>
  /** Sizes after a change: a panel fits its own title into the header by them. */
  resize: CustomEvent<PanelHeaderSize>
}
