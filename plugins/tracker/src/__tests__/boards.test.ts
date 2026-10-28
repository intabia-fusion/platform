import type { AccountUuid, Doc, Ref, Status, StatusCategory } from '@hcengineering/core'
import task from '@hcengineering/task'
import {
  canEditBoard,
  cardFields,
  columnCategory,
  columnIndexByStatus,
  columnStatusFor,
  isBoardAvailable,
  isCardDensity,
  isCardFieldVisible,
  isOverLimit,
  pickDefaultBoard,
  pickRuleSamples,
  pickSwimlane,
  resolveCardDensity,
  sortBoards,
  statusesWithoutColumn,
  toggleCardField,
  type Board,
  type Project
} from '..'

const anna = 'anna' as AccountUuid
const ivan = 'ivan' as AccountUuid
const maria = 'maria' as AccountUuid

const id = <T extends Doc>(s: string): Ref<T> => s as Ref<T>

type BoardLike = Pick<Board, '_id' | 'author' | 'visibility' | 'projects' | 'editors'>

const board = (_id: string, patch: Partial<BoardLike> = {}): BoardLike => ({
  _id: id(_id),
  author: anna,
  visibility: 'all',
  projects: [id<Project>('app')],
  editors: [],
  ...patch
})

const status = (_id: string, category: Ref<StatusCategory>): Pick<Status, '_id' | 'category'> => ({
  _id: id(_id),
  category
})

describe('board rights', () => {
  it('lets the author and the editors change the board', () => {
    const b = board('b', { editors: [ivan] })
    expect(canEditBoard(b, anna)).toBe(true)
    expect(canEditBoard(b, ivan)).toBe(true)
    expect(canEditBoard(b, maria)).toBe(false)
  })

  it('answers for a board stored without editors', () => {
    const b = board('b', { editors: undefined as any })
    expect(canEditBoard(b, anna)).toBe(true)
    expect(canEditBoard(b, maria)).toBe(false)
  })

  it('shows a personal board to its author only', () => {
    const personal = board('b', { visibility: 'me' })
    expect(isBoardAvailable(personal, anna)).toBe(true)
    expect(isBoardAvailable(personal, ivan)).toBe(false)
    expect(isBoardAvailable(board('b'), ivan)).toBe(true)
  })
})

describe('default board', () => {
  const boards = [
    board('other', { projects: [id<Project>('mkt')] }),
    board('personal', { visibility: 'me' }),
    board('team'),
    board('team2')
  ]

  it('takes the first board of the project available to the user', () => {
    expect(pickDefaultBoard(boards, id<Project>('app'), anna)?._id).toBe('personal')
    expect(pickDefaultBoard(boards, id<Project>('app'), ivan)?._id).toBe('team')
  })

  it('puts a pinned board first', () => {
    const pinned = new Set([id<Board>('team2')])
    expect(pickDefaultBoard(boards, id<Project>('app'), ivan, pinned)?._id).toBe('team2')
    expect(sortBoards(boards, pinned).map((b) => b._id)[0]).toBe('team2')
  })

  it('finds nothing for a project without boards', () => {
    expect(pickDefaultBoard(boards, id<Project>('none'), anna)).toBeUndefined()
  })
})

describe('columns', () => {
  const columns = [{ statuses: [id<Status>('todo'), id<Status>('design')] }, { statuses: [id<Status>('todo')] }]

  it('assigns a status to the first column that lists it', () => {
    const index = columnIndexByStatus(columns)
    expect(index.get(id('todo'))).toBe(0)
    expect(index.get(id('design'))).toBe(0)
    expect(index.get(id('done'))).toBeUndefined()
  })

  it('warns about open statuses only', () => {
    const statuses = [
      status('todo', task.statusCategory.ToDo),
      status('review', task.statusCategory.Active),
      status('backlog', task.statusCategory.UnStarted),
      status('done', task.statusCategory.Won),
      status('canceled', task.statusCategory.Lost)
    ]
    const missing = statusesWithoutColumn(columns, statuses).map((s) => s._id)
    expect(missing).toEqual(['review', 'backlog'])
  })
})

describe('WIP limit', () => {
  it('is exceeded above the limit only', () => {
    expect(isOverLimit(8, 8)).toBe(false)
    expect(isOverLimit(9, 8)).toBe(true)
    expect(isOverLimit(100, undefined)).toBe(false)
    expect(isOverLimit(100, 0)).toBe(false)
  })
})

