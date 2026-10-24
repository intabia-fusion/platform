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

import type { IconComponent, IconSize } from '../../types'

/** `outline` - a pinned tab: frame without fill. */
export type WorkbenchTabKind = 'secondary' | 'outline'

export type WorkbenchTabOrientation = 'horizontal' | 'vertical'

/**
 * A tab of an opened object in a strip the place owns: workbench tabs, widget tabs of the sidebar.
 * Sections of one screen are `Tabs`.
 */
export interface WorkbenchTabProps {
  /** Ready text (a document title) goes through `getEmbeddedLabel`. */
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  /** `x-small` by default; avatars of people are `tiny`. */
  iconSize?: IconSize
  selected?: boolean
  /** Shows the close button; Delete closes a focused tab too. */
  closable?: boolean
  /** A temporary tab that the next opened one replaces: the label is italic. */
  preview?: boolean
  kind?: WorkbenchTabKind
  /** `vertical` - the side strip: text runs top to bottom. */
  orientation?: WorkbenchTabOrientation
  /**
   * By default only the selected tab is a tab stop; arrows move between the tabs of the strip.
   * With no tab selected the strip gives `tabindex={0}` to the first one, which a single tab cannot know.
   */
  tabindex?: number
  id?: string
  'aria-controls'?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface WorkbenchTabEvents {
  click: MouseEvent
  dblclick: MouseEvent
  /** The close button or Delete; `null`: a DOM event detail cannot be `undefined`. */
  close: CustomEvent<null>
  /** The context menu was requested; the browser menu is already suppressed. */
  menu: CustomEvent<MouseEvent>
}
