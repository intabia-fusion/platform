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

import core, {
  setCurrentAccount,
  AccountRole,
  type Account,
  type AccountUuid,
  type PersonId,
  type Ref,
  type TxOperations
} from '@hcengineering/core'
import tracker, { recordIssueView, type Issue } from '@hcengineering/tracker'

const account: Account = {
  uuid: 'alice' as AccountUuid,
  role: AccountRole.User,
  primarySocialId: 'alice' as PersonId,
  socialIds: ['alice' as PersonId],
  fullSocialIds: []
}
setCurrentAccount(account)

const issue = 'issue-1' as Ref<Issue>

describe('recording issue openings', () => {
  const operation = (): any => ({
    match: jest.fn(),
    notMatch: jest.fn(),
    createDoc: jest.fn(),
    updateDoc: jest.fn(),
    commit: jest.fn(async () => ({ result: true }))
  })

  it('creates one private record, conditional on the issue still existing', async () => {
    const op = operation()
    const client = { findOne: jest.fn(async () => undefined), apply: jest.fn(() => op) }
    await recordIssueView(client as unknown as TxOperations, issue)
    expect(client.apply).toHaveBeenCalledWith('issue-view:alice:issue-1')
    expect(op.match).toHaveBeenCalledWith(tracker.class.Issue, { _id: issue })
    expect(op.createDoc).toHaveBeenCalledWith(
      tracker.class.IssueViewPreference,
      core.space.Workspace,
      { attachedTo: issue },
      'issue-view:alice:issue-1'
    )
    expect(op.updateDoc).not.toHaveBeenCalled()
  })

  it('retries a concurrent first opening as an update, without touching the issue', async () => {
    const first = operation()
    first.commit.mockResolvedValue({ result: false })
    const second = operation()
    const client = {
      findOne: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce({
        _id: 'issue-view:alice:issue-1',
        space: core.space.Workspace,
        modifiedOn: 1
      }),
      apply: jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    }
    await recordIssueView(client as unknown as TxOperations, issue)
    expect(second.updateDoc).toHaveBeenCalledWith(
      tracker.class.IssueViewPreference,
      core.space.Workspace,
      'issue-view:alice:issue-1',
      {}
    )
    expect(second.createDoc).not.toHaveBeenCalled()
  })

  it('guards updates against removal and stops after two conflicts', async () => {
    const op = operation()
    op.commit.mockResolvedValue({ result: false })
    const client = {
      findOne: jest.fn(async () => ({ modifiedOn: 42, space: core.space.Workspace })),
      apply: jest.fn(() => op)
    }
    await recordIssueView(client as unknown as TxOperations, issue)
    expect(op.match).toHaveBeenCalledWith(tracker.class.IssueViewPreference, { _id: 'issue-view:alice:issue-1' })
    expect(op.commit).toHaveBeenCalledTimes(2)
  })
})
