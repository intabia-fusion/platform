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
import chunter from '@hcengineering/chunter'
import tracker from '@hcengineering/tracker'
import { lookupTarget, SPACE_RELOAD_MS } from '../targets'

function fakeRest (): any {
  const spaces: Record<string, any[]> = {
    [tracker.class.Project]: [{ _id: 'proj-1', identifier: 'TSK' }],
    [chunter.class.Channel]: [{ _id: 'ch-1' }]
  }
  return {
    spaces,
    findAll: jest.fn(async (_class: string) => spaces[_class] ?? []),
    findOne: jest.fn(async (_class: string, query: any) =>
      _class === tracker.class.Issue && query.identifier === 'TSK-1' ? { space: 'proj-1' } : undefined
    )
  }
}

describe('lookupTarget', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  test('project by identifier, channel by id, issue by identifier', async () => {
    const rest = fakeRest()
    const ws = '11111111-1111-4111-8111-111111111111' as any
    expect(await lookupTarget(rest, ws, 'issue:create', 'TSK')).toEqual({ found: true, space: 'proj-1' })
    expect(await lookupTarget(rest, ws, 'chat:post', 'ch-1')).toEqual({ found: true, space: 'ch-1' })
    expect(await lookupTarget(rest, ws, 'issue:comment', 'TSK-1')).toEqual({ found: true, space: 'proj-1' })
    expect(await lookupTarget(rest, ws, 'issue:comment', 'TSK-9')).toEqual({
      found: false,
      message: "Issue 'TSK-9' not found"
    })
  })

  test('a miss reloads the space index, but not within the reload interval', async () => {
    jest.useFakeTimers()
    const rest = fakeRest()
    const ws = '22222222-2222-4222-8222-222222222222' as any

    expect(await lookupTarget(rest, ws, 'chat:post', 'qqq')).toEqual({
      found: false,
      message: "Channel 'qqq' not found"
    })
    const loads = rest.findAll.mock.calls.length

    rest.spaces[chunter.class.Channel].push({ _id: 'qqq' })
    expect((await lookupTarget(rest, ws, 'chat:post', 'qqq')).found).toBe(false)
    expect(rest.findAll.mock.calls.length).toBe(loads)

    jest.advanceTimersByTime(SPACE_RELOAD_MS + 1)
    expect(await lookupTarget(rest, ws, 'chat:post', 'qqq')).toEqual({ found: true, space: 'qqq' })
  })
})
