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

import core, { DOMAIN_TX, type TxCUD, type Ref } from '@hcengineering/core'
import type { MigrationClient } from '@hcengineering/model'
import task from '@hcengineering/task'
import tracker, { type Issue } from '@hcengineering/tracker'
import { migrateIssueCompletedOn } from '../migration'

jest.mock('../index', () => ({ classicIssueTaskStatuses: [] }))

const issueId = 'issue' as Ref<Issue>
const statuses = [
  { _id: 'done', category: task.statusCategory.Won },
  { _id: 'done2', category: task.statusCategory.Won },
  { _id: 'open', category: task.statusCategory.Active }
]
const create = (status: string, modifiedOn: number): TxCUD<Issue> =>
  ({
    objectId: issueId,
    _class: core.class.TxCreateDoc,
    attributes: { status },
    modifiedOn
  }) as any
const update = (status: string, modifiedOn: number): TxCUD<Issue> =>
  ({
    objectId: issueId,
    _class: core.class.TxUpdateDoc,
    operations: { status },
    modifiedOn
  }) as any

async function migrate (txes: Array<TxCUD<Issue>>): Promise<{ bulk: jest.Mock, close: jest.Mock }> {
  const bulk = jest.fn()
  const close = jest.fn()
  // Split the history across batches to verify state is preserved by the iterator.
  const batches = txes.map((tx) => [tx])
  const client = {
    hierarchy: { getDescendants: () => [tracker.class.Issue] },
    model: { findAllSync: () => statuses },
    update: jest.fn(),
    find: jest.fn(async () => [{ _id: issueId, status: 'done' }]),
    traverse: jest.fn(async () => ({ next: async () => batches.shift() ?? [], close })),
    bulk
  } as unknown as MigrationClient
  await migrateIssueCompletedOn(client)
  expect(client.traverse).toHaveBeenCalledWith(DOMAIN_TX, expect.anything(), expect.anything())
  expect(close).toHaveBeenCalledTimes(1)
  return { bulk, close }
}

describe('completion date migration', () => {
  it.each([
    { txes: [create('done', 10)], date: 10 },
    { txes: [create('open', 10), update('done', 20)], date: 20 },
    { txes: [create('open', 10), update('done2', 20), update('done', 30)], date: 20 },
    { txes: [create('done', 10), update('open', 20), update('done', 30)], date: 30 }
  ])('restores the start of the latest completed period: $date', async ({ txes, date }) => {
    const { bulk } = await migrate(txes)
    expect(bulk).toHaveBeenCalledWith(expect.anything(), [
      {
        filter: { _id: issueId, completedOn: { $exists: false } },
        update: { completedOn: date }
      }
    ])
  })

  it.each([
    { history: [] },
    { history: [update('done', 20)] },
    { history: [create('unknown-status', 10), update('done', 20)] },
    { history: [create('done', 10), update('open', 20)] }
  ])('keeps incomplete or inconsistent history visible ($history)', async ({ history }) => {
    const { bulk } = await migrate(history)
    expect(bulk).not.toHaveBeenCalled()
  })
})
