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

import { type Timestamp } from '@hcengineering/core'
import task, { type TimeManaged } from '@hcengineering/task'

type Dates = Pick<TimeManaged, 'startDate'>

/**
 * Start date to write on a status change: entering an active category, only when empty. The end is `dueDate`, not touched here.
 */
export function timeManagedUpdate (current: Dates | undefined, category: string | undefined, date: Timestamp): Dates {
  return category === task.statusCategory.Active && current?.startDate == null ? { startDate: date } : {}
}
