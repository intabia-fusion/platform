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

import type { Status } from '@hcengineering/platform'

/** The result of an action as a line of text with an icon: an error under a dialog form, a warning. */
export interface StatusMessageProps {
  /** Its code and params are the message; `OK` shows nothing. */
  status: Status
  /** Long text wraps onto more lines; by default one line cut with an ellipsis. */
  wrap?: boolean
}
