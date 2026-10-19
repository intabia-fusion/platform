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

import { isOwnerOrMaintainer, type Ref } from '@hcengineering/core'
import { PlatformError, Severity, Status, translate } from '@hcengineering/platform'
import { getClient } from '@hcengineering/presentation'
import {
  statusMergeDomain,
  statusUsageDomain,
  type MergeStatusesParams,
  type MergeStatusesResult,
  type StatusUsageParams,
  type StatusUsageResult,
  type TaskType
} from '@hcengineering/task'
import task from './plugin'

/**
 * Server merge of project type statuses, Maintainer only. `ok: false` wrote nothing.
 * A failed request comes back as one conflict: the merge may be unfinished, run it again.
 * @public
 */
export async function mergeStatuses (params: MergeStatusesParams): Promise<MergeStatusesResult> {
  const res = (await getClient().domainRequest<MergeStatusesResult | null>(statusMergeDomain, params)).value
  if (res != null) return res
  // The presentation pipeline shows the reason and gives null
  const message = await translate(task.status.StatusRequestFailed, {})
  return { ok: false, merged: [], tasksMoved: 0, removed: [], kept: [], conflicts: [{ kind: 'conflict', message }] }
}

/**
 * Tasks and projects that use a status, counted by the server over the whole workspace.
 * Maintainer only (check first: the pipeline shows a failed request). Throws on failure.
 * @public
 */
export async function getStatusUsage (params: StatusUsageParams): Promise<StatusUsageResult> {
  const res = (await getClient().domainRequest<StatusUsageResult | null>(statusUsageDomain, params)).value
  if (res == null) throw new PlatformError(new Status(Severity.ERROR, task.status.StatusRequestFailed, {}))
  return res
}

/**
 * Tasks of the usage in the given task types, all task types of the project type when absent.
 * @public
 */
export function countStatusTasks (usage: StatusUsageResult, kinds?: Array<Ref<TaskType>>): number {
  const counts = kinds === undefined ? Object.values(usage.byKind) : kinds.map((kind) => usage.byKind[kind] ?? 0)
  return counts.reduce((sum, it) => sum + it, 0)
}

/**
 * Server count of tasks in the given task types for a Maintainer, `fallback` (a client query,
 * blind to archived and non-member spaces) for others and when the request failed.
 * @public
 */
export async function loadStatusTaskCount (
  params: StatusUsageParams,
  kinds: Array<Ref<TaskType>> | undefined,
  fallback: () => Promise<number>
): Promise<number> {
  if (isOwnerOrMaintainer()) {
    try {
      return countStatusTasks(await getStatusUsage(params), kinds)
    } catch {
      // The pipeline shows the failed request
    }
  }
  return await fallback()
}
