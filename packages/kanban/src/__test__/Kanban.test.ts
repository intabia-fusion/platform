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

import type { Ref } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { columnControlStore, registerColumnControls, registerSwimLaneControls, swimLaneControlStore } from '../swimlane'
import type { Item, SwimLane } from '../types'
import { fakeClient, fakeQueries, type FakeCall } from './fakePresentation'
import Harness from './KanbanHarness.svelte'
import { intersect } from './setup'

vi.mock('@hcengineering/presentation', async () => await import('./fakePresentation'))

interface Card extends Item {
  lane: string
  status: string
}

let parent: HTMLElement
type HarnessInstance = InstanceType<typeof Harness>

let mounted: HarnessInstance[] = []
let docs = new Map<string, Card>()
let rankSeq = ''

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 10))
}

// Ranks grow with every call, so neighbours are always ordered.
function nextRank (): string {
  rankSeq = makeRank(rankSeq === '' ? undefined : rankSeq, undefined)
  return rankSeq
}

function card (id: string, status: string, lane: string = ''): Card {
  const doc = { _id: id as Ref<Card>, rank: nextRank(), status, lane } as unknown as Card
  docs.set(id, doc)
  return doc
}

function cards (prefix: string, n: number, status: string, lane: string = ''): Card[] {
  return Array.from({ length: n }, (_, i) => card(`${prefix}${String(i).padStart(2, '0')}`, status, lane))
}

const lane = (id: string): SwimLane => ({ _id: id, title: `Lane ${id}`, value: id })

function board (groups: Record<string, Card[]>): Record<string, Card[]> {
  return groups
}

const legacyProps = (groups: Record<string, Card[]>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  _class: 'test:class:Card',
  groupByKey: 'status',
  categories: Object.keys(groups),
  groupByDocs: groups,
  objects: Object.values(groups).flat(),
  getGroupByValues: (g: Record<string, Item[]>, c: string) => g[c],
  setGroupByValues: (g: Record<string, Item[]>, c: string, items: Item[]) => {
    g[c] = items
  },
  getUpdateProps: (_doc: unknown, state: string) => ({ status: state }),
  ...extra
})

const swimProps = (
  groups: Record<string, Card[]>,
  swimLanes: SwimLane[],
  extra: Record<string, unknown> = {}
): Record<string, unknown> =>
  legacyProps(groups, {
    swimLanes,
    swimLaneKey: 'lane',
    storageKey: 'test',
    getSwimLaneOfDoc: (doc: Card) => (doc.lane === '' ? undefined : doc.lane),
    getSwimLaneDocId: (l: SwimLane) => `hdr-${l._id}`,
    getSwimLaneUpdateProps: (_doc: unknown, l: SwimLane) => ({ lane: l._id }),
    ...extra
  })

async function mount (props: Record<string, unknown>): Promise<HarnessInstance> {
  const target = document.createElement('div')
  parent.appendChild(target)
  const component = new Harness({ target, props: props as any })
  mounted.push(component)
  await settle()
  return component
}

// Answers every pending query with the fixture docs it asks for.
async function flush (): Promise<void> {
  for (const call of fakeQueries.calls) {
    if (call.resolved || call.owner.closed) continue
    call.resolved = true
    const ids = (call.query._id?.$in ?? []) as string[]
    call.callback(ids.map((id) => docs.get(id)).filter((d) => d !== undefined))
  }
  await settle()
}

const ids = (call: FakeCall): string[] => call.query._id.$in
const live = (): FakeCall[] => fakeQueries.calls.filter((c) => !c.owner.closed && c === c.owner.last)
const q = (sel: string, root: ParentNode = parent): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel))
const one = (sel: string, root: ParentNode = parent): HTMLElement => {
  const el = root.querySelector<HTMLElement>(sel)
  if (el === null) throw new Error(`no element ${sel}`)
  return el
}
const cardEls = (root: ParentNode = parent): HTMLElement[] => q('[data-id="kanban-card"]', root)
const cardIds = (root: ParentNode = parent): string[] => cardEls(root).map((e) => e.dataset.cardId as string)
const column = (state: string): HTMLElement => one(`[data-id="kanban-column"][data-state="${state}"]`)
const cell = (laneId: string, state: string): HTMLElement =>
  one(`[data-id="kanban-swimlane-cell"][data-swimlane-id="${laneId}"][data-state="${state}"]`)
const cardEl = (id: string): HTMLElement => one(`[data-card-id="${id}"]`)
const laneBlock = (id: string): HTMLElement => one(`[data-id="kanban-swimlane"][data-swimlane-id="${id}"]`)

function fire (el: Element, type: string, offsetY: number = 0): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'offsetY', { value: offsetY })
  // A plain Event has no dataTransfer; a browser DragEvent made by script has null.
  Object.defineProperty(ev, 'dataTransfer', { value: null })
  el.dispatchEvent(ev)
  return ev
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('#platform.lazy.loading', 'false')
  document.body.innerHTML = ''
  parent = document.createElement('div')
  document.body.appendChild(parent)
  docs = new Map()
  rankSeq = ''
  fakeQueries.calls.length = 0
  fakeClient.update.mockClear()
  fakeClient.diffUpdate.mockClear()
})

afterEach(() => {
  // Ends a drag left open by the test, so the auto-scroll frame does not outlive the board.
  q('.kanban-container').forEach((el) => fire(el, 'dragend'))
  mounted.forEach((c) => {
    c.$destroy()
  })
  mounted = []
})

