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
import type { AriaAttributes } from 'svelte/elements'

import type { IconComponent } from '../../types'

export type LinkLayout = 'cover' | 'thumb' | 'text'

export interface LinkPreviewData {
  title?: string
  url?: string
  description?: string
  image?: string
  imageWidth?: number
  imageHeight?: number
}

export interface LinkDetailsData {
  title?: string
  description?: string
  url?: string
  icon?: string
  image?: string
  hostname?: string
}

/** `end` - the ellipsis at the end by the width of the place; `middle` - in the middle, the ending stays (file names). */
export type LinkTruncate = 'end' | 'middle'

/**
 * A text link in running text: with `href` an `<a>` that navigates, without it a `<button>` for an inline action
 * (Create an application under an empty state). Font comes from the place.
 */
export interface LinkProps extends AriaAttributes {
  /** Text without translation (a file or site name) - `getEmbeddedLabel(text)`. */
  label: IntlString
  labelParams?: Record<string, any>
  href?: string
  /** Opens `href` in a new tab, without access back to this page. */
  external?: boolean
  icon?: IconComponent
  iconProps?: Record<string, any>
  disabled?: boolean
  /** Where a label too long for the place is cut, `end` by default. */
  truncate?: LinkTruncate
  id?: string
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export interface LinkEvents {
  click: MouseEvent
}
