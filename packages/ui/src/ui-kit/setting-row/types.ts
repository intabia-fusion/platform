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

/** One setting of a form or a dialog: the caption on the left, its control on the right, a line below. */
export interface SettingRowProps {
  label: IntlString
  labelParams?: Record<string, any>
  /** An info button after the caption that explains the setting. */
  hint?: IntlString
  /** The caption above the control, for a wide control such as a text area. */
  stacked?: boolean
}

export interface SettingRowSlots {
  /** The control; `labelId` names the caption for `aria-labelledby`. */
  default: { labelId: string }
  /** Under the caption and the control, above the line: picked values of the setting. */
  details: Record<string, never>
}