describe('Kanban legacy layout', () => {
  it('queries the first 10 cards of every non-empty column and renders cards only after they load', async () => {
    const groups = board({ todo: cards('t', 35, 'todo'), doing: cards('d', 3, 'doing'), done: [] })
    await mount(legacyProps(groups))

    expect(fakeQueries.calls).toHaveLength(2)
    const [todo, doing] = fakeQueries.calls
    expect(ids(todo)).toEqual(
      groups.todo
        .slice(0, 10)
        .map((c) => c._id)
        .sort()
    )
    expect(todo.options).toMatchObject({ limit: 10 })
    expect(todo.cls).toBe('test:class:Card')
    expect(ids(doing)).toEqual(groups.doing.map((c) => c._id).sort())
    expect(doing.options).toMatchObject({ limit: 3 })
    expect(cardEls()).toHaveLength(0)
    expect(one('[data-id="btn-kanban-show-more"]')).toBeTruthy()

    await flush()
    expect(cardIds(column('todo'))).toEqual(groups.todo.slice(0, 10).map((c) => c._id))
    expect(cardIds(column('doing'))).toHaveLength(3)
    expect(cardIds(column('done'))).toEqual([])
    expect(q('[data-test="card-body"]', column('todo'))[0].textContent).toBe('t00')
  })

  it('show more raises the column limit by 20 and re-queries only that column', async () => {
    const groups = board({ todo: cards('t', 35, 'todo'), doing: cards('d', 12, 'doing') })
    await mount(legacyProps(groups))
    await flush()
    const before = fakeQueries.calls.length

    one('[data-id="btn-kanban-show-more"]', column('todo')).click()
    await settle()

    expect(fakeQueries.calls).toHaveLength(before + 1)
    const added = fakeQueries.calls[before]
    expect(ids(added)).toEqual(
      groups.todo
        .slice(0, 30)
        .map((c) => c._id)
        .sort()
    )
    expect(added.options).toMatchObject({ limit: 30 })
    await flush()
    expect(cardIds(column('todo'))).toHaveLength(30)
    expect(cardIds(column('doing'))).toHaveLength(10)
    expect(one('[data-id="kanban-show-more"]', column('todo')).textContent).toContain('30')
  })

  it('re-creates every query when options change and unsubscribes all on unmount', async () => {
    const groups = board({ todo: cards('t', 3, 'todo'), doing: cards('d', 3, 'doing') })
    const component = await mount(legacyProps(groups, { options: { sort: { rank: 1 } } }))
    await flush()
    const first = fakeQueries.calls.map((c) => c.owner)
    expect(first.every((o) => !o.closed)).toBe(true)

    component.$set({ options: { sort: { rank: -1 } } })
    await settle()

    expect(first.every((o) => o.closed)).toBe(true)
    expect(fakeQueries.calls).toHaveLength(4)
    expect(fakeQueries.calls.slice(2).every((c) => (c.options as any).sort.rank === -1)).toBe(true)
    expect(live()).toHaveLength(2)

    component.$destroy()
    mounted = []
    expect(fakeQueries.calls.every((c) => c.owner.closed)).toBe(true)
  })

  it('keeps a column limit by category when a column is inserted before it', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), done: cards('x', 30, 'done') })
    const component = await mount(legacyProps(groups))
    await flush()
    one('[data-id="btn-kanban-show-more"]', column('done')).click()
    await settle()
    await flush()
    expect(cardIds(column('done'))).toHaveLength(30)

    const next = board({ fresh: cards('n', 15, 'fresh'), ...groups })
    component.$set(legacyProps(next))
    await settle()
    await flush()

    const freshQuery = live().find((c) => ids(c).includes('n00'))
    expect(ids(freshQuery as FakeCall)).toHaveLength(10)
    expect(live().find((c) => ids(c).includes('x29'))).toBeTruthy()
    expect(cardIds(column('fresh'))).toHaveLength(10)
    expect(cardIds(column('done'))).toHaveLength(30)
  })
})

