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

export type TabsId = string | number

export type TabsSize = 'medium' | 'small'

export interface TabsItem<Id extends TabsId = string> {
  id: Id
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  disabled?: boolean
  /** The DOM id of the tab button (`id` is the item key), for the panel's `aria-labelledby`. */
  tabId?: string
  /** The id of the tab panel this tab shows (`aria-controls`). */
  controls?: string
}

/**
 * Sections or views of one screen, an accent line under the selected one; the content is rendered by the place.
 * A value or mode of the same content (2-5 options) is a `SegmentedControl`.
 */
export interface TabsProps<Id extends TabsId = string> {
  items: Array<TabsItem<Id>>
  selected?: Id
  size?: TabsSize
  'aria-label'?: string
  'aria-labelledby'?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface TabsEvents<Id extends TabsId = string> {
  /** The tab that became selected; not fired for a click on the selected one. */
  select: CustomEvent<Id>
}
