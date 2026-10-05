/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import core, { type Ref, TxFactory } from '@hcengineering/core'
import { type Execution, ExecutionStatus, type Process } from '@hcengineering/process'
import { type ProcessControl } from '@hcengineering/server-process'
import { RunSubProcess } from '../functions'

const processRef = 'process:1' as Ref<Process>
const cardRef = 'card:1'

function createControl (existing: Array<Record<string, unknown>>): ProcessControl {
  return {
    client: {
      getModel: () => ({ findObject: () => ({ _id: processRef, parallelExecutionForbidden: true }) }),
      // Match like a real store: a query on a field the document does not have finds nothing.
      findAll: jest.fn(async (_class: unknown, query: Record<string, unknown>) =>
        existing.filter((doc) => Object.entries(query).every(([k, v]) => doc[k] === v))
      ),
      txFactory: new TxFactory(core.account.System, true)
    }
  } as unknown as ProcessControl
}

describe('RunSubProcess', () => {
  it('does not start a second execution while parallel execution is forbidden', async () => {
    const running = { process: processRef, card: cardRef, status: ExecutionStatus.Active }
    const execution = { _id: 'exec:parent', space: core.space.Workspace, card: cardRef } as unknown as Execution

    const result = await RunSubProcess({ _id: processRef, card: cardRef } as any, execution, createControl([running]))

    expect((result as { txes: unknown[] }).txes).toHaveLength(0)
  })
})