describe('Kanban column collapse', () => {
  const header = (state: string): HTMLElement => one('[data-test="column-header"]', column(state))

  const stacked = (state: string): HTMLElement => one(`[data-id="kanban-collapsed-column"][data-state="${state}"]`)
  const columnOrder = (): string[] =>
    Array.from(one('.kanban-content').children).map((el) =>
      el.matches('[data-id="kanban-collapsed-stack"]') ? 'stack' : ((el as HTMLElement).dataset.state ?? '')
    )

  it('moves a collapsed column to a stack at the end, without cards or a query, and remembers it', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 2, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    expect(parent.querySelector('[data-id="kanban-collapsed-stack"]')).toBeNull()

    header('todo').click()
    await settle()
    expect(columnOrder()).toEqual(['doing', 'done', 'stack'])
    expect(one('[data-test="column-header"]', stacked('todo')).dataset.collapsed).toBe('true')
    expect(cardEls(one('[data-id="kanban-collapsed-stack"]'))).toHaveLength(0)
    expect(live().map(ids)).toEqual([['d00'], ['x00', 'x01']])

    mounted.forEach((c) => {
      c.$destroy()
    })
    mounted = []
    parent.innerHTML = ''
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    expect(columnOrder()).toEqual(['doing', 'done', 'stack'])

    one('[data-test="column-header"]', stacked('todo')).click()
    await settle()
    expect(columnOrder()).toEqual(['todo', 'doing', 'done'])
  })

  it('shows the dragged card in the collapsed column under the cursor until the cursor leaves it', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    header('done').click()
    await settle()
    const stack = one('[data-id="kanban-collapsed-stack"]')
    const preview = (): string[] => q('[data-test="card-body"]', stacked('done')).map((e) => e.textContent ?? '')
    const leave = (relatedTarget: Element): void => {
      stacked('done').dispatchEvent(new MouseEvent('dragleave', { bubbles: true, relatedTarget }))
    }

    fire(cardEl('t00'), 'dragstart')
    await settle()
    expect(stack.classList.contains('dragging')).toBe(false)
    fire(stacked('done'), 'dragover')
    await settle()
    expect(stack.classList.contains('dragging')).toBe(true)
    expect(stacked('done').classList.contains('drag-over')).toBe(true)
    expect(preview()).toEqual(['t00'])

    // Moving onto the header inside the column is not leaving it.
    leave(one('[data-test="column-header"]', stacked('done')))
    await settle()
    expect(preview()).toEqual(['t00'])
    leave(stack)
    await settle()
    expect(preview()).toEqual([])
    expect(stacked('done').classList.contains('drag-over')).toBe(false)
  })

  it('keeps collapsed columns per grouping', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    header('done').click()
    await settle()
    mounted.forEach((c) => {
      c.$destroy()
    })
    mounted = []
    parent.innerHTML = ''

    await mount(legacyProps(groups, { controlKey: 'viewlet', groupByKey: 'assignee' }))
    expect(columnOrder()).toEqual(['todo', 'done'])
  })

  it('keeps a collapsed column collapsed when the drop moves nothing', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet', getUpdateProps: () => undefined }))
    await flush()
    header('done').click()
    await settle()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(stacked('done'), 'dragover')
    fire(stacked('done'), 'drop')
    await settle()

    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(columnOrder()).toEqual(['todo', 'stack'])
  })

  it('a card dropped on a collapsed column in swim lane mode moves there and the column stays collapsed', async () => {
    const groups = board({ todo: [card('a1', 'todo', 'A')], done: [card('a2', 'done', 'A')] })
    await mount(swimProps(groups, [lane('A')], { controlKey: 'viewlet' }))
    await flush()
    one('[data-test="column-header"]', one('[data-id="kanban-column-header"][data-state="done"]')).click()
    await settle()

    fire(cardEl('a1'), 'dragstart')
    await settle()
    fire(stacked('done'), 'dragover')
    fire(stacked('done'), 'drop')
    fire(one('.kanban-container'), 'drop')
    await settle()

    expect(fakeClient.update).toHaveBeenCalledTimes(1)
    expect((fakeClient.update.mock.calls[0] as [Card, { status: string }])[1].status).toBe('done')
    expect(stacked('done')).not.toBeNull()
  })

  it('a card dropped on a collapsed column moves there and the column stays collapsed', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    header('done').click()
    await settle()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    expect(stacked('done').classList.contains('drop-allowed')).toBe(true)
    fire(stacked('done'), 'dragover')
    await settle()
    // The card shows where it would land, as in a live column.
    expect(q('[data-test="card-body"]', stacked('done')).map((e) => e.textContent)).toEqual(['t00'])
    fire(stacked('done'), 'drop')
    await settle()

    expect(fakeClient.update).toHaveBeenCalledTimes(1)
    expect((fakeClient.update.mock.calls[0] as [Card, { status: string }])[1].status).toBe('done')
    expect(columnOrder()).toEqual(['todo', 'stack'])
  })

  it('greys out the columns a dragged card cannot move to, except the one it left, and keeps their cards', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { getAvailableCategories: async () => ['doing'] }))
    await flush()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    await settle()
    expect(header('done').dataset.blocked).toBe('true')
    expect(column('done').classList.contains('drop-disabled')).toBe(true)
    expect(cardIds(column('done'))).toEqual(['x00'])
    expect(column('todo').classList.contains('drop-disabled')).toBe(false)
    expect(column('doing').classList.contains('drop-disabled')).toBe(false)

    fire(cardEl('t00'), 'dragend')
    await settle()
    expect(column('done').classList.contains('drop-disabled')).toBe(false)
  })
})

