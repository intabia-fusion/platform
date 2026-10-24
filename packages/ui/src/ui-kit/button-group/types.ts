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

import type { IconComponent, IconSize, LabelAndProps } from '../../types'
import type { ButtonKind, ButtonSize } from '../button/types'

/** Kinds that show the on state of a toggle: a filled kind would look pressed all the time, accent icons hide the on one. */
export type ButtonGroupKind = Extract<ButtonKind, 'secondary' | 'ghost'>

export interface ButtonGroupItem<Id extends string = string> {
  id: Id
  icon?: IconComponent
  label?: IntlString
  labelParams?: Record<string, any>
  /** Names an icon-only item; required when there is no label. */
  tooltip?: LabelAndProps
  disabled?: boolean
}

/** Toggles of which at most one is on: the aside panels of a document, a view switch. */
export interface ButtonGroupProps<Id extends string = string> {
  items: Array<ButtonGroupItem<Id>>
  selected?: Id
  /** `true` by default: a click on the item that is on turns it off. */
  allowDeselect?: boolean
  kind?: ButtonGroupKind
  size?: ButtonSize
  iconSize?: IconSize
  'aria-label'?: string
}

export interface ButtonGroupEvents<Id extends string = string> {
  /** The item turned on, or `null` when the one that was on is turned off: a DOM event detail cannot be `undefined`. */
  select: CustomEvent<Id | null>
}
