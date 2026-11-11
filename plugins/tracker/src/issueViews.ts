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

import core, { getCurrentAccount, type Ref, type TxOperations } from '@hcengineering/core'
import tracker, { type Issue, type IssueViewPreference } from './index'

// modifiedOn is stamped by the server; browser clocks do not determine the order.
// The apply scope serializes concurrent openings of the same issue by the same account.
/** @public */
export async function recordIssueView (client: TxOperations, issue: Ref<Issue>): Promise<void> {
  const id = `issue-view:${getCurrentAccount().uuid}:${issue}` as Ref<IssueViewPreference>
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await client.findOne(tracker.class.IssueViewPreference, { _id: id })
    const operations = client.apply(id)
    // A delayed opening must not create a record for an already removed issue.
    operations.match(tracker.class.Issue, { _id: issue })
    if (before === undefined) {
      operations.notMatch(tracker.class.IssueViewPreference, { _id: id })
      await operations.createDoc(
        tracker.class.IssueViewPreference,
        core.space.Workspace,
        {
          attachedTo: issue
        },
        id
      )
    } else {
      operations.match(tracker.class.IssueViewPreference, { _id: id })
      await operations.updateDoc(tracker.class.IssueViewPreference, before.space, id, {})
    }
    if ((await operations.commit()).result) return
  }
}