describe('Kanban merged columns', () => {
  const mergeInto = async (column: string, other: string): Promise<void> => {
    const spy = vi.spyOn(window, 'prompt').mockReturnValue(other)
    one(`[data-test="merge"][data-state="${column}"]`).click()
    spy.mockRestore()
    await settle()
  }

  it('shows the cards of several statuses in one column and remembers it', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()

    await mergeInto('todo', 'done')
    await flush()
    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['todo', 'doing'])
    expect(one('[data-test="column-header"]', column('todo')).dataset.members).toEqual('todo,done')
    expect(cardIds(column('todo'))).toEqual(['t00', 't01', 'x00'])
    expect(localStorage.getItem('kanban-column-merged-viewlet-status')).toBe('[["todo","done"]]')

    await mergeInto('todo', 'done')
    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['todo', 'doing', 'done'])
  })

  it('counts the cards of a lane once when the board opens with merged statuses', async () => {
    localStorage.setItem('kanban-column-merged-viewlet-status', '[["doing","done"]]')
    const groups = board({
      todo: [card('a1', 'todo', 'A')],
      doing: [card('a2', 'doing', 'A')],
      done: [card('a3', 'done', 'A'), card('a4', 'done', 'A')]
    })
    await mount(swimProps(groups, [lane('A')], { controlKey: 'viewlet' }))
    await flush()
    expect(one('[data-test="lane-header"][data-lane="A"]').dataset.count).toBe('4')
  })

  it('keeps the rest of a collapsed group in the stack when its first column leaves', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('doing', 'done')
    one('[data-test="column-header"]', column('doing')).click()
    await settle()

    await mergeInto('todo', 'doing')
    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['todo'])
    expect(one('[data-test="column-header"]', column('todo')).dataset.members).toBe('todo,doing')
    expect(q('[data-id="kanban-collapsed-column"]').map((e) => e.dataset.state)).toEqual(['done'])
  })

  it('tells the view options whether there is something to reset', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    expect(get(columnControlStore).get('viewlet')?.merged).toBe(false)
    await mergeInto('todo', 'done')
    expect(get(columnControlStore).get('viewlet')?.merged).toBe(true)
    get(columnControlStore).get('viewlet')?.resetMerge()
    await settle()
    expect(get(columnControlStore).get('viewlet')?.merged).toBe(false)
  })

  it('takes a collapsed column out of the stack when it is merged', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    one('[data-test="column-header"]', column('todo')).click()
    await settle()

    // The open column takes in a collapsed one placed before it, and stays open where it is.
    await mergeInto('done', 'todo')
    await flush()
    expect(parent.querySelector('[data-id="kanban-collapsed-stack"]')).toBeNull()
    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['done'])
    expect(cardIds(column('done'))).toEqual(['t00', 'x00'])
  })

  it('merges columns by group and resets merging from the view options', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    const groupOf: Record<string, string> = { todo: 'open', doing: 'open', done: 'closed' }
    await mount(legacyProps(groups, { controlKey: 'viewlet', getCategoryGroup: (state: string) => groupOf[state] }))
    await flush()

    get(columnControlStore).get('viewlet')?.mergeByGroup()
    await settle()
    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['todo', 'done'])
    expect(one('[data-test="column-header"]', column('todo')).dataset.members).toEqual('todo,doing')

    get(columnControlStore).get('viewlet')?.resetMerge()
    await settle()
    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['todo', 'doing', 'done'])
    expect(localStorage.getItem('kanban-column-merged-viewlet-status')).toBe('[]')
  })

  it('counts a merged column as one and shows more of it as one', async () => {
    const groups = board({ todo: cards('t', 8, 'todo'), done: cards('x', 6, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('todo', 'done')

    expect(one('[data-test="column-header"]', column('todo')).dataset.count).toBe('14')
    const merged = live().find((c) => ids(c).includes('t00')) as FakeCall
    expect(ids(merged)).toEqual([...groups.todo.map((c) => c._id), 'x00', 'x01'])
    await flush()
    expect(cardIds(column('todo'))).toHaveLength(10)

    one('[data-id="btn-kanban-show-more"]', column('todo')).click()
    await settle()
    await flush()
    expect(cardIds(column('todo'))).toHaveLength(14)
  })

  it('merges columns in swim lane mode into one cell per lane', async () => {
    const groups = board({
      todo: [card('a1', 'todo', 'A')],
      doing: [card('a3', 'doing', 'A')],
      done: [card('a2', 'done', 'A'), card('b1', 'done', 'B')]
    })
    await mount(swimProps(groups, [lane('A'), lane('B')], { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('todo', 'done')
    await flush()

    expect(q('[data-id="kanban-swimlane-cell"][data-swimlane-id="A"]').map((e) => e.dataset.state)).toEqual([
      'todo',
      'doing'
    ])
    expect(cardIds(cell('A', 'todo'))).toEqual(['a1', 'a2'])
    expect(cardIds(cell('B', 'todo'))).toEqual(['b1'])
    expect(ids(live().find((c) => ids(c).includes('hdr-A')) as FakeCall)).toEqual(['a1', 'a2', 'a3', 'hdr-A'])
  })

  it('keeps the dragged card in its merged cell while it is shown elsewhere', async () => {
    const groups = board({ todo: [card('a1', 'todo', 'A')], doing: [], done: [card('a2', 'done', 'A')] })
    await mount(swimProps(groups, [lane('A')], { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('todo', 'done')
    await flush()

    fire(cardEl('a2'), 'dragstart')
    await settle()
    fire(cell('A', 'doing'), 'dragover')
    await settle()
    expect(cardIds(cell('A', 'todo'))).toEqual(['a1', 'a2'])
    expect(cardIds(cell('A', 'doing'))).toEqual(['a2'])
  })

  it('keeps the column widths and cards of blocked and merged lane cells during a drag', async () => {
    const groups = board({ todo: [card('a1', 'todo', 'A')], doing: [], done: [card('a2', 'done', 'A')], review: [] })
    await mount(
      swimProps(groups, [lane('A')], {
        controlKey: 'viewlet',
        getAvailableCategories: async () => ['todo', 'doing', 'done']
      })
    )
    await flush()
    await mergeInto('doing', 'done')
    const grid = one('.swimlane-grid')
    const widths = grid.style.gridTemplateColumns

    fire(cardEl('a1'), 'dragstart')
    await settle()
    fire(cell('A', 'todo'), 'dragover')
    await settle()
    expect(grid.style.gridTemplateColumns).toBe(widths)
    expect(cell('A', 'doing').classList.contains('drop-disabled')).toBe(true)
    expect(cardIds(cell('A', 'doing'))).toEqual(['a2'])
    expect(cell('A', 'review').classList.contains('drop-disabled')).toBe(true)
  })

  it('collapses a merged column into the stack with all its statuses and opens it back', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('todo', 'done')
    one('[data-test="column-header"]', column('todo')).click()
    await settle()

    const stackedHeader = one(
      '[data-test="column-header"]',
      one('[data-id="kanban-collapsed-column"][data-state="todo"]')
    )
    expect(stackedHeader.dataset.members).toBe('todo,done')
    expect(q('[data-id="kanban-collapsed-column"]')).toHaveLength(1)
    stackedHeader.click()
    await settle()
    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['todo', 'doing'])
  })

  it('greys out a merged column during a drag, unless the card left it', async () => {
    const groups = board({
      todo: cards('t', 1, 'todo'),
      doing: cards('d', 1, 'doing'),
      done: cards('x', 1, 'done'),
      review: cards('r', 1, 'review')
    })
    await mount(
      legacyProps(groups, {
        controlKey: 'viewlet',
        getAvailableCategories: async () => ['todo', 'doing', 'done']
      })
    )
    await flush()
    await mergeInto('doing', 'done')

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('todo'), 'dragover')
    await settle()
    expect(column('doing').classList.contains('drop-disabled')).toBe(true)
    expect(cardIds(column('doing'))).toEqual(['d00', 'x00'])
    expect(column('review').classList.contains('drop-disabled')).toBe(true)
    fire(cardEl('t00'), 'dragend')
    await settle()

    fire(cardEl('x00'), 'dragstart')
    await settle()
    fire(column('todo'), 'dragover')
    await settle()
    expect(column('doing').classList.contains('drop-disabled')).toBe(false)
  })

  it('moves the keyboard focus through a merged column and past a collapsed one', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    const component = await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    const seen: Array<string | undefined> = []
    component.$on('obj-focus', (e: CustomEvent) => seen.push(e.detail?._id))

    one('[data-test="column-header"]', column('doing')).click()
    await settle()
    component.select(1, groups.todo[0], 'horizontal')
    await mergeInto('todo', 'done')
    component.select(1, groups.todo[0], 'vertical')

    expect(seen).toEqual(['x00', 'x00'])
  })

  it('merges nothing by group without a group function and keeps single statuses apart', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    const component = await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    get(columnControlStore).get('viewlet')?.mergeByGroup()
    await settle()
    expect(q('[data-id="kanban-column"]')).toHaveLength(3)

    component.$set({ getCategoryGroup: (state: string) => (state === 'done' ? 'closed' : state) } as any)
    await settle()
    get(columnControlStore).get('viewlet')?.mergeByGroup()
    await settle()
    expect(q('[data-id="kanban-column"]')).toHaveLength(3)
    expect(localStorage.getItem('kanban-column-merged-viewlet-status')).toBe('[]')
  })

  it('drops its column controls on destroy, but not those of a newer board', async () => {
    const groups = board({ todo: cards('t', 1, 'todo') })
    const component = await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    expect(get(columnControlStore).has('viewlet')).toBe(true)
    component.$destroy()
    mounted = mounted.filter((c) => c !== component)
    expect(get(columnControlStore).has('viewlet')).toBe(false)

    const older = { resetMerge: vi.fn(), mergeByGroup: vi.fn(), merged: false }
    const newer = { resetMerge: vi.fn(), mergeByGroup: vi.fn(), merged: false }
    const dropOlder = registerColumnControls('k', older)
    const dropNewer = registerColumnControls('k', newer)
    dropOlder()
    expect(get(columnControlStore).get('k')).toBe(newer)
    dropNewer()
    expect(get(columnControlStore).has('k')).toBe(false)
  })

  it('takes no drop, but lets a card out with its own status', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('doing', 'done')
    await flush()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    fire(column('doing'), 'drop')
    await settle()
    expect(fakeClient.update).not.toHaveBeenCalled()
    fire(cardEl('t00'), 'dragend')
    await settle()

    fire(cardEl('x00'), 'dragstart')
    await settle()
    fire(column('todo'), 'dragover')
    fire(column('todo'), 'drop')
    await settle()
    expect(fakeClient.update).toHaveBeenCalledTimes(1)
    expect((fakeClient.update.mock.calls[0] as [Card, { status: string }])[1].status).toBe('todo')
  })
})

describe('Kanban legacy drag', () => {
  async function dragBoard (extra: Record<string, unknown> = {}): Promise<Record<string, Card[]>> {
    const groups = board({ todo: cards('t', 12, 'todo'), doing: cards('d', 12, 'doing'), done: cards('x', 2, 'done') })
    await mount(legacyProps(groups, extra))
    await flush()
    return groups
  }

  it('makes no queries while a card is dragged, even when columns exceed the limit', async () => {
    await dragBoard()
    const before = fakeQueries.calls.length

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    fire(cardEl('d03'), 'dragover', 5)
    fire(column('done'), 'dragover')
    fire(cardEl('x00'), 'dragover')
    await settle()

    expect(fakeQueries.calls).toHaveLength(before)
    expect(one('[data-id="kanban-column"][data-state="done"]').classList.contains('drop-allowed')).toBe(true)
  })

  it('re-queries the changed columns after dragend', async () => {
    await dragBoard()
    const before = fakeQueries.calls.length

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    expect(fakeQueries.calls).toHaveLength(before)
    fire(cardEl('t00'), 'dragend')
    await settle()

    // The card left todo (first 10 shift by one) and joined the end of doing (beyond its first 10).
    const added = fakeQueries.calls.slice(before)
    expect(added).toHaveLength(1)
    expect(ids(added[0])).toEqual(Array.from({ length: 10 }, (_, i) => `t${String(i + 1).padStart(2, '0')}`))
  })

  it('drop on a card commits the status and a rank between its neighbours', async () => {
    const onMoveCommit = vi.fn()
    const groups = await dragBoard({ onMoveCommit })
    const moved = groups.todo[0]
    const [prev, next] = [groups.doing[3], groups.doing[4]]
    const before = fakeQueries.calls.length

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    fire(cardEl('d03'), 'dragover', 5)
    fire(cardEl('d03'), 'drop')
    await settle()

    expect(fakeClient.diffUpdate).toHaveBeenCalledTimes(1)
    const [target, update] = fakeClient.diffUpdate.mock.calls[0] as [Card, { status: string, rank: string }]
    expect(target._id).toBe(moved._id)
    expect(update.status).toBe('doing')
    expect(update.rank > prev.rank && update.rank < next.rank).toBe(true)
    expect(onMoveCommit).toHaveBeenCalledWith('t00', update)
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeQueries.calls.length).toBeGreaterThan(before)
  })

  it('drop on a column appends the card and applies the update through client.update', async () => {
    const onMoveCommit = vi.fn()
    const groups = await dragBoard({ onMoveCommit })
    const last = groups.done[1]

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('done'), 'dragover')
    fire(column('done'), 'drop')
    await settle()

    expect(fakeClient.update).toHaveBeenCalledTimes(1)
    const [target, update] = fakeClient.update.mock.calls[0] as [Card, { status: string, rank: string }]
    expect(target._id).toBe('t00')
    expect(update.status).toBe('done')
    expect(update.rank > last.rank).toBe(true)
    expect(onMoveCommit).toHaveBeenCalledWith('t00', update)
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it('rolls the move back when the update fails', async () => {
    const onMoveRollback = vi.fn()
    await dragBoard({ onMoveRollback })
    fakeClient.update.mockRejectedValueOnce(new Error('denied'))

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('done'), 'dragover')
    fire(column('done'), 'drop')
    await settle()

    expect(onMoveRollback).toHaveBeenCalledWith('t00')
  })

  it('does not update when the target column is not among the available categories', async () => {
    const onMoveCommit = vi.fn()
    await dragBoard({ onMoveCommit, getAvailableCategories: async () => ['todo', 'doing'] })

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('todo'), 'dragover')
    await settle()
    expect(column('done').classList.contains('drop-disabled')).toBe(true)
    expect(column('doing').classList.contains('drop-allowed')).toBe(true)
    fire(column('done'), 'dragover')
    fire(column('done'), 'drop')
    await settle()

    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    expect(onMoveCommit).not.toHaveBeenCalled()
  })

  it('stops the auto-scroll frame when the board is destroyed mid-drag', async () => {
    await dragBoard()
    const errors: string[] = []
    const onError = (e: ErrorEvent): void => {
      e.preventDefault()
      errors.push(e.message)
    }
    window.addEventListener('error', onError)
    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    mounted.forEach((c) => {
      c.$destroy()
    })
    mounted = []
    await new Promise((resolve) => setTimeout(resolve, 50))
    window.removeEventListener('error', onError)

    expect(errors).toEqual([])
  })

  it('marks the dragged card and renders it before its docs load', async () => {
    await dragBoard()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    expect(one('[data-card-id="t00"] [data-test="card-body"]').dataset.dragged).toBe('true')
    expect(one('[data-card-id="t01"] [data-test="card-body"]').dataset.dragged).toBe('false')
  })
})

