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

import type { MeasureContext, WorkspaceIds } from '@hcengineering/core'
import type { Pipeline } from '@hcengineering/server-core'

import { Workspace } from '../workspace'

describe('Workspace.with', () => {
  it('retries pipeline creation after a failed build', async () => {
    const pipeline = {} as unknown as Pipeline
    const factory = jest.fn().mockRejectedValueOnce(new Error('build failed')).mockResolvedValueOnce(pipeline)
    const ws = new Workspace(
      {} as unknown as MeasureContext,
      'token',
      factory,
      0,
      0,
      {} as unknown as WorkspaceIds,
      null
    )

    await expect(ws.with(async () => 1)).rejects.toThrow('build failed')
    expect(await ws.with(async (p) => p)).toBe(pipeline)
    expect(factory).toHaveBeenCalledTimes(2)
    expect(ws.operations).toBe(0)
  })
})
