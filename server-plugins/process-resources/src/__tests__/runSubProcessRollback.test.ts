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
import core, { type Ref, TxFactory, type TxRemoveDoc } from '@hcengineering/core'
import { type Execution, type Process } from '@hcengineering/process'
import { type ProcessControl } from '@hcengineering/server-process'
import { RunSubProcess } from '../functions'

const processRef = 'process:1' as Ref<Process>

describe('RunSubProcess rollback', () => {
  it('removes the sub-execution in the space it was created in', async () => {
    const control = {
      client: {
        getModel: () => ({ findObject: () => ({ _id: processRef }) }),
        findAll: jest.fn(async () => []),
        txFactory: new TxFactory(core.account.System, true)
      }
    } as unknown as ProcessControl
    const execution = { _id: 'exec:parent', space: 'space:exec' as any, card: 'card:1' } as unknown as Execution

    const result = await RunSubProcess({ _id: processRef, card: 'card:1' } as any, execution, control)

    const removed = (result as unknown as { rollback: TxRemoveDoc<Execution>[] }).rollback[0]
    expect(removed.objectSpace).toBe(execution.space)
  })
})