describe('Kanban swim lanes', () => {
  const lanes = [lane('A'), lane('B')]

  it('sends one query per lane with the header doc and at most 3 cards per cell', async () => {
    const groups = board({
      todo: [...cards('a', 5, 'todo', 'A'), ...cards('b', 1, 'todo', 'B')],
      done: cards('c', 1, 'done', 'A')
    })
    docs.set('hdr-A', { _id: 'hdr-A' } as unknown as Card)
    docs.set('hdr-B', { _id: 'hdr-B' } as unknown as Card)
    await mount(swimProps(groups, lanes))

    expect(fakeQueries.calls).toHaveLength(2)
    const [a, b] = fakeQueries.calls
    expect(ids(a)).toEqual(['a00', 'a01', 'a02', 'c00', 'hdr-A'])
    expect(a.options).toMatchObject({ limit: 5 })
    expect(ids(b)).toEqual(['b00', 'hdr-B'])
    await flush()
    expect(cardIds(cell('A', 'todo'))).toEqual(['a00', 'a01', 'a02'])
    expect(q('[data-test="lane-header"]').map((e) => e.dataset.count)).toEqual(['6', '1'])
  })

  it('show more in a lane cell raises the limit by 10 and re-queries only that lane', async () => {
    const groups = board({ todo: [...cards('a', 8, 'todo', 'A'), ...cards('b', 2, 'todo', 'B')], done: [] })
    await mount(swimProps(groups, lanes))
    await flush()
    const before = fakeQueries.calls.length

    one('[data-id="btn-kanban-show-more"]', cell('A', 'todo')).click()
    await settle()

    expect(fakeQueries.calls).toHaveLength(before + 1)
    expect(ids(fakeQueries.calls[before])).toEqual([...groups.todo.slice(0, 8).map((c) => c._id), 'hdr-A'].sort())
    await flush()
    expect(cardIds(cell('A', 'todo'))).toHaveLength(8)
    expect(cardIds(cell('B', 'todo'))).toHaveLength(2)
  })

  it('sends no query while lanes are not built, then queries when they arrive', async () => {
    const groups = board({ todo: cards('a', 4, 'todo', 'A'), done: [] })
    const component = await mount(swimProps(groups, []))
    expect(fakeQueries.calls).toHaveLength(0)
    expect(q('[data-id="kanban-swimlane"]')).toHaveLength(0)

    component.$set({ swimLanes: [lane('A')] })
    await settle()
    expect(fakeQueries.calls).toHaveLength(1)
    expect(ids(fakeQueries.calls[0])).toEqual(['a00', 'a01', 'a02', 'hdr-A'])
  })

  it('keeps a card moved to another lane until that lane answers', async () => {
    const groups = board({
      todo: [card('a1', 'todo', 'A'), card('a2', 'todo', 'A'), card('b1', 'todo', 'B')],
      done: []
    })
    const component = await mount(swimProps(groups, lanes))
    await flush()

    // A live update moves a1 to lane B: both lanes re-query.
    const moved = { ...groups.todo[0], lane: 'B' } as unknown as Card
    docs.set('a1', moved)
    const next = board({ todo: [moved, groups.todo[1], groups.todo[2]], done: [] })
    component.$set({ groupByDocs: next, objects: next.todo })
    await settle()
    const pending = live().filter((c) => !c.resolved)
    const left = pending.find((c) => ids(c).includes('hdr-A')) as FakeCall
    const entered = pending.find((c) => ids(c).includes('hdr-B')) as FakeCall
    expect(ids(left)).toEqual(['a2', 'hdr-A'])
    expect(ids(entered)).toEqual(['a1', 'b1', 'hdr-B'])

    // The lane the card left answers first.
    left.resolved = true
    left.callback([docs.get('a2')])
    await settle()
    expect(cardIds(cell('B', 'todo'))).toEqual(['a1', 'b1'])

    // An answer without the card (e.g. no access) is the source of truth.
    entered.resolved = true
    entered.callback([docs.get('b1')])
    await settle()
    expect(cardIds(cell('B', 'todo'))).toEqual(['b1'])
  })

  it('waits for the header doc again after options change or a lane comes back', async () => {
    docs.set('hdr-A', { _id: 'hdr-A' } as unknown as Card)
    const groups = board({ todo: [card('a1', 'todo', 'A'), card('b1', 'todo', 'B')], done: [] })
    const component = await mount(swimProps(groups, lanes, { options: { sort: { rank: 1 } } }))
    await flush()
    const loaded = (): string | undefined => one('[data-test="lane-header"][data-lane="A"]').dataset.docsLoaded
    expect(loaded()).toBe('true')

    component.$set({ options: { sort: { rank: -1 } } })
    await settle()
    expect(loaded()).toBe('false')
    await flush()
    expect(loaded()).toBe('true')

    component.$set({ swimLanes: [lane('B')] })
    await settle()
    component.$set({ swimLanes: lanes })
    await settle()
    expect(loaded()).toBe('false')
    await flush()
    expect(loaded()).toBe('true')
  })

  it('queries a lane only once it reaches the viewport and keeps it after', async () => {
    localStorage.setItem('#platform.lazy.loading', 'true')
    const groups = board({ todo: [card('a1', 'todo', 'A'), card('b1', 'todo', 'B')], done: [] })
    await mount(swimProps(groups, lanes))
    expect(fakeQueries.calls).toHaveLength(0)

    intersect(laneBlock('B'))
    await settle()
    expect(live().map(ids)).toEqual([['b1', 'hdr-B']])

    intersect(laneBlock('A'))
    await settle()
    expect(live().map(ids)).toEqual([
      ['b1', 'hdr-B'],
      ['a1', 'hdr-A']
    ])
  })

  it('waits for lanes of a new grouping to reach the viewport, even with the same id', async () => {
    localStorage.setItem('#platform.lazy.loading', 'true')
    const groups = board({ todo: [card('a1', 'todo', 'A')], done: [] })
    const component = await mount(swimProps(groups, [lane('A')]))
    intersect(laneBlock('A'))
    await settle()
    expect(live().map(ids)).toEqual([['a1', 'hdr-A']])

    component.$set({ swimLaneKey: 'other' })
    await settle()
    expect(live()).toEqual([])
    intersect(laneBlock('A'))
    await settle()
    expect(live().map(ids)).toEqual([['a1', 'hdr-A']])
  })

  it('hides lanes beyond 20 until show more lanes is pressed', async () => {
    const many = Array.from({ length: 25 }, (_, i) => lane(`L${String(i).padStart(2, '0')}`))
    const groups = board({ todo: many.map((l) => card(`c-${l._id}`, 'todo', l._id)), done: [] })
    await mount(swimProps(groups, many))

    expect(q('[data-id="kanban-swimlane"]')).toHaveLength(20)
    expect(fakeQueries.calls).toHaveLength(20)
    expect(one('[data-id="btn-kanban-show-more-lanes"]')).toBeTruthy()

    one('[data-id="btn-kanban-show-more-lanes"]').click()
    await settle()

    expect(q('[data-id="kanban-swimlane"]')).toHaveLength(25)
    expect(fakeQueries.calls).toHaveLength(25)
    expect(parent.querySelector('[data-id="btn-kanban-show-more-lanes"]')).toBeNull()
  })

  describe('collapse', () => {
    const groups = (): Record<string, Card[]> =>
      board({ todo: [...cards('a', 2, 'todo', 'A'), ...cards('b', 2, 'todo', 'B')], done: [] })
    const header = (id: string): HTMLElement => one('[data-id="kanban-swimlane-header"]', laneBlock(id))

    it('toggles on header click and persists to localStorage', async () => {
      await mount(swimProps(groups(), lanes))
      await flush()
      expect(header('A').dataset.swimlaneCollapsed).toBe('false')

      header('A').click()
      await settle()
      expect(header('A').dataset.swimlaneCollapsed).toBe('true')
      expect(header('B').dataset.swimlaneCollapsed).toBe('false')
      expect(JSON.parse(localStorage.getItem('kanban-swimlane-collapsed-test') as string)).toEqual(['A'])
      expect(cardIds(laneBlock('A'))).toEqual([])
      // The collapsed lane drops its cards from the query but keeps the header doc.
      expect(ids(live().find((c) => ids(c).includes('hdr-A')) as FakeCall)).toEqual(['hdr-A'])

      header('A').click()
      await settle()
      expect(header('A').dataset.swimlaneCollapsed).toBe('false')
      expect(JSON.parse(localStorage.getItem('kanban-swimlane-collapsed-test') as string)).toEqual([])
    })

    it('loads the header doc of a lane collapsed before mount', async () => {
      localStorage.setItem('kanban-swimlane-collapsed-test', JSON.stringify(['B']))
      docs.set('hdr-B', { _id: 'hdr-B' } as unknown as Card)
      await mount(swimProps(groups(), lanes))

      expect(header('B').dataset.swimlaneCollapsed).toBe('true')
      const query = fakeQueries.calls.find((c) => ids(c).includes('hdr-B')) as FakeCall
      expect(ids(query)).toEqual(['hdr-B'])
      const slot = one('[data-test="lane-header"][data-lane="B"]')
      expect(slot.dataset.docsLoaded).toBe('false')
      expect(slot.dataset.laneDoc).toBe('')

      await flush()
      const loaded = one('[data-test="lane-header"][data-lane="B"]')
      expect(loaded.dataset.docsLoaded).toBe('true')
      expect(loaded.dataset.laneDoc).toBe('hdr-B')
      expect(loaded.dataset.collapsed).toBe('true')
    })

    it('collapseAll and expandAll registered under controlKey drive the lanes', async () => {
      const component = await mount(swimProps(groups(), lanes, { controlKey: 'ctl' }))
      const controls = get(swimLaneControlStore).get('ctl')
      expect(controls).toBeDefined()

      controls?.collapseAll()
      await settle()
      expect(q('[data-id="kanban-swimlane-header"]').map((e) => e.dataset.swimlaneCollapsed)).toEqual(['true', 'true'])
      expect(JSON.parse(localStorage.getItem('kanban-swimlane-collapsed-test') as string)).toEqual(['A', 'B'])

      controls?.expandAll()
      await settle()
      expect(q('[data-id="kanban-swimlane-header"]').map((e) => e.dataset.swimlaneCollapsed)).toEqual([
        'false',
        'false'
      ])

      component.$destroy()
      mounted = []
      expect(get(swimLaneControlStore).has('ctl')).toBe(false)
    })

    it('registerSwimLaneControls returns a working unregister function', () => {
      const off = registerSwimLaneControls('k', { collapseAll: () => {}, expandAll: () => {} })
      expect(get(swimLaneControlStore).has('k')).toBe(true)
      off()
      expect(get(swimLaneControlStore).has('k')).toBe(false)
    })
  })

  describe('drag', () => {
    const dragBoard = async (extra: Record<string, unknown> = {}): Promise<Record<string, Card[]>> => {
      const groups = board({
        todo: [card('a1', 'todo', 'A'), card('a2', 'todo', 'A'), card('b1', 'todo', 'B')],
        done: [card('b2', 'done', 'B')]
      })
      await mount(swimProps(groups, lanes, extra))
      await flush()
      return groups
    }

    it('moving across lanes applies the lane update through client.update', async () => {
      const onMoveCommit = vi.fn()
      const groups = await dragBoard({ onMoveCommit })
      const before = fakeQueries.calls.length

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cell('B', 'todo'), 'dragover')
      await settle()
      expect(cardIds(cell('B', 'todo'))).toContain('a1')
      fire(cell('B', 'todo'), 'drop')
      await settle()

      expect(fakeQueries.calls).toHaveLength(before)
      expect(fakeClient.update).toHaveBeenCalledTimes(1)
      const [target, update] = fakeClient.update.mock.calls[0] as [Card, { lane: string, rank: string }]
      expect(target._id).toBe('a1')
      expect(update.lane).toBe('B')
      expect(update.rank > groups.todo[2].rank).toBe(true)
      expect(onMoveCommit).toHaveBeenCalledWith('a1', update)
    })

    it('moving across lanes and columns updates the status too', async () => {
      await dragBoard()

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cell('B', 'done'), 'dragover')
      fire(cell('B', 'done'), 'drop')
      await settle()

      const [, update] = fakeClient.update.mock.calls[0] as [Card, Record<string, string>]
      expect(update).toMatchObject({ lane: 'B', status: 'done' })
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    })

    it('dropping a card on itself in the same cell makes no update', async () => {
      const onMoveCommit = vi.fn()
      await dragBoard({ onMoveCommit })

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cardEl('a1'), 'dragover')
      fire(cardEl('a1'), 'drop')
      await settle()

      expect(fakeClient.update).not.toHaveBeenCalled()
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
      expect(onMoveCommit).not.toHaveBeenCalled()
    })

    it('reordering inside a cell ranks the card after the card it was dropped below', async () => {
      const groups = await dragBoard()

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cardEl('a2'), 'dragover', 5)
      fire(cardEl('a2'), 'drop')
      await settle()

      expect(fakeClient.update).not.toHaveBeenCalled()
      const [target, update] = fakeClient.diffUpdate.mock.calls[0] as [Card, { rank: string }]
      expect(target._id).toBe('a1')
      expect(update.rank > groups.todo[1].rank).toBe(true)
    })
  })
})

