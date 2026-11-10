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

import core, { setCurrentAccount, findProperty, type Ref, type TxOperations } from '@hcengineering/core'
import type { Board, Project } from '@hcengineering/tracker'
import { getCurrentResolvedLocation, locationToUrl, navigate, showPopup } from '@hcengineering/ui'
import { filtersToQuery } from '@hcengineering/view-resources'
import { copyTextToClipboard, createQuery, MessageBox } from '@hcengineering/presentation'
import task from '@hcengineering/task'
import {
  boardLocation,
  boardQuery,
  BoardQuery,
  ConditionMatches,
  createBoard,
  togglePinned,
  updateBoard,
  boardNavigationId,
  ensureBoardNavigation,
  setBoardInNavigation,
  shareBoard
} from '../boards'
import tracker from '../plugin'

// The module imports UI packages that need a browser; only these calls are used
jest.mock('@hcengineering/contact', () => ({ getCurrentEmployeeSpace: () => 'anna-space' }))
jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: {
    metadata: { FrontUrl: 'presentation:metadata:FrontUrl' },
    string: { CopyLink: 'presentation:string:CopyLink' }
  },
  copyTextToClipboard: jest.fn(),
  createQuery: jest.fn(),
  MessageBox: 'message-box'
}))
jest.mock('@hcengineering/ui', () => ({
  getCurrentResolvedLocation: jest.fn(),
  locationToUrl: jest.fn(),
  navigate: jest.fn(),
  showPopup: jest.fn()
}))
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
    ;(createQuery as jest.Mock).mockClear()
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
          return true
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

  it('recompiles nested conditions on updates and keeps unchanged queries usable', async () => {
    let update = (): void => {}
    let milestone = 'm1'
    ;(filtersToQuery as jest.Mock).mockImplementation(async (_c, _q, _p, callback) => {
      update = callback
      return { milestone }
    })
    const matches = new ConditionMatches(() => {})
    await matches.sync(stub<TxOperations>({}), [{ id: 'a', condition: cond({}) }], {})
    lives[0].answer(['i1'])
    milestone = 'm2'
    update()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(lives[0].scope).toEqual({ milestone: 'm2' })
    lives[0].answer(['i2'])
    expect(matches.has('a', ref('i1'))).toBe(false)
    expect(matches.has('a', ref('i2'))).toBe(true)
    const answer = lives[0].answer
    ;(createQuery as jest.Mock).mock.results[0].value.query = jest.fn(() => false)
    update()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(matches.ready).toBe(true)
    expect(matches.has('a', ref('i2'))).toBe(true)
    answer(['i3'])
    expect(matches.has('a', ref('i3'))).toBe(true)
    matches.destroy()
    update()
    await Promise.resolve()
    expect(matches.ids.size).toBe(0)
  })

  it('ignores an older async compilation and updates after destroy', async () => {
    const completions: Array<(query: object) => void> = []
    let update = (): void => {}
    ;(filtersToQuery as jest.Mock).mockImplementation(async (_c, _q, _p, callback) => {
      update = callback
      return await new Promise((resolve) => completions.push(resolve))
    })
    const matches = new ConditionMatches(() => {})
    const syncing = matches.sync(stub<TxOperations>({}), [{ id: 'a', condition: cond({}) }], {})
    update()
    completions[1]({ milestone: 'new' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    completions[0]({ milestone: 'old' })
    await syncing
    expect(lives[0].scope).toEqual({ milestone: 'new' })
    update()
    matches.destroy()
    completions[2]({ milestone: 'late' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(lives[0].scope).toEqual({ milestone: 'new' })
    expect(matches.ids.size).toBe(0)
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

describe('board navigation', () => {
  it('initializes the existing accessible list atomically, without private boards of others', async () => {
    const operations = {
      notMatch: jest.fn(),
      createDoc: jest.fn(),
      commit: jest.fn(async () => ({ result: true }))
    }
    const client = stub<TxOperations>({ findOne: jest.fn(async () => undefined), apply: () => operations })
    await ensureBoardNavigation(client, [
      makeBoard({ _id: ref('shared'), visibility: 'all', author: ref('bob') }),
      makeBoard({ _id: ref('mine'), visibility: 'me', author: ref('anna') }),
      makeBoard({ _id: ref('private'), visibility: 'me', author: ref('bob') })
    ])
    expect(operations.notMatch).toHaveBeenCalledWith(tracker.class.BoardNavigationPreference, {
      _id: boardNavigationId()
    })
    expect(operations.createDoc).toHaveBeenCalledWith(
      tracker.class.BoardNavigationPreference,
      core.space.Workspace,
      { attachedTo: 'tracker:boards-navigation', boards: ['shared', 'mine'] },
      boardNavigationId()
    )
  })

  it('does not add newly discovered shared boards to an initialized list', async () => {
    const apply = jest.fn()
    const client = stub<TxOperations>({ findOne: async () => ({ boards: ['old'] }), apply })
    await ensureBoardNavigation(client, [makeBoard({ visibility: 'all' })])
    expect(apply).not.toHaveBeenCalled()
  })

  it('adds only the requested board with an atomic duplicate guard', async () => {
    const operations = { notMatch: jest.fn(), updateDoc: jest.fn(), commit: jest.fn() }
    await setBoardInNavigation(stub<TxOperations>({ apply: () => operations }), ref('b1'), true)
    expect(operations.notMatch).toHaveBeenCalledWith(tracker.class.BoardNavigationPreference, {
      _id: boardNavigationId(),
      boards: { $in: ['b1'] }
    })
    expect(operations.updateDoc).toHaveBeenCalledWith(
      tracker.class.BoardNavigationPreference,
      core.space.Workspace,
      boardNavigationId(),
      { $push: { boards: 'b1' } }
    )
    expect(operations.commit).toHaveBeenCalledTimes(1)
  })

  it('hides without replacing concurrent additions, and removes the old pin', async () => {
    const pin = { _id: 'pin' }
    const updateDoc = jest.fn()
    const remove = jest.fn()
    const client = stub<TxOperations>({ updateDoc, remove, findOne: async () => pin })
    await setBoardInNavigation(client, ref('b1'), false)
    expect(updateDoc).toHaveBeenCalledWith(
      tracker.class.BoardNavigationPreference,
      core.space.Workspace,
      boardNavigationId(),
      { $pull: { boards: 'b1' } }
    )
    expect(remove).toHaveBeenCalledWith(pin)
  })
})

describe('shareBoard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(globalThis as any).window = { location: { origin: 'https://example.test' } }
    ;(getCurrentResolvedLocation as jest.Mock).mockReturnValue({
      path: ['workbench', 'workspace', 'tracker', 'boards', 'old', 'settings'],
      query: { tab: 'members' },
      fragment: 'old'
    })
    ;(locationToUrl as jest.Mock).mockReturnValue('/workbench/workspace/tracker/boards/b1')
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('copies a direct board URL without changing location or visibility', async () => {
    const board = makeBoard({ visibility: 'all' })
    await shareBoard(board)
    expect(locationToUrl).toHaveBeenCalledWith({
      path: ['workbench', 'workspace', 'tracker', 'boards', 'b1'],
      query: undefined,
      fragment: undefined
    })
    expect(copyTextToClipboard).toHaveBeenCalledWith('https://example.test/workbench/workspace/tracker/boards/b1')
    expect(navigate).not.toHaveBeenCalled()
    expect(board.visibility).toBe('all')
  })

  it('explains private access before copying a personal board URL', async () => {
    const board = makeBoard({ visibility: 'me' })
    await shareBoard(board)
    expect(copyTextToClipboard).not.toHaveBeenCalled()
    expect(showPopup).toHaveBeenCalledWith(
      MessageBox,
      expect.objectContaining({
        message: tracker.string.PersonalBoardShareHint
      })
    )
    await (showPopup as jest.Mock).mock.calls[0][1].action()
    expect(copyTextToClipboard).toHaveBeenCalledTimes(1)
    expect(board.visibility).toBe('me')
  })
})

describe('completed issue visibility', () => {
  const day = 24 * 60 * 60 * 1000
  const now = 1_800_000_000_000
  const docs = [
    { _id: 'old', status: 'done', completedOn: now - 20 * day },
    { _id: 'boundary', status: 'done', completedOn: now - 14 * day },
    { _id: 'recent', status: 'done', completedOn: now - day },
    { _id: 'open', status: 'open', completedOn: null },
    { _id: 'cancelled', status: 'cancelled', completedOn: null },
    { _id: 'unknown', status: 'done' },
    { _id: 'unknown-null', status: 'done', completedOn: null }
  ].map((d) => ({ space: 'p1', priority: 1, ...d }))
  const apply = (rows: any[], q: any): any[] => Object.entries(q).reduce((r, [k, v]) => findProperty(r, k, v), rows)
  const client = stub<TxOperations>({
    getModel: () => ({ findAllSync: () => [{ _id: 'done' }] }),
    findAll: jest.fn(async (_class, q) => apply(docs, q))
  })

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([undefined, 0] as const)('keeps all tasks when disabled (%s)', async (hideCompletedAfterDays) => {
    const q = await boardQuery(client, makeBoard({ hideCompletedAfterDays }), new Set(), () => {})
    expect(apply(docs, q)).toHaveLength(docs.length)
  })

  it.each([1, 3, 7, 14, 30, 90, 180, 365] as const)(
    'uses the selected rolling period (%s days)',
    async (hideCompletedAfterDays) => {
      const q = await boardQuery(client, makeBoard({ hideCompletedAfterDays }), new Set(), () => {})
      const ids = apply(docs, q).map((d) => d._id)
      expect(ids).toContain('open')
      expect(ids).toContain('cancelled')
      expect(ids).toContain('unknown')
      expect(ids).toContain('unknown-null')
      expect(ids).toContain('recent')
      expect(ids.includes('old')).toBe(hideCompletedAfterDays >= 30)
      expect(ids.includes('boundary')).toBe(hideCompletedAfterDays >= 14)
    }
  )

  it('uses a fixed date without hiding tasks on that date or advancing the cutoff', async () => {
    const before = now - 14 * day
    const board = makeBoard({ hideCompletedAfterDays: 7, hideCompletedBefore: before })
    const q = await boardQuery(client, board, new Set(), () => {})
    expect(apply(docs, q).map((d) => d._id)).toEqual([
      'boundary',
      'recent',
      'open',
      'cancelled',
      'unknown',
      'unknown-null'
    ])
    ;(Date.now as jest.Mock).mockReturnValue(now + 365 * day)
    expect(await boardQuery(client, board, new Set(), () => {})).toEqual(q)
    expect(
      apply(
        docs,
        await boardQuery(
          client,
          makeBoard({ hideCompletedAfterDays: 0, hideCompletedBefore: null }),
          new Set(),
          () => {}
        )
      )
    ).toHaveLength(docs.length)
  })

  it('does not keep a rolling timer for a fixed date', async () => {
    jest.useFakeTimers({ now })
    ;(createQuery as jest.Mock).mockReturnValue({
      unsubscribe: jest.fn(),
      query: jest.fn((_class, _q, emit) => {
        emit([{ _id: 'old' }])
      })
    })
    const refresh = jest.fn()
    const controller = new BoardQuery(client, refresh)
    await controller.build(makeBoard({ hideCompletedAfterDays: 14 }))
    expect(jest.getTimerCount()).toBe(1)
    await controller.build(makeBoard({ hideCompletedBefore: now - 14 * day }))
    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()
    controller.destroy()
    jest.useRealTimers()
  })

  it('intersects exclusions with existing board and quick filters', async () => {
    ;(filtersToQuery as jest.Mock).mockImplementation(async (_c, _q, parsed) => parsed[0].q)
    const board = makeBoard({
      hideCompletedAfterDays: 14,
      filter: JSON.stringify([{ q: { _id: { $in: ['old', 'recent', 'open'] } } }]),
      quickFilters: [{ id: 'p', title: 'Priority', condition: JSON.stringify([{ q: { priority: 2 } }]) }]
    })
    const q = await boardQuery(client, board, new Set(), () => {})
    expect(apply(docs, q).map((d) => d._id)).toEqual(['recent', 'open'])
    expect(apply(docs, await boardQuery(client, board, new Set(['p']), () => {}))).toEqual([])
  })

  it('refreshes exclusions on status changes and releases its subscription and timer', async () => {
    jest.useFakeTimers({ now })
    let update: (rows: any[]) => void = () => {}
    const unsubscribe = jest.fn()
    ;(createQuery as jest.Mock).mockReturnValue({
      unsubscribe,
      query: jest.fn((_class, _q, emit) => {
        update = emit
        emit([{ _id: 'old' }])
      })
    })
    const refresh = jest.fn()
    const controller = new BoardQuery(client, refresh)
    const board = makeBoard({ hideCompletedAfterDays: 14 })
    const q = await controller.build(board)
    expect(apply(docs, q).some((d) => d._id === 'old')).toBe(false)
    update([])
    expect(refresh).toHaveBeenCalledTimes(1)
    const reopened = await controller.build(board)
    expect(apply(docs, reopened).some((d) => d._id === 'old')).toBe(true)
    jest.advanceTimersByTime(60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
    await controller.build(makeBoard({ hideCompletedAfterDays: 0 }))
    const calls = refresh.mock.calls.length
    jest.advanceTimersByTime(120_000)
    expect(refresh).toHaveBeenCalledTimes(calls)
    controller.destroy()
    expect(unsubscribe).toHaveBeenCalled()
    expect(await controller.build(board)).toEqual({ _id: { $in: [] } })
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
  })

  it('settles pending work on destroy without leaving a subscription or timer', async () => {
    jest.useFakeTimers({ now })
    const unsubscribe = jest.fn()
    ;(createQuery as jest.Mock).mockReturnValue({ unsubscribe, query: jest.fn() })
    const refresh = jest.fn()
    const controller = new BoardQuery(client, refresh)
    const pending = controller.build(makeBoard({ hideCompletedAfterDays: 14 }))
    controller.destroy()
    await pending
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
  })
})
