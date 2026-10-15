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

import core, { type Ref, type Tx } from '@hcengineering/core'
import type { IssueStatus } from '@hcengineering/tracker'
import { calcStatusDurations } from '../components/issues/statusHistory'

const todo = 'todo' as Ref<IssueStatus>
const todo2 = 'todo2' as Ref<IssueStatus>
const done = 'done' as Ref<IssueStatus>

function create (status: Ref<IssueStatus>, modifiedOn: number): Tx {
  return { _class: core.class.TxCreateDoc, modifiedOn, attributes: { status } } as unknown as Tx
}

function update (status: Ref<IssueStatus>, modifiedOn: number): Tx {
  return { _class: core.class.TxUpdateDoc, modifiedOn, operations: { status } } as unknown as Tx
}

describe('calcStatusDurations', () => {
  it('uses the log when the doc status matches', () => {
    const res = calcStatusDurations([create(todo, 0), update(done, 10)], done, 10, 100)
    expect(res).toEqual([
      { status: done, duration: 90 },
      { status: todo, duration: 10 }
    ])
  })

  it('opens the doc status at modifiedOn when a merge moved the task', () => {
    const res = calcStatusDurations([create(todo, 0)], todo2, 40, 100)
    expect(res).toEqual([
      { status: todo2, duration: 60 },
      { status: todo, duration: 40 }
    ])
  })

  it('switches at the last tx when modifiedOn is not later', () => {
    const res = calcStatusDurations([create(todo, 0), update(done, 50)], todo2, 20, 100)
    expect(res).toEqual(
      expect.arrayContaining([
        { status: todo2, duration: 50 },
        { status: done, duration: 0 },
        { status: todo, duration: 50 }
      ])
    )
  })

  it('shows the doc status when the log is empty', () => {
    expect(calcStatusDurations([], todo, 30, 100)).toEqual([{ status: todo, duration: 70 }])
  })
})
