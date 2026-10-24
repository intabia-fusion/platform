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

/** One crumb: a button back to that level, or the current page as plain text. */
export interface BreadcrumbProps {
  /** Text without translation (an object name) - `getEmbeddedLabel(text)`. */
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  /** `true` by default: the icon sits on a small plate; `false` for an avatar, drawn as is at its own width. */
  iconBox?: boolean
  /** The page the user is on: bold text with `aria-current="page"`, not clickable. */
  current?: boolean
}

export interface BreadcrumbEvents {
  click: MouseEvent
}

export interface BreadcrumbsItem extends Omit<BreadcrumbProps, 'current'> {
  /** The place's own key to tell the items apart in `on:select`; not rendered. */
  id?: string
}

/** The path to the current page; the last item is the current one. */
export interface BreadcrumbsProps {
  items: BreadcrumbsItem[]
  /** Without it and `aria-labelledby` the landmark is named "Breadcrumbs". */
  'aria-label'?: string
  'aria-labelledby'?: string
}

export interface BreadcrumbsEvents {
  /** Index of the clicked item; the current (last) one is not clickable. */
  select: CustomEvent<number>
}
