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

import core, { setCurrentAccount, type Ref, type TxOperations } from '@hcengineering/core'
import type { Board, Project } from '@hcengineering/tracker'
import { getCurrentResolvedLocation, navigate } from '@hcengineering/ui'
import { filtersToQuery } from '@hcengineering/view-resources'
import { createQuery } from '@hcengineering/presentation'
import task from '@hcengineering/task'
import { boardLocation, boardQuery, ConditionMatches, createBoard, togglePinned, updateBoard } from '../boards'
import tracker from '../plugin'

// The module imports UI packages that need a browser; only these calls are used
jest.mock('@hcengineering/contact', () => ({ getCurrentEmployeeSpace: () => 'anna-space' }))
jest.mock('@hcengineering/presentation', () => ({ createQuery: jest.fn() }))
jest.mock('@hcengineering/ui', () => ({ getCurrentResolvedLocation: jest.fn(), navigate: jest.fn() }))
jest.mock('@hcengineering/view-resources', () => ({
  filtersToQuery: jest.fn(),
  // Conditions in these tests are JSON arrays of {q}, the parsed form is enough for the mock
  parseFilters: (value: string) => (value === '' ? [] : JSON.parse(value))
}))
setCurrentAccount(stub<any>({ uuid: 'anna' }))

// Partial objects stand in for the platform types the code only reads
function stub<T> (value: object): T {
  return value as T
}

const ref = <T>(s: string): Ref<any> & T => s as any

const makeBoard = (patch: Partial<Board> = {}): Board =>
  stub<Board>({
    _id: ref('b1'),
    title: 'Board',
    projects: [ref('p1'), ref('p2')],
    filter: '',
    quickFilters: [],
    ...patch
  })

describe('boardQuery', () => {
  const filters = filtersToQuery as jest.Mock
  beforeEach(() => {
    filters.mockReset()
    // The condition text is the key of the query part
    filters.mockImplementation(async (_c: unknown, _q: unknown, parsed: Array<{ q: any }>) => parsed[0].q)
  })

  it('limits issues to the board projects', async () => {
    expect(await boardQuery(stub<TxOperations>({}), makeBoard(), new Set(), () => {})).toEqual({
      space: { $in: ['p1', 'p2'] }
    })
    expect(filters).not.toHaveBeenCalled()
  })

  it('adds the board filter', async () => {
    const board = makeBoard({ filter: JSON.stringify([{ q: { priority: 1 } }]) })
    const query = await boardQuery(stub<TxOperations>({}), board, new Set(), () => {})
    expect(query).toMatchObject({ space: { $in: ['p1', 'p2'] }, priority: 1 })
  })

  it('adds only the quick filters that are on', async () => {
    const board = makeBoard({
      quickFilters: [
        { id: 'a', title: 'A', condition: JSON.stringify([{ q: { priority: 1 } }]) },
        { id: 'b', title: 'B', condition: JSON.stringify([{ q: { assignee: 'x' } }]) },
        { id: 'c', title: 'C', condition: '' }
      ]
    })
    const only = await boardQuery(stub<TxOperations>({}), board, new Set(['b', 'c']), () => {})
    expect(only).toMatchObject({ assignee: 'x' })
    expect(only).not.toHaveProperty('priority')
    expect(filters).toHaveBeenCalledTimes(1)
  })
})

