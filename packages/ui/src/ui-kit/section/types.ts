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

/** A titled block of an object page (members, applications, activity): a header line with actions over the content. */
export interface SectionProps {
  label: IntlString
  labelParams?: Record<string, any>
  icon?: IconComponent
  iconProps?: Record<string, any>
  /** Heading level of the title, 2 by default; 3 and 4 for a section inside another section. */
  level?: 2 | 3 | 4
  /** Goes to the root element: an anchor to scroll to (`members`). */
  id?: string
}
