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

import type { Mixin, Ref } from '@hcengineering/core'
import { createProjectWithMixins, type CreateProjectInput } from '../projectCreate'

const input = {
  projectData: { identifier: 'ABC', name: 'n' },
  typeId: 'type',
  targetClass: 'target' as Ref<Mixin<any>>,
  rolesAssignment: { r1: ['a'] },
  workflowsMapping: { tt: 'wf' }
} as unknown as CreateProjectInput

function makeClient (commitResult: boolean | Error, mixinFails = false): { client: any, direct: jest.Mock, ops: any } {
  const direct = jest.fn(async () => ({}))
  const ops: any = {
    notMatch: jest.fn(() => ops),
    createDoc: jest.fn(async () => undefined),
    createMixin: jest.fn(async () => {
      if (mixinFails) throw new Error('mixin failed')
    }),
    commit: jest.fn(async () => {
      if (commitResult instanceof Error) throw commitResult
      return { result: commitResult }
    })
  }
  return { client: { apply: () => ops, createMixin: direct }, direct, ops }
}

describe('createProjectWithMixins', () => {
  it('writes project and both mixins in one apply', async () => {
    const { client, direct, ops } = makeClient(true)
    const res = await createProjectWithMixins(client, input)
    expect(res.ok).toBe(true)
    expect(ops.createMixin).toHaveBeenCalledTimes(2)
    expect(direct).not.toHaveBeenCalled()
  })

  it('does not commit when a mixin write throws', async () => {
    const { client, ops } = makeClient(true, true)
    await expect(createProjectWithMixins(client, input)).rejects.toThrow('mixin failed')
    expect(ops.commit).not.toHaveBeenCalled()
  })

  it('reports a taken identifier when the server refuses the commit', async () => {
    const { client } = makeClient(false)
    expect(await createProjectWithMixins(client, input)).toEqual({ ok: false, reason: 'identifier-taken' })
  })

  it('falls back to empty roles and skips the workflow mixin when no mapping', async () => {
    const { client, ops } = makeClient(true)
    await createProjectWithMixins(client, { ...input, rolesAssignment: undefined, workflowsMapping: {} })
    expect(ops.createMixin).toHaveBeenCalledTimes(1)
    expect(ops.createMixin.mock.calls[0][4]).toEqual({})
  })
})
