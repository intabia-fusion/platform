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

import type { ButtonGroupItem } from '../button-group/types'
import type { PanelHeaderAdaptive, PanelHeaderSize } from '../panel-header/types'

/** The page of an object: a header on top, the content and an aside with its properties that docks or floats. */
export interface PanelProps {
  /** `true` by default: the close button at the start of the header (`on:close`). */
  closable?: boolean
  /** The `header` slot above the content. */
  isHeader?: boolean
  /** `true` by default: the `aside` slot and its toggle in the header. */
  isAside?: boolean
  /** The aside always floats over the content instead of docking next to it. */
  floatAside?: boolean
  /** A header button that toggles the full size (`on:fullsize`). */
  isFullSize?: boolean
  /** Hides the `title` slot. */
  withoutTitle?: boolean
  /** Inside another view, without the panel frame. */
  embedded?: boolean
  /** The content keeps a readable width; `undefined` - no width button. */
  useMaxWidth?: boolean
  /** `true` by default: the width button in the header when `useMaxWidth` is set. */
  showMaxWidthButton?: boolean
  /** Several asides switched by a group of buttons instead of one toggle. */
  customAside?: ButtonGroupItem[]
  /** The open aside: an id from `customAside`, or `true` / `false` for the single one. */
  selectedAside?: string | boolean
  /** `true` by default: the header goes to print. */
  printHeader?: boolean
  /** The aside goes to print after the content. */
  printAside?: boolean
  /** `auto` by default; one row on a phone. */
  adaptive?: PanelHeaderAdaptive
  /** The `extra` slot scrolls sideways instead of being cut. */
  scrollExtra?: boolean
  /** Width of the content, for the place to lay itself out. */
  innerWidth?: number
  /** Width of the whole panel. */
  panelWidth?: number
  element?: HTMLElement
}

export interface PanelResize extends PanelHeaderSize {
  panelWidth: number
  innerWidth: number
}

export interface PanelEvents {
  open: CustomEvent<null>
  close: CustomEvent<null>
  /** The open aside changed: an id from `customAside` or `false`. */
  select: CustomEvent<string | boolean>
  maxWidth: CustomEvent<boolean>
  fullsize: CustomEvent<null>
  /** Sizes of the panel and its header after a change. */
  resize: CustomEvent<PanelResize>
}
