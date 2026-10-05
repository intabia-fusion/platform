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

import workflow from '@hcengineering/model-workflow'
import { type TriggerControl } from '@hcengineering/server-core'
import { type Task } from '@hcengineering/task'
import { type WorkflowFieldValue, type WorkflowValueFunction } from '@hcengineering/workflow'
import { resolveValue } from '../post-functions/evaluator'

const asFunc = (_id: unknown, type: 'convert' | 'transform'): WorkflowValueFunction =>
  ({ _id, type }) as unknown as WorkflowValueFunction

const task = {} as unknown as Task

function createControl (funcs: WorkflowValueFunction[]): TriggerControl {
  return {
    ctx: { error: jest.fn() },
    modelDb: { findAllSync: () => funcs }
  } as unknown as TriggerControl
}

describe('resolveValue', () => {
  it('applies convert functions', async () => {
    const val = {
      type: 'const',
      value: '42',
      functions: [{ func: workflow.function.NumberFromText }]
    } as unknown as WorkflowFieldValue

    const result = await resolveValue(val, task, createControl([asFunc(workflow.function.NumberFromText, 'convert')]))

    expect(result).toBe(42)
  })

  it('applies transform functions', async () => {
    const val = {
      type: 'const',
      value: 'abc',
      functions: [{ func: workflow.function.UpperCase }]
    } as unknown as WorkflowFieldValue

    const result = await resolveValue(val, task, createControl([asFunc(workflow.function.UpperCase, 'transform')]))

    expect(result).toBe('ABC')
  })
})