describe('swimlanes', () => {
  const lanes = [{ id: 'urgent' }, { id: 'review' }, { id: 'rest' }]

  it('takes the first lane that fits', () => {
    expect(pickSwimlane(lanes, (l) => l.id === 'review' || l.id === 'urgent')?.id).toBe('urgent')
    expect(pickSwimlane(lanes, (l) => l.id === 'review')?.id).toBe('review')
  })

  it('gives the last lane everything else, whatever its condition', () => {
    expect(pickSwimlane(lanes, () => false)?.id).toBe('rest')
    expect(pickSwimlane(lanes, (l) => l.id === 'rest')?.id).toBe('rest')
  })

  it('has no lane without lanes', () => {
    const lane = pickSwimlane<{ id: string }>([], () => true)
    expect(lane).toBeUndefined()
  })
})

describe('card density', () => {
  it('prefers the pick of the user, then the board', () => {
    expect(resolveCardDensity('dense', 'compact')).toBe('dense')
    expect(resolveCardDensity('default', 'compact')).toBe('compact')
    expect(resolveCardDensity(undefined, undefined)).toBe('detailed')
  })

  it('keeps the old compact toggle until a density is picked', () => {
    expect(resolveCardDensity(undefined, 'normal', true)).toBe('compact')
    expect(resolveCardDensity('normal', 'dense', true)).toBe('normal')
  })
})

describe('card fields', () => {
  it('shows every field on a board without the setting', () => {
    expect(cardFields.every((f) => isCardFieldVisible(undefined, f))).toBe(true)
  })

  it('hides a field the board left out', () => {
    expect(isCardFieldVisible(['priority'], 'priority')).toBe(true)
    expect(isCardFieldVisible(['priority'], 'labels')).toBe(false)
    expect(isCardFieldVisible([], 'priority')).toBe(false)
  })

  it('a click on a board without the setting keeps the rest of the fields', () => {
    expect(toggleCardField(undefined, 'labels', false)).toEqual(cardFields.filter((f) => f !== 'labels'))
    expect(toggleCardField(['comments', 'priority'], 'labels', true)).toEqual(['priority', 'labels', 'comments'])
  })
})

describe('column drops', () => {
  const column = {
    id: 'c',
    title: 'In progress',
    category: task.statusCategory.Active,
    statuses: [id<Status>('a'), id<Status>('b')]
  }

  it('keeps the status the issue already has in the column', () => {
    expect(columnStatusFor(column, id('b'), [id('a')])).toBe('b')
  })

  it('takes the first status the workflow allows', () => {
    expect(columnStatusFor(column, id('x'), [id('b'), id('z')])).toBe('b')
    expect(columnStatusFor(column, id('x'), undefined)).toBe('a')
  })

  it('refuses a column the workflow does not reach', () => {
    expect(columnStatusFor(column, id('x'), [id('z')])).toBeUndefined()
  })

  it('makes one kanban category of the column statuses', () => {
    const category = columnCategory(column)
    expect(category.name).toBe('c')
    expect(category.values.map((v) => v._id)).toEqual(['a', 'b'])
    expect(category.values.map((v) => v.name)).toEqual(['c', 'c'])
  })
})

describe('board helpers edge cases', () => {
  it('takes a board of any project when no project is asked', () => {
    const boards = [board('a', { projects: [id<Project>('mkt')] }), board('b')]
    expect(pickDefaultBoard(boards, undefined, ivan)?._id).toBe('a')
  })

  it('keeps the order of pinned and of other boards', () => {
    const boards = [board('a'), board('b'), board('c'), board('d')]
    const sorted = sortBoards(boards, new Set([id<Board>('d'), id<Board>('b')]))
    expect(sorted.map((b) => b._id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('does not warn about a status without a category', () => {
    expect(statusesWithoutColumn([], [{ _id: id<Status>('x'), category: undefined }])).toEqual([])
  })

  it('takes only known card densities', () => {
    expect(isCardDensity('dense')).toBe(true)
    expect(isCardDensity('huge')).toBe(false)
    expect(isCardDensity(undefined)).toBe(false)
  })

  it('unchecking a field twice or checking a shown one changes nothing', () => {
    expect(toggleCardField(['priority'], 'labels', false)).toEqual(['priority'])
    expect(toggleCardField(['priority'], 'priority', true)).toEqual(['priority'])
    expect(toggleCardField([], 'parent', true)).toEqual(['parent'])
  })

  it('a click on an empty set of fields leaves the others hidden', () => {
    expect(toggleCardField([], 'priority', false)).toEqual([])
  })

  it('a rule sample skips the issues of the rules above it', () => {
    const sets = new Map([
      ['a', new Set([id('i1'), id('i2')])],
      ['b', new Set([id('i1'), id('i3')])],
      ['c', new Set([id('i1')])]
    ])
    const samples = pickRuleSamples([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], (r) => sets.get(r))
    expect(samples.get('a')).toBe('i1')
    expect(samples.get('b')).toBe('i3')
    expect(samples.get('c')).toBeUndefined()
    expect(samples.get('d')).toBeUndefined()
  })
})