describe('board locations', () => {
  const navigateMock = navigate as jest.Mock
  const location = (path: string[], query?: Record<string, string>): void => {
    ;(getCurrentResolvedLocation as jest.Mock).mockReturnValue({ path: [...path], query, fragment: 'f' })
  }
  const target = (): any => navigateMock.mock.calls[navigateMock.mock.calls.length - 1][0]

  beforeEach(() => {
    navigateMock.mockReset()
  })

  it('opens a board page, with settings and a tab', () => {
    location(['workbench', 'ws', 'tracker', 'boards', 'old', 'settings'])
    boardLocation(ref<Board>('b1'))
    expect(target().path).toEqual(['workbench', 'ws', 'tracker', 'boards', 'b1'])
    expect(target().fragment).toBeUndefined()

    boardLocation(ref<Board>('b1'), true, 'card')
    expect(target().path).toEqual(['workbench', 'ws', 'tracker', 'boards', 'b1', 'settings'])
    expect(target().query).toEqual({ tab: 'card' })
  })

  it('drops the tab when the settings are not asked', () => {
    location(['workbench', 'ws', 'tracker', 'boards', 'b1'], { tab: 'card' })
    boardLocation(ref<Board>('b1'), false, 'card')
    expect(target().query).toBeUndefined()
  })

  it('goes to the list of boards without an id', () => {
    location(['workbench', 'ws', 'tracker', 'p1', 'issues'])
    boardLocation(undefined)
    expect(target().path).toEqual(['workbench', 'ws', 'tracker', 'boards'])
  })
})

describe('createBoard', () => {
  it('saves the given projects, visibility, editors, filter and columns', async () => {
    const createDoc = jest.fn(async () => 'new')
    const columns = [{ id: 'c1', title: 'My column', category: task.statusCategory.UnStarted, statuses: [] }]
    const data = {
      title: 'Title',
      description: 'About',
      projects: [ref<Project>('p1')],
      visibility: 'me' as const,
      editors: [],
      filter: '[]',
      columns
    }
    const id = await createBoard(stub<any>({ createDoc }), data)
    expect(id).toBe('new')
    const [cls, space, doc] = createDoc.mock.calls[0] as any[]
    expect(cls).toBe(tracker.class.Board)
    expect(space).toBe('anna-space')
    expect(doc).toMatchObject({
      title: 'Title',
      description: 'About',
      projects: ['p1'],
      visibility: 'me',
      author: 'anna',
      editors: [],
      filter: '[]'
    })
    expect(doc.columns.map((c: any) => [c.title, c.statuses])).toEqual([['My column', []]])
  })
})

describe('createBoard visibility', () => {
  it('puts a team board into the workspace space', async () => {
    const createDoc = jest.fn(async () => 'new')
    const data = { title: 'T', projects: [], visibility: 'all' as const, editors: [], filter: '', columns: [] }
    await createBoard(stub<any>({ createDoc }), data)
    expect((createDoc.mock.calls[0] as any[])[1]).toBe(core.space.Workspace)
  })
})

describe('updateBoard', () => {
  const board = makeBoard({ space: core.space.Workspace, visibility: 'all' })

  it('moves the board to the personal space with the switch to "me"', async () => {
    const update = jest.fn()
    await updateBoard(stub<any>({ update }), board, { visibility: 'me' })
    expect(update).toHaveBeenCalledWith(board, { visibility: 'me', space: 'anna-space' })
  })

  it('moves a personal board back to the workspace', async () => {
    const update = jest.fn()
    const personal = makeBoard({ space: 'anna-space' as any, visibility: 'me' })
    await updateBoard(stub<any>({ update }), personal, { visibility: 'all' })
    expect(update).toHaveBeenCalledWith(personal, { visibility: 'all', space: core.space.Workspace })
  })

  it('keeps the space for other edits and for the same visibility', async () => {
    const update = jest.fn()
    await updateBoard(stub<any>({ update }), board, { title: 'New' })
    await updateBoard(stub<any>({ update }), board, { visibility: 'all' })
    expect(update).toHaveBeenNthCalledWith(1, board, { title: 'New' })
    expect(update).toHaveBeenNthCalledWith(2, board, { visibility: 'all' })
  })
})

describe('togglePinned', () => {
  it('pins a board that is not pinned', async () => {
    const client = { findOne: jest.fn(async () => undefined), createDoc: jest.fn(), remove: jest.fn() }
    await togglePinned(client as any, ref<Board>('b1'))
    expect(client.createDoc).toHaveBeenCalledWith(tracker.class.BoardPreference, core.space.Workspace, {
      attachedTo: 'b1'
    })
    expect(client.remove).not.toHaveBeenCalled()
  })

  it('unpins a pinned board', async () => {
    const pref = { _id: 'pref' }
    const client = { findOne: jest.fn(async () => pref), createDoc: jest.fn(), remove: jest.fn() }
    await togglePinned(client as any, ref<Board>('b1'))
    expect(client.remove).toHaveBeenCalledWith(pref)
    expect(client.createDoc).not.toHaveBeenCalled()
  })
})