describe('Kanban select', () => {
  const focusTo = (component: HarnessInstance): Array<string | undefined> => {
    const seen: Array<string | undefined> = []
    component.$on('obj-focus', (e: CustomEvent) => seen.push(e.detail?._id))
    return seen
  }

  it('moves vertically and horizontally in the legacy layout', async () => {
    const groups = board({ todo: cards('t', 3, 'todo'), doing: cards('d', 2, 'doing') })
    const component = await mount(legacyProps(groups))
    const seen = focusTo(component)

    component.select(1, groups.todo[0], 'vertical')
    component.select(-1, groups.todo[2], 'vertical')
    component.select(1, groups.todo[2], 'vertical')
    component.select(1, groups.todo[2], 'horizontal')
    component.select(-1, groups.doing[1], 'horizontal')
    component.select(0, groups.todo[1])

    // Edges of a column keep the focus on the edge card; a shorter neighbour column clamps the index.
    expect(seen).toEqual(['t01', 't01', 't02', 'd01', 't01', 't01'])
  })

  it('crosses lanes vertically and skips empty cells in swim lane mode', async () => {
    const a = [card('a1', 'todo', 'A'), card('a2', 'todo', 'A'), card('a3', 'done', 'A')]
    const c = [card('c1', 'todo', 'C'), card('c2', 'done', 'C')]
    const groups = board({ todo: [a[0], a[1], c[0]], done: [a[2], c[1]] })
    const component = await mount(swimProps(groups, [lane('A'), lane('E'), lane('C')]))
    const seen = focusTo(component)

    component.select(1, a[1], 'vertical')
    component.select(-1, c[0], 'vertical')
    component.select(1, a[2], 'vertical')
    component.select(1, a[0], 'horizontal')
    component.select(-1, c[1], 'horizontal')

    expect(seen).toEqual(['c1', 'a2', 'c2', 'a3', 'c1'])
  })

  it('does not step into a collapsed lane', async () => {
    localStorage.setItem('kanban-swimlane-collapsed-test', JSON.stringify(['B']))
    const groups = board({
      todo: [card('a1', 'todo', 'A'), card('b1', 'todo', 'B'), card('c1', 'todo', 'C')],
      done: []
    })
    const component = await mount(swimProps(groups, [lane('A'), lane('B'), lane('C')]))
    const seen = focusTo(component)

    component.select(1, groups.todo[0], 'vertical')

    expect(seen).toEqual(['c1'])
  })
})
