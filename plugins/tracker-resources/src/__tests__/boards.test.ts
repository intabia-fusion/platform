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

import core, { setCurrentAccount, type Ref, type Status, type TxOperations } from '@hcengineering/core'
import type { Board, Project } from '@hcengineering/tracker'
import { getCurrentResolvedLocation, navigate } from '@hcengineering/ui'
import { filtersToQuery } from '@hcengineering/view-resources'
import { createQuery } from '@hcengineering/presentation'
import { boardLocation, boardQuery, ConditionMatches, createBoard, projectBoardLocation, togglePinned } from '../boards'
import tracker from '../plugin'

// The module imports UI packages that need a browser; only these calls are used
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

  it('keeps a board of the project issues in place unless the page is asked', () => {
    location(['workbench', 'ws', 'tracker', 'p1', 'issues', 'b1'])
    boardLocation(ref<Board>('b2'), true, 'columns')
    expect(target().path).toEqual(['workbench', 'ws', 'tracker', 'p1', 'issues', 'b2', 'settings'])
    expect(target().query).toEqual({ tab: 'columns' })

    location(['workbench', 'ws', 'tracker', 'p1', 'issues', 'b1'])
    boardLocation(ref<Board>('b2'), false, undefined, true)
    expect(target().path).toEqual(['workbench', 'ws', 'tracker', 'boards', 'b2'])
  })

  it('gives the project issues their own view back without an id', () => {
    location(['workbench', 'ws', 'tracker', 'p1', 'issues', 'b1', 'settings'], { tab: 'card' })
    projectBoardLocation(undefined)
    expect(target().path).toEqual(['workbench', 'ws', 'tracker', 'p1', 'issues'])
    expect(target().query).toBeUndefined()
  })
})

describe('createBoard', () => {
  const status = (id: string, name: string, category?: string): Status => stub<Status>({ _id: ref(id), name, category })

  it('makes a column per status in the project order', async () => {
    const createDoc = jest.fn(async () => 'new')
    const project = stub<Project>({ _id: ref<Project>('p1') })
    const id = await createBoard(stub<any>({ createDoc }), 'Title', project, [
      status('s1', 'Backlog', 'cat1'),
      status('s2', 'Todo')
    ])
    expect(id).toBe('new')
    const [cls, space, data] = createDoc.mock.calls[0] as any[]
    expect(cls).toBe(tracker.class.Board)
    expect(space).toBe(core.space.Workspace)
    expect(data).toMatchObject({ title: 'Title', projects: ['p1'], visibility: 'all', author: 'anna', editors: [] })
    expect(data.columns.map((c: any) => [c.title, c.statuses, c.category])).toEqual([
      ['Backlog', ['s1'], 'cat1'],
      ['Todo', ['s2'], expect.any(String)]
    ])
    expect(new Set(data.columns.map((c: any) => c.id)).size).toBe(2)
  })

  it('makes a board without projects when no project is given', async () => {
    const createDoc = jest.fn(async () => 'new')
    await createBoard(stub<any>({ createDoc }), 'Title', undefined, [])
    expect((createDoc.mock.calls[0] as any[])[2].projects).toEqual([])
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