describe('ConditionMatches', () => {
  interface Live {
    unsubscribe: jest.Mock
    answer: (ids: string[]) => void
    scope: unknown
  }
  let lives: Live[]

  beforeEach(() => {
    lives = []
    ;(filtersToQuery as jest.Mock).mockReset()
    ;(filtersToQuery as jest.Mock).mockImplementation(
      async (_c: unknown, _q: unknown, parsed: Array<{ q: any }>) => parsed[0].q
    )
    ;(createQuery as jest.Mock).mockImplementation(() => {
      const live: Live = { unsubscribe: jest.fn(), answer: () => {}, scope: undefined }
      lives.push(live)
      return {
        unsubscribe: live.unsubscribe,
        query: (_cls: unknown, q: unknown, cb: (res: Array<{ _id: string }>) => void) => {
          live.scope = q
          live.answer = (ids) => {
            cb(ids.map((_id) => ({ _id })))
          }
        }
      }
    })
  })

  const cond = (q: object): string => JSON.stringify([{ q }])

  it('is ready only when every query answered', async () => {
    const onChange = jest.fn()
    const matches = new ConditionMatches(onChange)
    await matches.sync(
      stub<TxOperations>({}),
      [{ id: 'a', condition: cond({ priority: 1 }) }],
      stub<any>({ space: 's' })
    )
    expect(matches.ready).toBe(false)
    lives[0].answer(['i1'])
    expect(matches.ready).toBe(true)
    expect(matches.has('a', ref('i1'))).toBe(true)
    expect(matches.has('a', ref('i2'))).toBe(false)
    expect(lives[0].scope).toEqual({ space: 's', priority: 1 })
  })

  it('ignores items without a condition', async () => {
    const matches = new ConditionMatches(() => {})
    await matches.sync(stub<TxOperations>({}), [{ id: 'a', condition: '' }], stub<any>({}))
    expect(lives).toHaveLength(0)
    expect(matches.ready).toBe(true)
  })

  it('keeps the query of an unchanged item and drops the removed one', async () => {
    const matches = new ConditionMatches(() => {})
    const items = [
      { id: 'a', condition: cond({ priority: 1 }) },
      { id: 'b', condition: cond({ priority: 2 }) }
    ]
    await matches.sync(stub<TxOperations>({}), items, stub<any>({}))
    lives[0].answer(['i1'])
    lives[1].answer(['i2'])
    await matches.sync(stub<TxOperations>({}), [items[0]], stub<any>({}))
    expect(lives).toHaveLength(2)
    expect(lives[0].unsubscribe).not.toHaveBeenCalled()
    expect(lives[1].unsubscribe).toHaveBeenCalled()
    expect(matches.has('b', ref('i2'))).toBe(false)
    expect(matches.ready).toBe(true)
  })

  it('asks again when the scope changes', async () => {
    const matches = new ConditionMatches(() => {})
    const items = [{ id: 'a', condition: cond({ priority: 1 }) }]
    await matches.sync(stub<TxOperations>({}), items, stub<any>({ space: 's1' }))
    await matches.sync(stub<TxOperations>({}), items, stub<any>({ space: 's2' }))
    expect(lives).toHaveLength(2)
    expect(lives[0].unsubscribe).toHaveBeenCalled()
  })

  it('unsubscribes everything on destroy', async () => {
    const matches = new ConditionMatches(() => {})
    await matches.sync(stub<TxOperations>({}), [{ id: 'a', condition: cond({ priority: 1 }) }], stub<any>({}))
    lives[0].answer(['i1'])
    matches.destroy()
    expect(lives[0].unsubscribe).toHaveBeenCalled()
    expect(matches.has('a', ref('i1'))).toBe(false)
  })
})
