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

import type { Ref, Status } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import type { ProjectType, TaskType } from '@hcengineering/task'
import { SelectPopup, showPopup, type PopupAlignment } from '@hcengineering/ui'
import MergeStatusesConfirm from './components/projectTypes/MergeStatusesConfirm.svelte'
import StatusPickItem from './components/projectTypes/StatusPickItem.svelte'
import task from './plugin'

/**
 * Step 1 of a status merge: a plain selector of statuses, `onPicked` gets the chosen one.
 * `mode` tells whether the chosen status is the one merged into (the row action) or the one that stays (a group).
 */
export function pickStatusForMerge (
  anchor: PopupAlignment,
  type: ProjectType,
  statuses: Status[],
  taskTypes: TaskType[],
  mode: 'into' | 'keep',
  onPicked: (id: Ref<Status>) => void,
  placeholder?: IntlString
): void {
  // Which category a status is in matters only when the options differ in it
  const showCategory = new Set(statuses.map((it) => it.category)).size > 1
  showPopup(
    SelectPopup,
    {
      searchable: true,
      width: 'large',
      placeholder: placeholder ?? (mode === 'into' ? task.string.MergePickInto : task.string.MergePickKeep),
      value: statuses.map((status) => ({
        id: status._id,
        text: status.name,
        component: StatusPickItem,
        props: { value: status, projectType: type._id, taskTypes, showCategory }
      }))
    },
    anchor,
    (id) => {
      if (id !== undefined && id !== null) onPicked(id as Ref<Status>)
    }
  )
}

/**
 * Step 2 of a status merge: confirmation that lists what changes, the merge runs on confirm.
 * A refusal keeps the dialog open and lists the conflicts in it.
 * `transfer`: server constraint mode, the category may differ and the source may be outside the project type.
 * `origin`: where the dialog came from, it only picks the wording (merge or delete with transfer).
 */
export function confirmStatusMerge (
  type: ProjectType,
  sources: Status[],
  target: Status,
  taskTypes: TaskType[],
  onDone?: () => void,
  options: { transfer?: boolean, origin?: 'merge' | 'delete' } = {}
): void {
  showPopup(
    MergeStatusesConfirm,
    { type, sources, target, taskTypes, transfer: options.transfer === true, origin: options.origin ?? 'merge' },
    'top',
    (res) => {
      if (res === true) onDone?.()
    }
  )
}
