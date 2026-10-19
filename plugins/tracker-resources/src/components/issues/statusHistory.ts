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

import type { Ref, Timestamp, Tx, TxCreateDoc, TxUpdateDoc } from '@hcengineering/core'
import core from '@hcengineering/core'
import type { Issue, IssueStatus } from '@hcengineering/tracker'

export interface StatusDuration {
  status: Ref<IssueStatus>
  duration: number
}

export function calcStatusDurations (
  txes: Tx[],
  issueStatus: Ref<IssueStatus>,
  issueModifiedOn: Timestamp,
  now: Timestamp
): StatusDuration[] {
  const result: StatusDuration[] = []
  const add = (status: Ref<IssueStatus>, duration: number): void => {
    const found = result.find((it) => it.status === status)
    if (found !== undefined) {
      found.duration += duration
    } else {
      result.push({ status, duration })
    }
  }

  let current: Ref<IssueStatus> | undefined
  let last: Timestamp = now
  for (const it of txes) {
    let newStatus: Ref<IssueStatus> | undefined
    if (it._class === core.class.TxCreateDoc) {
      const op = it as TxCreateDoc<Issue>
      if (op.attributes.status !== undefined) {
        newStatus = op.attributes.status
        last = it.modifiedOn
      }
    }
    if (it._class === core.class.TxUpdateDoc) {
      const op = it as TxUpdateDoc<Issue>
      if (op.operations.status !== undefined) {
        newStatus = op.operations.status
      }
    }
    if (current === undefined) {
      current = newStatus
      last = it.modifiedOn
    } else if (current !== newStatus && newStatus !== undefined) {
      add(current, it.modifiedOn - last)
      current = newStatus
      last = it.modifiedOn
    }
  }
  // Derived txes of a status merge are not in the tx log, so the doc is the source of the current status
  if (current !== issueStatus) {
    const switchedAt = Math.min(now, current === undefined ? issueModifiedOn : Math.max(last, issueModifiedOn))
    if (current !== undefined) {
      add(current, switchedAt - last)
    }
    current = issueStatus
    last = switchedAt
  }
  add(current, now - last)

  return result.sort((a, b) => b.duration - a.duration)
}
