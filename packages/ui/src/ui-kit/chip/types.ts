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

import type { IconComponent, LabelAndProps } from '../../types'

/** Heights match the kit buttons of the same name. */
export type ChipSize = 'small' | 'extra-small'

/**
 * How the color is shown; the color is the accent, or `color` from data:
 * - `tint` - light fill and colored text (default);
 * - `solid` - full fill and light text;
 * - `outline` - colored frame and text, no fill;
 * - `neutral` - like a secondary button, `color` is ignored.
 */
export type ChipKind = 'tint' | 'solid' | 'outline' | 'neutral'

/** A state of a record (active, canceled, finished, pending): the theme state colors instead of `color`. */
export type ChipTone = 'positive' | 'negative' | 'regular' | 'ghost'

/** A value picked into a field (an event type, a space, a label), removable with its own button. */
export interface ChipProps {
  /** A name or a count goes through `getEmbeddedLabel`. */
  label: IntlString
  labelParams?: Record<string, any>
  size?: ChipSize
  kind?: ChipKind
  /** Color from data, such as a label color picked by the user; the accent without it. */
  color?: string
  /** A state color; overrides `kind` and `color`. */
  tone?: ChipTone
  /** Before the label, in the text color: the kind of the value, such as a channel or a person. */
  icon?: IconComponent
  /** Props of the icon component, such as the person an avatar icon shows. */
  iconProps?: Record<string, any>
  /** Shows the remove button, which reports `remove`. */
  removable?: boolean
  tooltip?: LabelAndProps
}

export interface ChipEvents {
  /** The remove button was clicked or got Backspace / Delete; a DOM event without detail carries `null`. */
  remove: CustomEvent<null>
}
