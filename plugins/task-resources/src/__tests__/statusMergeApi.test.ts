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

import { addStringsLoader } from '@hcengineering/platform'
import { statusMergeDomain, statusUsageDomain } from '@hcengineering/task'
import task from '../plugin'
import { countStatusTasks, getStatusUsage, loadStatusTaskCount, mergeStatuses } from '../statusMergeApi'

const mockDomainRequest = jest.fn()
const mockIsOwnerOrMaintainer = jest.fn()

// The exports of core are getters, a spread would read them before core is initialized
jest.mock('@hcengineering/core', () => {
  const actual = jest.requireActual('@hcengineering/core')
  return new Proxy(actual, {
    get: (target, key) => (key === 'isOwnerOrMaintainer' ? () => mockIsOwnerOrMaintainer() : target[key])
  })
})

// The real module is a Svelte package that jest cannot load
jest.mock('@hcengineering/presentation', () => ({ getClient: () => ({ domainRequest: mockDomainRequest }) }))

const merge: any = { projectType: 'pt', target: 'a', sources: ['b'] }
const usage: any = { projectType: 'pt', status: 'a' }

describe('status requests', () => {
  beforeAll(() => {
    addStringsLoader('task' as any, async () => ({ status: { StatusRequestFailed: 'No answer from the server' } }))
  })

  beforeEach(() => {
    mockDomainRequest.mockReset()
  })

  it('gives the result of the merge as it is', async () => {
    const result = { ok: true, merged: ['b'], tasksMoved: 2, removed: ['b'], kept: [], conflicts: [] }
    mockDomainRequest.mockResolvedValue({ domain: statusMergeDomain, value: result })
    expect(await mergeStatuses(merge)).toBe(result)
    expect(mockDomainRequest).toHaveBeenCalledWith(statusMergeDomain, merge)
  })

  it('turns the null of the failed merge request into a refusal with a translated message', async () => {
    mockDomainRequest.mockResolvedValue({ domain: statusMergeDomain, value: null })
    const res = await mergeStatuses(merge)
    expect(res.ok).toBe(false)
    expect(res.conflicts).toEqual([{ kind: 'conflict', message: 'No answer from the server' }])
  })

  it('gives the usage as it is', async () => {
    const result = { tasks: 3, byKind: { tt: 3 }, projects: 1 }
    mockDomainRequest.mockResolvedValue({ domain: statusUsageDomain, value: result })
    expect(await getStatusUsage(usage)).toBe(result)
    expect(mockDomainRequest).toHaveBeenCalledWith(statusUsageDomain, usage)
  })

  it('throws a translatable error when the usage request failed', async () => {
    mockDomainRequest.mockResolvedValue({ domain: statusUsageDomain, value: null })
    await expect(getStatusUsage(usage)).rejects.toMatchObject({ status: { code: task.status.StatusRequestFailed } })
  })
})

describe('status task count', () => {
  const result = { tasks: 9, byKind: { a: 1, b: 2, c: 4 }, projects: 0 }

  beforeEach(() => {
    mockDomainRequest.mockReset()
    mockIsOwnerOrMaintainer.mockReset()
  })

  it('sums every kind without a list and only the listed kinds with one', () => {
    expect(countStatusTasks(result)).toBe(7)
    expect(countStatusTasks(result, ['a', 'c'] as any)).toBe(5)
    expect(countStatusTasks(result, ['a', 'missing'] as any)).toBe(1)
  })

  it('counts by the server for a maintainer', async () => {
    mockIsOwnerOrMaintainer.mockReturnValue(true)
    mockDomainRequest.mockResolvedValue({ domain: statusUsageDomain, value: result })
    const fallback = jest.fn().mockResolvedValue(0)
    expect(await loadStatusTaskCount(usage, ['b'] as any, fallback)).toBe(2)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('counts by the fallback without the maintainer role and does not ask the server', async () => {
    mockIsOwnerOrMaintainer.mockReturnValue(false)
    expect(await loadStatusTaskCount(usage, undefined, async () => 5)).toBe(5)
    expect(mockDomainRequest).not.toHaveBeenCalled()
  })

  it('counts by the fallback when the usage request failed', async () => {
    mockIsOwnerOrMaintainer.mockReturnValue(true)
    mockDomainRequest.mockResolvedValue({ domain: statusUsageDomain, value: null })
    expect(await loadStatusTaskCount(usage, undefined, async () => 3)).toBe(3)
  })
})
