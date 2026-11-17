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
import {
  columnControlStore,
  registerColumnControls,
  registerSwimLaneControls,
  swimLaneControlStore,
  type ColumnControls
} from '../swimlane'
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

function fire (el: Element, type: string, offsetY: number = 0, point?: { x: number, y: number }): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'offsetY', { value: offsetY })
  if (point !== undefined) {
    Object.defineProperties(ev, { clientX: { value: point.x }, clientY: { value: point.y } })
  }
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

describe.each([false, true])('Kanban fitted columns, swim lanes: %s', (swim) => {
  it('fits open tracks and the collapsed stack, then restores fixed widths when disabled', async () => {
    const groups = board({ todo: cards('t', 1, 'todo', 'a'), doing: cards('d', 1, 'doing', 'a'), done: [] })
    const props = swim ? swimProps(groups, [lane('a')]) : legacyProps(groups)
    const component = await mount({ ...props, fitColumns: true, modern: true, controlKey: 'fit' })
    const grid = (): HTMLElement => one(swim ? '.swimlane-header-row' : '.kanban-content')
    const track = 'minmax(0, var(--kanban-col-width))'
    expect(grid().style.gridTemplateColumns).toBe(`${track} ${track} ${track}`)
    expect(q('[data-test="column-header"]')).toHaveLength(3)
    if (swim) {
      expect(one('.swimlane-grid').style.gridTemplateColumns).toBe(grid().style.gridTemplateColumns)
    }

    one('[data-test="column-header"]').click()
    await settle()
    expect(one('[data-id="kanban-collapsed-stack"]')).toBeTruthy()
    expect(one('.kanban-container').style.getPropertyValue('--kanban-fit-tracks')).toBe('3')
    expect(grid().style.gridTemplateColumns).toBe(
      swim ? `${track} ${track}` : `${track} ${track} minmax(0, var(--kanban-col-stack))`
    )

    component.$set({ fitColumns: false })
    await settle()
    expect(one('.kanban-container').classList.contains('fit-columns')).toBe(false)
    expect(grid().style.gridTemplateColumns).toBe(swim ? 'var(--kanban-col-width) var(--kanban-col-width)' : '')
  })
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

describe('Kanban column scrolling', () => {
  it('keeps status targets outside the cards viewport while scrolling and dropping', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), doing: cards('d', 20, 'doing') })
    const updates = vi.fn((_doc: unknown, state: string, target?: string) => ({ status: target ?? state }))
    await mount(
      legacyProps(groups, {
        limitScale: 2,
        getUpdateProps: updates,
        dropTargets: new Map([['doing', [{ id: 'a' }, { id: 'b' }]]])
      })
    )
    await flush()
    const destination = column('doing')
    const viewport = one('.scroll', destination)
    viewport.scrollTop = 250
    fire(viewport, 'scroll')
    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(destination, 'dragover')
    await settle()
    const targets = one('[data-id="kanban-drop-targets"]', destination)
    expect(viewport.contains(targets)).toBe(false)
    expect(targets.parentElement).toBe(one('.column-body', destination))
    expect(one('.column-body', destination).parentElement).toBe(destination)
    expect(viewport.scrollTop).toBe(250)
    viewport.scrollTop = 400
    fire(viewport, 'scroll')
    await settle()
    expect(one('[data-id="kanban-drop-targets"]', destination)).toBe(targets)
    expect(one('.scroll', destination)).toBe(viewport)
    fire(one('[data-drop-target="b"]', targets), 'dragover')
    await settle()
    fire(one('[data-drop-target="b"]', targets), 'drop')
    await settle()
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({ _id: 't00' }), 'doing', 'b')
    expect(fakeClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 't00' }),
      expect.objectContaining({ status: 'b' })
    )
    expect(q('[data-id="kanban-drop-targets"]')).toHaveLength(0)
    expect(viewport.scrollTop).toBe(400)
  })

  it('keeps ordinary columns scrollable when no status targets are configured', async () => {
    const groups = board({ todo: cards('t', 20, 'todo'), doing: cards('d', 5, 'doing') })
    await mount(legacyProps(groups, { limitScale: 2 }))
    await flush()
    const source = column('todo')
    const viewport = one('.scroll', source)
    expect(one('.column-cards-scroll', source).contains(viewport)).toBe(true)
    expect(cardIds(source)).toHaveLength(20)
    expect(q('[data-id="kanban-drop-targets"]')).toHaveLength(0)
    viewport.scrollTop = 250
    fire(viewport, 'scroll')
    await settle()
    expect(one('.scroll', source)).toBe(viewport)
    expect(viewport.scrollTop).toBe(250)
    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    await settle()
    expect(q('[data-id="kanban-drop-targets"]')).toHaveLength(0)
    window.dispatchEvent(new Event('dragend'))
    await settle()
    expect(cardIds(source)[0]).toBe('t00')
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
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

  it('shows a destination column spots after movement in the source column', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing') })
    await mount(
      legacyProps(groups, {
        dropTargets: new Map([['doing', [{ id: 'a' }, { id: 'b' }]]])
      })
    )
    await flush()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    // No spots before movement, so dragstart keeps the source card mounted.
    expect(q('[data-id="kanban-drop-targets"]')).toHaveLength(0)

    fire(column('todo'), 'dragover')
    await settle()
    const spots = q('[data-drop-target]', column('doing'))
    expect(spots.map((e) => e.getAttribute('data-drop-target'))).toEqual(['a', 'b'])
  })

  it('a drop on a landing spot passes its id to getUpdateProps', async () => {
    const updates: Array<[string, string]> = []
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing') })
    await mount(
      legacyProps(groups, {
        dropTargets: new Map([['doing', [{ id: 'a' }, { id: 'b' }]]]),
        getUpdateProps: (_doc: unknown, state: string, dropTargetId?: string) => {
          updates.push([state, dropTargetId ?? ''])
          return { status: dropTargetId ?? state }
        }
      })
    )
    await flush()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    await settle()
    fire(one('[data-drop-target="b"]', column('doing')), 'drop')
    await settle()

    expect(updates).toContainEqual(['doing', 'b'])
    expect(fakeClient.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'b' }))
  })

  it('shows the spots of the column the card starts in', async () => {
    const groups = board({ doing: cards('d', 1, 'doing') })
    await mount(
      legacyProps(groups, {
        dropTargets: new Map([['doing', [{ id: 'a' }, { id: 'b' }]]])
      })
    )
    await flush()

    fire(cardEl('d00'), 'dragstart')
    await settle()
    // No spots until the drag is under way, so dragstart does not reflow the column.
    expect(q('[data-id="kanban-drop-targets"]')).toHaveLength(0)

    fire(column('doing'), 'dragover')
    await settle()
    // A card dragged inside its own multi-status column sees the spots too.
    expect(q('[data-id="kanban-drop-targets"] [data-drop-target]', column('doing'))).toHaveLength(2)
  })

  it('the dragged card stands in the landing spot under the pointer', async () => {
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing') })
    await mount(
      legacyProps(groups, {
        dropTargets: new Map([['doing', [{ id: 'a' }, { id: 'b' }]]])
      })
    )
    await flush()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    await settle()
    // Spots show: the card is out of the column's card list, in a spot only when aimed at.
    const slot = one('[data-drop-target="a"]', column('doing'))
    const inList = (): string[] =>
      q('[data-test="card-body"]', column('doing'))
        .filter((e) => e.closest('.drop-targets') === null)
        .map((e) => e.textContent ?? '')
    expect(inList()).not.toContain('t00')
    expect(q('[data-test="card-body"]', slot)).toHaveLength(0)

    fire(slot, 'dragover')
    await settle()
    // The card stands in the slot and stays out of the column's card list.
    expect(q('[data-test="card-body"]', slot).map((e) => e.textContent)).toEqual(['t00'])
    expect(inList()).not.toContain('t00')
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

  it('a card dropped on a collapsed column in swim lane mode keeps its own lane', async () => {
    const groups = board({
      todo: [card('a1', 'todo', 'A'), card('b1', 'todo', 'B')],
      done: [card('a2', 'done', 'A')]
    })
    await mount(swimProps(groups, [lane('A'), lane('B')], { controlKey: 'viewlet' }))
    await flush()
    one('[data-test="column-header"]', one('[data-id="kanban-column-header"][data-state="done"]')).click()
    await settle()

    fire(cardEl('a1'), 'dragstart')
    await settle()
    fire(cell('B', 'todo'), 'dragover')
    fire(stacked('done'), 'dragover')
    fire(stacked('done'), 'drop')
    fire(one('.kanban-container'), 'drop')
    await settle()

    expect(fakeClient.update).toHaveBeenCalledTimes(1)
    const [, update] = fakeClient.update.mock.calls[0] as [Card, Record<string, string>]
    expect(update.status).toBe('done')
    expect(update).not.toHaveProperty('lane')
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

  it('puts a card back when the drag ends after it hovered a collapsed column', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), done: cards('x', 2, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    header('done').click()
    await settle()
    const count = (): string | undefined => one('[data-test="column-header"]', stacked('done')).dataset.count

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(stacked('done'), 'dragover')
    await settle()
    // The preview moved the card into the array of the stacked column, which is not drawn.
    expect(count()).toBe('3')
    expect(cardIds(column('todo'))).toEqual(['t01'])

    fire(one('.kanban-container'), 'dragend')
    await settle()

    expect(count()).toBe('2')
    expect(cardIds(column('todo'))).toEqual(['t00', 't01'])
    expect(fakeClient.update).not.toHaveBeenCalled()
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

describe.each([false, true])('Kanban landing spots, swim lanes: %s', (swim) => {
  it('keeps cards visible while the remaining data loads and hides the status when complete', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    const component = await mount({ ...props, loading: true })
    await flush()
    expect(one('[data-id="kanban-loading"]').getAttribute('role')).toBe('status')
    expect(cardIds()).toEqual(['t00', 't01'])
    component.$set({ loading: false })
    await settle()
    expect(q('[data-id="kanban-loading"]')).toHaveLength(0)
    expect(cardIds()).toEqual(['t00', 't01'])
    component.$set({ loading: true })
    await settle()
    expect(q('[data-id="kanban-loading"]')).toHaveLength(1)
  })

  it.each(['card', 'spot'])(
    'ends a stopped %s drop before its write resolves and keeps the next drag',
    async (targetKind) => {
      const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: cards('d', 2, 'doing', 'A') })
      const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
      await mount({ ...props, dropTargets: new Map([['doing', [{ id: 'doing' }]]]) })
      await flush()
      let finish!: () => void
      const write = targetKind === 'card' ? fakeClient.diffUpdate : fakeClient.update
      write.mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            finish = () => {
              resolve({})
            }
          })
      )
      fire(cardEl('t00'), 'dragstart')
      await settle()
      const destination = swim ? cell('A', 'doing') : column('doing')
      fire(destination, 'dragover')
      await settle()
      const target = targetKind === 'card' ? cardEl('d00') : one('[data-drop-target="doing"]', destination)
      fire(target, 'dragover', 5)
      fire(target, 'drop')
      await Promise.resolve()
      await Promise.resolve()
      expect(q('[data-drop-target]')).toHaveLength(1)
      await settle()
      expect(write).toHaveBeenCalledTimes(1)
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 't00' }),
        expect.objectContaining({ status: 'doing' })
      )
      expect(q('[data-drop-target]')).toHaveLength(0)
      expect(q('[data-dragged="true"]')).toHaveLength(0)
      expect(q('.drop-allowed, .drop-disabled')).toHaveLength(0)

      fire(cardEl('t01'), 'dragstart')
      await settle()
      fire(destination, 'dragover')
      await settle()
      expect(q('[data-drop-target]')).toHaveLength(1)
      finish()
      await settle()
      expect(q('[data-drop-target]')).toHaveLength(1)
      fire(one('[data-drop-target="doing"]', destination), 'dragover')
      await settle()
      expect(one('.drop-target-card', destination).textContent).toBe('t01')
      expect(write).toHaveBeenCalledTimes(1)
    }
  )

  it.each([false, true])(
    'cancels a return to the source panel outside the original rectangle, nonmanual descending: %s',
    async (descending) => {
      const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
      const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
      await mount({
        ...props,
        dontUpdateRank: descending,
        orderBy: descending ? ['modifiedOn', -1] : undefined,
        dropTargets: new Map([
          ['todo', [{ id: 'todo' }]],
          ['doing', [{ id: 'doing' }]]
        ])
      })
      await flush()
      vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
      fire(cardEl('t00'), 'dragstart')
      await settle()
      fire(swim ? cell('A', 'doing') : column('doing'), 'dragover', 0, { x: 450, y: 300 })
      await settle()
      const source = swim ? cell('A', 'todo') : column('todo')
      fire(source, 'dragover', 0, { x: 150, y: 400 })
      await settle()
      fire(source, 'drop', 0, { x: 150, y: 400 })
      await settle()
      expect(groups.todo.map((doc) => doc._id)).toEqual(['t00', 't01'])
      expect(fakeClient.update).not.toHaveBeenCalled()
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    }
  )

  it('cancels a source panel drop after crossing a neighbouring card', async () => {
    const groups = board({ todo: cards('t', 3, 'todo', 'A'), doing: [] })
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    await mount(props)
    await flush()
    const originalRank = groups.todo[1].rank
    fire(cardEl('t01'), 'dragstart')
    await settle()
    fire(swim ? cell('A', 'doing') : column('doing'), 'dragover')
    await settle()
    const source = swim ? cell('A', 'todo') : column('todo')
    fire(source, 'dragover')
    await settle()
    fire(cardEl('t00'), 'dragover', -5)
    await settle()
    fire(source, 'dragover')
    fire(source, 'drop')
    await settle()
    expect(cardIds(source)).toEqual(['t00', 't01', 't02'])
    expect(docs.get('t01')?.rank).toBe(originalRank)
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it.skipIf(!swim)('keeps a drop in another lane of the source column', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A') })
    await mount(swimProps(groups, [lane('A'), lane('B')], { dropTargets: new Map([['todo', [{ id: 'todo' }]]]) }))
    await flush()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(cell('B', 'todo'), 'dragover')
    await settle()
    fire(one('[data-drop-target="todo"]', cell('B', 'todo')), 'drop')
    await settle()
    expect(fakeClient.update).toHaveBeenCalledTimes(1)
    expect(fakeClient.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lane: 'B' }))
  })

  it('keeps an explicitly chosen different status in the source column', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A') })
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    await mount({
      ...props,
      dropTargets: new Map([['todo', [{ id: 'other-status' }]]]),
      getUpdateProps: (_doc: unknown, state: string, target?: string) => ({ status: target ?? state })
    })
    await flush()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    const source = swim ? cell('A', 'todo') : column('todo')
    fire(source, 'dragover')
    await settle()
    const spot = one('[data-drop-target="other-status"]', source)
    fire(spot, 'dragover')
    fire(spot, 'drop')
    await settle()
    expect(fakeClient.update).toHaveBeenCalledTimes(1)
    expect(fakeClient.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'other-status' })
    )
  })

  it('ends a cancelled drag when dragend reaches only its detached source card', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
    await mount({
      ...(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)),
      getAvailableCategories: async () => ['todo', 'doing']
    })
    await flush()
    const source = cardEl('t00')
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    fire(source, 'dragstart')
    await settle()
    fire(swim ? cell('A', 'doing') : column('doing'), 'dragover', 0, { x: 450, y: 300 })
    await settle()
    expect(source.isConnected).toBe(false)
    expect(q('[data-drop-target]')).toHaveLength(0)
    fire(source, 'dragend')
    await settle()
    expect(q('[data-dragged="true"], .drop-allowed, .drop-disabled, [data-drop-target]')).toHaveLength(0)
    expect(cardIds(swim ? cell('A', 'todo') : column('todo'))).toEqual(['t00', 't01'])
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it('ends a drop at the origin before available statuses finish loading', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
    let resolveAvailable!: (value: string[]) => void
    const available = new Promise<string[]>((resolve) => {
      resolveAvailable = resolve
    })
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    const component = await mount({
      ...props,
      dropTargets: new Map(),
      getAvailableCategories: async () => {
        const states = await available
        component.$set({
          dropTargets: new Map([
            ['todo', [{ id: 'todo' }]],
            ['doing', [{ id: 'doing' }]]
          ])
        })
        return states
      }
    })
    await flush()
    vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    const source = swim ? cell('A', 'todo') : column('todo')
    fire(cardEl('t00'), 'dragstart')
    fire(source, 'dragover', 0, { x: 104, y: 104 })
    fire(source, 'drop', 0, { x: 104, y: 104 })
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    await settle()
    expect(q('[data-dragged="true"]')).toHaveLength(0)
    resolveAvailable(['todo', 'doing'])
    await settle()
    expect(q('[data-dragged="true"]')).toHaveLength(0)
    expect(q('[data-drop-target]')).toHaveLength(0)
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it('checks the origin before neighbor hover and still allows reordering outside it', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    const setGroupByValues = vi.fn((g: Record<string, Item[]>, state: string, items: Item[]) => {
      g[state] = items
    })
    await mount({ ...props, setGroupByValues, dropTargets: new Map([['todo', [{ id: 'todo' }]]]) })
    await flush()
    const original = cardEl('t00')
    const neighbor = cardEl('t01')
    vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    fire(cardEl('t00'), 'dragstart')
    await settle()
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame')
    for (let index = 0; index < 20; index++) {
      fire(neighbor, 'dragover', 5, { x: 104, y: 104 })
    }
    const scheduledFrames = frames.mock.calls.length
    frames.mockRestore()
    await settle()
    expect(scheduledFrames).toBe(0)
    expect(setGroupByValues).not.toHaveBeenCalled()
    expect(groups.todo.map((doc) => doc._id)).toEqual(['t00', 't01'])
    expect(cardEl('t00')).toBe(original)
    expect(cardEl('t01')).toBe(neighbor)
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()

    fire(neighbor, 'dragover', 5, { x: 150, y: 250 })
    await settle()
    expect(q('[data-drop-target]', swim ? cell('A', 'todo') : column('todo'))).toHaveLength(1)
    fire(neighbor, 'drop', 5, { x: 150, y: 250 })
    await settle()
    expect(fakeClient.diffUpdate).toHaveBeenCalledTimes(1)
    expect(fakeClient.diffUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 't00' }),
      expect.objectContaining({ rank: expect.any(String) })
    )
  })

  it('rolls back a rejected earlier write without ending the next drag', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: cards('d', 1, 'doing', 'A') })
    const rollback = vi.fn()
    await mount({
      ...(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)),
      onMoveRollback: rollback,
      dropTargets: new Map([['doing', [{ id: 'doing' }]]])
    })
    await flush()
    let rejectWrite!: (error: Error) => void
    fakeClient.diffUpdate.mockImplementationOnce(
      async () =>
        await new Promise((_resolve, reject) => {
          rejectWrite = reject
        })
    )
    fire(cardEl('t00'), 'dragstart')
    await settle()
    const destination = swim ? cell('A', 'doing') : column('doing')
    fire(destination, 'dragover')
    await settle()
    fire(cardEl('d00'), 'drop')
    await settle()
    fire(cardEl('t01'), 'dragstart')
    await settle()
    fire(destination, 'dragover')
    await settle()
    fire(one('[data-drop-target]', destination), 'dragover')
    await settle()
    rejectWrite(new Error('write A failed'))
    await settle()
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(rollback).toHaveBeenCalledWith('t00')
    expect(one('.drop-target-card', destination).textContent).toBe('t01')
    expect(q('[data-drop-target]')).toHaveLength(1)
  })

  it('cancels the current drag when available categories fail to load', async () => {
    const groups = board({ todo: cards('t', 1, 'todo', 'A'), doing: [] })
    let rejectAvailable!: (error: Error) => void
    await mount({
      ...(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)),
      getAvailableCategories: async () =>
        await new Promise<string[]>((_resolve, reject) => {
          rejectAvailable = reject
        })
    })
    await flush()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(77)
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      fire(cardEl('t00'), 'dragstart')
      await settle()
      fire(swim ? cell('A', 'doing') : column('doing'), 'dragover', 0, { x: 400, y: 300 })
      await settle()
      expect(frames).toHaveBeenCalledTimes(1)
      rejectAvailable(new Error('available categories failed'))
      await settle()
      expect(q('[data-dragged="true"], .drop-allowed, .drop-disabled, [data-drop-target]')).toHaveLength(0)
      expect(cancel).toHaveBeenCalledWith(77)
      for (const [type, listener, options] of add.mock.calls) {
        if (!['drop', 'dragend', 'mousemove'].includes(type)) continue
        expect(remove).toHaveBeenCalledWith(type, listener, options)
      }
      expect(fakeClient.update).not.toHaveBeenCalled()
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    } finally {
      add.mockRestore()
      remove.mockRestore()
      frames.mockRestore()
      cancel.mockRestore()
      report.mockRestore()
    }
  })

  it('keeps the next drag usable when earlier available categories reject', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [], done: [] })
    let rejectAvailable!: (error: Error) => void
    let resolveAvailable!: (states: string[]) => void
    const available = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          await new Promise<string[]>((_resolve, reject) => {
            rejectAvailable = reject
          })
      )
      .mockImplementationOnce(
        async () =>
          await new Promise<string[]>((resolve) => {
            resolveAvailable = resolve
          })
      )
    await mount({
      ...(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)),
      getAvailableCategories: available
    })
    await flush()
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      fire(cardEl('t00'), 'dragstart')
      await settle()
      fire(cardEl('t00'), 'dragend')
      await settle()
      fire(cardEl('t01'), 'dragstart')
      await settle()
      resolveAvailable(['todo', 'doing'])
      await settle()
      const destination = swim ? cell('A', 'doing') : column('doing')
      const blocked = swim ? cell('A', 'done') : column('done')
      fire(destination, 'dragover')
      await settle()
      expect(blocked.classList.contains('drop-disabled')).toBe(true)
      rejectAvailable(new Error('earlier available categories failed'))
      await settle()
      expect(blocked.classList.contains('drop-disabled')).toBe(true)
      expect(destination.classList.contains('drop-allowed')).toBe(true)
      fire(destination, 'drop')
      await settle()
      expect(fakeClient.update).toHaveBeenCalledTimes(1)
      expect(fakeClient.update).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 't01' }),
        expect.objectContaining({ status: 'doing' })
      )
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    } finally {
      report.mockRestore()
    }
  })

  it('ignores available categories from an earlier drag and from a destroyed board', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [], done: [] })
    const resolvers: Array<(states: string[]) => void> = []
    const available = vi.fn(async () => await new Promise<string[]>((resolve) => resolvers.push(resolve)))
    const component = await mount({
      ...(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)),
      getAvailableCategories: available
    })
    await flush()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(cardEl('t00'), 'dragend')
    await settle()
    fire(cardEl('t01'), 'dragstart')
    await settle()
    fire(swim ? cell('A', 'doing') : column('doing'), 'dragover')
    await settle()
    resolvers[1](['todo', 'doing'])
    await settle()
    const destination = swim ? cell('A', 'done') : column('done')
    expect(destination.classList.contains('drop-disabled')).toBe(true)
    resolvers[0](['todo', 'done'])
    await settle()
    expect(destination.classList.contains('drop-disabled')).toBe(true)
    fire(cardEl('t01'), 'dragend')
    await settle()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    component.$destroy()
    mounted = mounted.filter((entry) => entry !== component)
    const queries = fakeQueries.calls.length
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame')
    resolvers[2](['todo', 'done'])
    await settle()
    const scheduled = frames.mock.calls.length
    frames.mockRestore()
    expect(scheduled).toBe(0)
    expect(fakeQueries.calls).toHaveLength(queries)
    expect(q('.kanban-container')).toHaveLength(0)
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it('keeps insertion stable when hover changes between a card and its nested title', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
    const setGroupByValues = vi.fn((g: Record<string, Item[]>, state: string, items: Item[]) => {
      g[state] = items
    })
    await mount({ ...(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)), setGroupByValues })
    await flush()
    const source = cardEl('t00')
    const target = cardEl('t01')
    const title = one('[data-test="card-body"]', target)
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    Object.defineProperty(target, 'offsetHeight', { configurable: true, value: 100 })
    Object.defineProperty(title, 'offsetHeight', { configurable: true, value: 20 })
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 150, 200, 20))
    fire(source, 'dragstart')
    await settle()
    fire(target, 'dragover', 55, { x: 150, y: 155 })
    await settle()
    const root = swim ? cell('A', 'todo') : column('todo')
    expect(cardIds(root)).toEqual(['t01', 't00'])
    const writes = setGroupByValues.mock.calls.length
    const queries = fakeQueries.calls.length
    for (let index = 0; index < 20; index++) {
      fire(target, 'dragover', 55, { x: 150, y: 155 })
      await settle()
      expect(cardIds(root)).toEqual(['t01', 't00'])
    }
    expect(setGroupByValues).toHaveBeenCalledTimes(writes)
    expect(fakeQueries.calls).toHaveLength(queries)
    for (let index = 0; index < 20; index++) {
      fire(index % 2 === 0 ? title : target, 'dragover', index % 2 === 0 ? 5 : 55, { x: 150, y: 155 })
      await settle()
      expect(cardIds(root)).toEqual(['t01', 't00'])
      expect(cardEl('t00')).toBe(source)
      expect(cardEl('t01')).toBe(target)
      expect(one('[data-test="card-body"]', target)).toBe(title)
    }
    expect(setGroupByValues).toHaveBeenCalledTimes(writes)
    expect(fakeQueries.calls).toHaveLength(queries)
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it.each([false, true])('reschedules edge scrolling only when offsets change, blocked: %s', async (blocked) => {
    const groups = board({ todo: cards('t', 1, 'todo', 'A'), doing: [] })
    await mount(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups))
    await flush()
    const scroll = one('.kanban-container .scroll')
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 300))
    let left = 0
    let top = 0
    Object.defineProperties(scroll, {
      scrollLeft: {
        configurable: true,
        get: () => left,
        set: (value: number) => {
          if (!blocked) left = value
        }
      },
      scrollTop: {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          if (!blocked) top = value
        }
      }
    })
    fire(cardEl('t00'), 'dragstart')
    await settle()
    const callbacks: FrameRequestCallback[] = []
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    fire(swim ? cell('A', 'doing') : column('doing'), 'dragover', 0, { x: 295, y: 295 })
    expect(callbacks).toHaveLength(1)
    callbacks[0](0)
    const scheduled = callbacks.length
    frames.mockRestore()
    expect(scheduled).toBe(blocked ? 1 : 2)
  })

  it('keeps one diagonal scroll frame until both axes stop moving', async () => {
    const groups = board({ todo: cards('t', 1, 'todo', 'A'), doing: [] })
    await mount(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups))
    await flush()
    const scroll = one('.kanban-container .scroll')
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 300))
    let top = 0
    let blocked = false
    Object.defineProperties(scroll, {
      scrollLeft: { configurable: true, get: () => 0, set: () => {} },
      scrollTop: {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          if (!blocked) top = value
        }
      }
    })
    fire(cardEl('t00'), 'dragstart')
    await settle()
    const pending = new Map<number, FrameRequestCallback>()
    let id = 0
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      pending.set(++id, callback)
      return id
    })
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((key) => {
      pending.delete(key)
    })
    try {
      const destination = swim ? cell('A', 'doing') : column('doing')
      for (let index = 0; index < 20; index++) fire(destination, 'dragover', 0, { x: 295, y: 295 })
      expect(pending.size).toBe(1)
      for (let index = 0; index < 3; index++) {
        const [key, frame] = Array.from(pending.entries())[0]
        pending.delete(key)
        frame(index)
        expect(pending.size).toBe(1)
      }
      expect(top).toBeGreaterThan(0)
      blocked = true
      const [key, frame] = Array.from(pending.entries())[0]
      pending.delete(key)
      frame(3)
      expect(pending.size).toBe(0)
      fire(destination, 'dragover', 0, { x: 295, y: 295 })
      expect(pending.size).toBe(1)
      fire(destination, 'dragend')
      await settle()
      expect(pending.size).toBe(0)
    } finally {
      frames.mockRestore()
      cancel.mockRestore()
    }
  })

  it('keeps source spots visible when the first drag loads them asynchronously', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    const component = await mount({
      ...props,
      dropTargets: new Map(),
      getAvailableCategories: async () => {
        await Promise.resolve()
        component.$set({
          dropTargets: new Map([
            ['todo', [{ id: 'todo' }]],
            ['doing', [{ id: 'doing' }]]
          ])
        })
        return ['todo', 'doing']
      }
    })
    await flush()
    vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    fire(cardEl('t00'), 'dragstart')
    await settle()
    const source = swim ? cell('A', 'todo') : column('todo')
    fire(source, 'dragover', 0, { x: 104, y: 104 })
    await settle()
    expect(cardIds(source)).toEqual(['t00', 't01'])
    expect(q('[data-drop-target]', source)).toHaveLength(1)
    expect(q('[data-drop-target]', swim ? cell('A', 'doing') : column('doing'))).toHaveLength(1)
    fire(source, 'drop', 0, { x: 104, y: 104 })
    await settle()
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'keeps the source card below the spots and cancels a drop on it, on card: %s',
    async (onCard) => {
      const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
      const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
      await mount({
        ...props,
        dropTargets: new Map([
          ['todo', [{ id: 'todo' }]],
          ['doing', [{ id: 'doing' }]]
        ])
      })
      await flush()
      vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
      fire(cardEl('t00'), 'dragstart')
      await settle()
      const source = swim ? cell('A', 'todo') : column('todo')
      fire(source, 'dragover', 0, { x: 104, y: 104 })
      await settle()
      expect(cardIds(source)).toEqual(['t00', 't01'])
      expect(q('[data-drop-target]', source)).toHaveLength(1)
      expect(q('[data-drop-target]', swim ? cell('A', 'doing') : column('doing'))).toHaveLength(1)
      fire(onCard ? cardEl('t00') : source, 'drop', 0, { x: 104, y: 104 })
      await settle()
      expect(fakeClient.update).not.toHaveBeenCalled()
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    }
  )

  it.each([false, true])(
    'reveals source spots after leaving the initial rectangle and cancels on return, other column: %s',
    async (otherColumn) => {
      const groups = board({ todo: cards('t', 2, 'todo', 'A'), doing: [] })
      const rank = groups.todo[0].rank
      const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
      await mount({
        ...props,
        dropTargets: new Map([
          ['todo', [{ id: 'todo' }]],
          ['doing', [{ id: 'doing' }]]
        ])
      })
      await flush()
      vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
      fire(cardEl('t00'), 'dragstart')
      await settle()
      const source = swim ? cell('A', 'todo') : column('todo')
      const destination = otherColumn ? (swim ? cell('A', 'doing') : column('doing')) : source
      fire(destination, 'dragover', 0, { x: 400, y: 220 })
      await settle()
      expect(q('[data-drop-target]', source)).toHaveLength(1)
      fire(one('[data-drop-target]', source), 'dragover', 0, { x: 110, y: 110 })
      await settle()
      expect(q('[data-drop-target]', source)).toHaveLength(1)
      fire(one('[data-drop-target]', source), 'drop', 0, { x: 110, y: 110 })
      await settle()
      expect(q('[data-drop-target]', source)).toHaveLength(0)
      expect(cardIds(source)).toEqual(['t00', 't01'])
      expect(groups.todo[0].rank).toBe(rank)
      expect(fakeClient.update).not.toHaveBeenCalled()
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    }
  )

  it.each([false, true])(
    'keeps source spots visible across gaps and cancels at the shifted card, other column: %s',
    async (otherColumn) => {
      const groups = board({ todo: cards('t', 1, 'todo', 'A'), doing: [] })
      const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
      await mount({
        ...props,
        dropTargets: new Map([
          ['todo', [{ id: 'analysis' }, { id: 'todo' }]],
          ['doing', [{ id: 'doing' }]]
        ])
      })
      await flush()
      const rank = groups.todo[0].rank
      vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
      fire(cardEl('t00'), 'dragstart')
      await settle()
      const source = swim ? cell('A', 'todo') : column('todo')
      fire(otherColumn ? (swim ? cell('A', 'doing') : column('doing')) : source, 'dragover', 0, { x: 400, y: 220 })
      await settle()
      expect(cardIds(source)).toEqual(['t00'])
      fire(source, 'dragover', 0, { x: 110, y: 220 })
      await settle()
      vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 260, 200, 100))
      fire(source, 'dragover', 0, { x: 110, y: 110 })
      await settle()
      expect(q('[data-drop-target]', source)).toHaveLength(2)
      expect(cardIds(source)).toEqual(['t00'])
      fire(cardEl('t00'), 'dragover', 0, { x: 110, y: 300 })
      await settle()
      expect(q('[data-drop-target]', source)).toHaveLength(2)
      fire(cardEl('t00'), 'drop', 0, { x: 110, y: 300 })
      await settle()
      expect(q('[data-drop-target]')).toHaveLength(0)
      expect(fakeClient.update).not.toHaveBeenCalled()
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
      expect(groups.todo[0].rank).toBe(rank)
    }
  )

  it('keeps an alternate status spot selectable inside the initial card rectangle', async () => {
    const groups = board({ todo: cards('t', 1, 'todo', 'A'), doing: [] })
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    await mount({
      ...props,
      getUpdateProps: (_doc: Item, state: string, target?: string) => ({ status: target ?? state }),
      dropTargets: new Map([['todo', [{ id: 'analysis' }, { id: 'todo' }]]])
    })
    await flush()
    vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    fire(cardEl('t00'), 'dragstart')
    await settle()
    const source = swim ? cell('A', 'todo') : column('todo')
    fire(source, 'dragover', 0, { x: 400, y: 220 })
    await settle()
    fire(one('[data-drop-target="todo"]', source), 'dragover', 0, { x: 110, y: 160 })
    await settle()
    expect(q('[data-drop-target]', source)).toHaveLength(2)
    const target = one('[data-drop-target="analysis"]', source)
    for (let i = 0; i < 3; i++) {
      fire(target, 'dragover', 0, { x: 110, y: 110 })
      await settle()
      expect(q('[data-drop-target]', source)).toHaveLength(2)
      expect(target.isConnected).toBe(true)
      expect(q('.drop-target-card', target)).toHaveLength(0)
      expect(cardIds(source)).toEqual(['t00'])
    }
    fire(target, 'drop', 0, { x: 110, y: 110 })
    await settle()
    expect(fakeClient.update).toHaveBeenCalledWith(expect.objectContaining({ _id: 't00' }), { status: 'analysis' })
    expect(q('[data-drop-target]')).toHaveLength(0)
  })

  it('shows every reachable column after movement and previews only the hovered spot', async () => {
    const groups = board({ todo: cards('t', 1, 'todo', 'A'), doing: [], blocked: [] })
    const props = swim ? swimProps(groups, [lane('A'), lane('B')]) : legacyProps(groups)
    await mount({
      ...props,
      dropTargets: new Map(['todo', 'doing', 'blocked'].map((state) => [state, [{ id: 'shared' }]])),
      getAvailableCategories: async () => ['todo', 'doing'],
      getSwimLaneUpdateProps: () => undefined
    })
    await flush()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    expect(q('[data-drop-target]')).toHaveLength(0)
    fire(swim ? cell('A', 'todo') : column('todo'), 'dragover')
    await settle()
    const source = swim ? cell('A', 'todo') : column('todo')
    const destination = swim ? cell('A', 'doing') : column('doing')
    expect(q('[data-drop-target]', source)).toHaveLength(1)
    expect(q('[data-drop-target]', destination)).toHaveLength(1)
    expect(q('[data-drop-target]', swim ? cell('A', 'blocked') : column('blocked'))).toHaveLength(0)
    if (swim) expect(q('[data-drop-target]', laneBlock('B'))).toHaveLength(0)
    expect(q('.drop-target-card')).toHaveLength(0)
    fire(one('[data-drop-target]', destination), 'dragover')
    await settle()
    expect(q('.drop-target-card')).toHaveLength(1)
    expect(q('.drop-target-card', source)).toHaveLength(0)
    expect(one('.drop-target-card', destination).textContent).toBe('t00')
  })

  it.each([{ targets: [] }, { targets: ['a'] }, { targets: ['a', 'b'] }])(
    'shows only available targets: $targets',
    async ({ targets }) => {
      const groups = board({ todo: cards('t', 1, 'todo', 'A'), doing: cards('d', 1, 'doing', 'A') })
      const getUpdateProps = vi.fn((_doc: unknown, state: string, id?: string) => ({ status: id ?? state }))
      const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
      await mount({
        ...props,
        dropTargets: new Map([['doing', targets.map((id) => ({ id }))]]),
        getAvailableCategories: async () => (targets.length > 0 ? ['todo', 'doing'] : ['todo']),
        getUpdateProps
      })
      await flush()
      fire(cardEl('t00'), 'dragstart')
      await settle()
      const destination = swim ? cell('A', 'doing') : column('doing')
      fire(destination, 'dragover')
      await settle()
      expect(q('[data-drop-target]', destination).map((el) => el.dataset.dropTarget)).toEqual(targets)
      if (targets.length === 0) {
        fire(destination, 'drop')
        await settle()
        expect(fakeClient.update).not.toHaveBeenCalled()
        return
      }
      const target = one(`[data-drop-target="${targets[0]}"]`, destination)
      fire(target, 'dragover')
      await settle()
      expect(q('[data-test="card-body"]', target).map((el) => el.textContent)).toEqual(['t00'])
      expect(q('[data-test="card-body"]', destination).filter((el) => el.textContent === 't00')).toHaveLength(1)
      fire(target, 'drop')
      await settle()
      expect(getUpdateProps).toHaveBeenCalledWith(expect.anything(), 'doing', targets[0])
      expect(fakeClient.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: targets[0] }))
    }
  )

  it.each([false, true])('preserves sorted order when dragging the second card, status spots: %s', async (spots) => {
    const groups = board({ todo: cards('t', 3, 'todo', 'A') })
    await mount({
      ...(swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)),
      dontUpdateRank: true,
      orderBy: ['modifiedOn', -1],
      dropTargets: spots ? new Map([['todo', [{ id: 'analysis' }, { id: 'todo' }]]]) : new Map()
    })
    await flush()
    vi.spyOn(cardEl('t01'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 240, 200, 100))
    fire(cardEl('t01'), 'dragstart')
    await settle()
    const source = swim ? cell('A', 'todo') : column('todo')
    fire(source, 'dragover', 0, { x: 110, y: 360 })
    await settle()
    vi.spyOn(cardEl('t00'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 350, 200, 100))
    for (let i = 0; i < 6; i++) {
      fire(cardEl('t00'), 'dragover', 10, { x: 110, y: 360 })
      await settle()
      expect(cardIds(source)).toEqual(['t00', 't01', 't02'])
    }
    fire(cardEl('t01'), 'drop', 0, { x: 110, y: 360 })
    await settle()
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    expect(q('[data-drop-target]')).toHaveLength(0)
  })

  it('saves a manual reorder released on the source panel', async () => {
    const groups = board({ todo: cards('t', 3, 'todo', 'A') })
    const rank = groups.todo[0].rank
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    await mount({ ...props, dropTargets: new Map([['todo', [{ id: 'todo' }]]]) })
    await flush()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(cardEl('t02'), 'dragover', 75)
    await settle()
    fire(swim ? cell('A', 'todo') : column('todo'), 'drop')
    await settle()
    expect(fakeClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 't00' }),
      expect.objectContaining({ rank: expect.any(String) })
    )
    expect(fakeClient.update.mock.calls[0][1].rank).not.toBe(rank)
  })

  it('keeps ranking within a column with one landing spot', async () => {
    const groups = board({ todo: cards('t', 2, 'todo', 'A') })
    const second = groups.todo[1]
    const props = swim ? swimProps(groups, [lane('A')]) : legacyProps(groups)
    await mount({ ...props, dropTargets: new Map([['todo', [{ id: 'todo' }]]]) })
    await flush()
    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(cardEl('t01'), 'dragover', 5)
    fire(cardEl('t01'), 'drop')
    await settle()
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).toHaveBeenCalledTimes(1)
    const [target, update] = fakeClient.diffUpdate.mock.calls[0] as [Card, { rank: string }]
    expect(target._id).toBe('t00')
    expect(update.rank > second.rank).toBe(true)
  })

  it.each(['dragend', 'source panel', 'foreign card'])(
    'keeps one source card after hovering a foreign card and ending at %s',
    async (end) => {
      const groups = board({ todo: cards('t', 2, 'todo'), doing: cards('d', 1, 'doing') })
      await mount({
        ...legacyProps(groups),
        dropTargets: new Map([
          ['todo', [{ id: 'todo' }]],
          ['doing', [{ id: 'doing' }]]
        ])
      })
      await flush()
      fire(cardEl('t00'), 'dragstart')
      await settle()
      fire(cardEl('d00'), 'dragover', 10, { x: 400, y: 300 })
      await settle()
      expect(groups.doing.map((card) => card._id)).toEqual(['d00'])
      if (end === 'source panel') fire(column('todo'), 'drop', 0, { x: 110, y: 300 })
      else if (end === 'foreign card') fire(cardEl('d00'), 'drop', 10, { x: 400, y: 300 })
      else fire(cardEl('t00'), 'dragend')
      await settle()
      expect(cardIds()).toEqual(['t00', 't01', 'd00'])
      if (end === 'foreign card') {
        expect(fakeClient.diffUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ _id: 't00' }),
          expect.objectContaining({ status: 'doing', rank: expect.any(String) })
        )
      } else {
        expect(fakeClient.update).not.toHaveBeenCalled()
        expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
      }
    }
  )
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

  describe('canMergeByGroup', () => {
    const three = (): Record<string, Card[]> =>
      board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    const controls = (): ColumnControls | undefined => get(columnControlStore).get('viewlet')

    it('is true for a category with several statuses until they are merged', async () => {
      const groupOf: Record<string, string> = { todo: 'open', doing: 'open', done: 'closed' }
      await mount(legacyProps(three(), { controlKey: 'viewlet', getCategoryGroup: (state: string) => groupOf[state] }))
      expect(controls()?.canMergeByGroup).toBe(true)

      controls()?.mergeByGroup()
      await settle()
      expect(controls()?.canMergeByGroup).toBe(false)

      controls()?.resetMerge()
      await settle()
      expect(controls()?.canMergeByGroup).toBe(true)
    })

    it('is false when every category holds one status', async () => {
      await mount(legacyProps(three(), { controlKey: 'viewlet', getCategoryGroup: (state: string) => state }))
      expect(controls()?.canMergeByGroup).toBe(false)
    })

    it('is false without a group function', async () => {
      await mount(legacyProps(three(), { controlKey: 'viewlet' }))
      expect(controls()?.canMergeByGroup).toBe(false)
    })

    it('ignores the merged columns of another board', async () => {
      localStorage.setItem('kanban-column-merged-viewlet-status', '[["p1-done","p1-canceled"]]')
      const groupOf: Record<string, string> = { todo: 'open', doing: 'open', done: 'closed' }
      await mount(legacyProps(three(), { controlKey: 'viewlet', getCategoryGroup: (state: string) => groupOf[state] }))
      expect(controls()?.canMergeByGroup).toBe(true)
    })

    it('stays false for single statuses when another board has merged columns', async () => {
      localStorage.setItem('kanban-column-merged-viewlet-status', '[["p1-done","p1-canceled"]]')
      await mount(legacyProps(three(), { controlKey: 'viewlet', getCategoryGroup: (state: string) => state }))
      expect(controls()?.canMergeByGroup).toBe(false)
    })
  })

  it('leaves the merged columns of another board under the same key alone', async () => {
    localStorage.setItem('kanban-column-merged-viewlet-status', '[["p1-done","p1-canceled"]]')
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    const groupOf: Record<string, string> = { todo: 'open', doing: 'open', done: 'closed' }
    await mount(legacyProps(groups, { controlKey: 'viewlet', getCategoryGroup: (state: string) => groupOf[state] }))
    expect(get(columnControlStore).get('viewlet')?.merged).toBe(false)

    get(columnControlStore).get('viewlet')?.mergeByGroup()
    await settle()
    expect(get(columnControlStore).get('viewlet')?.merged).toBe(true)
    expect(localStorage.getItem('kanban-column-merged-viewlet-status')).toBe(
      '[["p1-done","p1-canceled"],["todo","doing"]]'
    )

    get(columnControlStore).get('viewlet')?.resetMerge()
    await settle()
    expect(localStorage.getItem('kanban-column-merged-viewlet-status')).toBe('[["p1-done","p1-canceled"]]')
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

  it('keeps the open status of a group open when merging by group and its first status is collapsed', async () => {
    localStorage.setItem('kanban-column-collapsed-viewlet-status', '["todo"]')
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    const groupOf: Record<string, string> = { todo: 'open', doing: 'open', done: 'closed' }
    await mount(legacyProps(groups, { controlKey: 'viewlet', getCategoryGroup: (state: string) => groupOf[state] }))
    await flush()

    get(columnControlStore).get('viewlet')?.mergeByGroup()
    await settle()

    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['todo', 'done'])
    expect(q('[data-id="kanban-collapsed-column"]')).toHaveLength(0)
  })

  it('keeps a collapsed merged group collapsed when merging by group again', async () => {
    localStorage.setItem('kanban-column-merged-viewlet-status', '[["todo","doing"]]')
    localStorage.setItem('kanban-column-collapsed-viewlet-status', '["todo"]')
    const groups = board({ todo: cards('t', 1, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    const groupOf: Record<string, string> = { todo: 'open', doing: 'open', done: 'closed' }
    await mount(legacyProps(groups, { controlKey: 'viewlet', getCategoryGroup: (state: string) => groupOf[state] }))
    await flush()

    get(columnControlStore).get('viewlet')?.mergeByGroup()
    await settle()

    expect(q('[data-id="kanban-column"]').map((e) => e.dataset.state)).toEqual(['done'])
    expect(q('[data-id="kanban-collapsed-column"]').map((e) => e.dataset.state)).toEqual(['todo'])
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

    const older = { resetMerge: vi.fn(), mergeByGroup: vi.fn(), canMergeByGroup: false, merged: false }
    const newer = { resetMerge: vi.fn(), mergeByGroup: vi.fn(), canMergeByGroup: false, merged: false }
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

  it('does not reorder a dragged card among the cards of another status of its merged column', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), doing: cards('d', 1, 'doing'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('todo', 'doing')
    await flush()

    fire(cardEl('d00'), 'dragstart')
    await settle()
    fire(cardEl('t00'), 'dragover')
    await settle()

    expect(groups.todo.map((c) => c._id)).toEqual(['t00', 't01'])
  })

  it('puts a card back into its merged column when the drag returns there', async () => {
    const groups = board({ todo: cards('t', 2, 'todo'), doing: cards('d', 2, 'doing'), done: cards('x', 1, 'done') })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('todo', 'doing')
    await flush()

    fire(cardEl('d00'), 'dragstart')
    await settle()
    fire(column('done'), 'dragover')
    await settle()
    fire(column('todo'), 'dragover')
    fire(column('todo'), 'drop')
    fire(one('.kanban-container'), 'dragend')
    await settle()

    expect(cardIds(column('todo'))).toEqual(['t00', 't01', 'd00', 'd01'])
    expect(cardIds(column('done'))).toEqual(['x00'])
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it('puts a card back when its drop on a merged column is refused', async () => {
    const groups = board({
      todo: cards('t', 3, 'todo'),
      doing: cards('d', 1, 'doing'),
      done: cards('x', 1, 'done'),
      review: cards('r', 1, 'review')
    })
    await mount(legacyProps(groups, { controlKey: 'viewlet' }))
    await flush()
    await mergeInto('doing', 'done')
    await flush()

    fire(cardEl('t01'), 'dragstart')
    await settle()
    fire(column('review'), 'dragover')
    await settle()
    expect(cardIds(column('review'))).toEqual(['r00', 't01'])
    fire(column('doing'), 'drop')
    await settle()

    expect(cardIds(column('todo'))).toEqual(['t00', 't01', 't02'])
    expect(cardIds(column('review'))).toEqual(['r00'])
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
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

  it('re-queries the changed columns after the drop', async () => {
    await dragBoard()
    const before = fakeQueries.calls.length

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    expect(fakeQueries.calls).toHaveLength(before)
    fire(column('doing'), 'drop')
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

  it('puts the card back where it stood when the drag ends without a drop', async () => {
    const groups = await dragBoard()
    const todo = groups.todo.map((c) => c._id)
    const before = fakeQueries.calls.length

    fire(cardEl('t05'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    await settle()
    expect(groups.doing.map((c) => c._id)).toContain('t05')

    fire(one('.kanban-container'), 'dragend')
    await settle()

    expect(groups.todo.map((c) => c._id)).toEqual(todo)
    expect(groups.doing.map((c) => c._id)).not.toContain('t05')
    expect(cardIds(column('todo'))).toEqual(todo.slice(0, 10))
    expect(fakeQueries.calls).toHaveLength(before)
    expect(fakeClient.update).not.toHaveBeenCalled()
    expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
  })

  it('puts a card back when the drag that reordered it ends without a drop', async () => {
    const groups = await dragBoard()
    const todo = groups.todo.map((c) => c._id)

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(cardEl('t03'), 'dragover', 5)
    await settle()
    expect(groups.todo.findIndex((c) => c._id === 't00')).toBe(3)

    fire(one('.kanban-container'), 'dragend')
    await settle()

    expect(groups.todo.map((c) => c._id)).toEqual(todo)
  })

  it('does not rewrite the board when the drag ends where it began', async () => {
    const setGroupByValues = vi.fn((g: Record<string, Item[]>, c: string, items: Item[]) => {
      g[c] = items
    })
    await dragBoard({ setGroupByValues })

    fire(cardEl('t01'), 'dragstart')
    await settle()
    fire(column('todo'), 'dragover')
    fire(one('.kanban-container'), 'dragend')
    await settle()

    expect(setGroupByValues).not.toHaveBeenCalled()
  })

  it.each([
    ['column', () => column('doing')],
    ['card', () => cardEl('d03')]
  ])('keeps a card where its drop on a %s put it when the drag end comes later', async (_target, dropOn) => {
    const groups = await dragBoard()

    fire(cardEl('t00'), 'dragstart')
    await settle()
    fire(column('doing'), 'dragover')
    fire(cardEl('d03'), 'dragover', 5)
    fire(dropOn(), 'drop')
    await settle()
    window.dispatchEvent(new MouseEvent('mousemove'))
    await settle()

    expect(groups.todo.map((c) => c._id)).not.toContain('t00')
    expect(groups.doing.map((c) => c._id)).toContain('t00')
  })

  it('ends the drag on the first mouse move when its dragend never reaches the board', async () => {
    const groups = board({
      todo: cards('t', 2, 'todo'),
      doing: cards('d', 1, 'doing'),
      done: cards('x', 1, 'done'),
      review: cards('r', 1, 'review')
    })
    await mount(
      legacyProps(groups, { controlKey: 'viewlet', getAvailableCategories: async () => ['todo', 'doing', 'done'] })
    )
    await flush()
    one('[data-test="column-header"]', column('done')).click()
    await settle()
    const stack = one('[data-id="kanban-collapsed-stack"]')
    const source = cardEl('t00')
    const moveMouse = (): void => {
      window.dispatchEvent(new MouseEvent('mousemove'))
    }

    fire(source, 'dragstart')
    await settle()
    // Firefox sends a mouse move right after dragstart, before the drag is under way.
    moveMouse()
    await settle()
    expect(column('doing').classList.contains('drop-allowed')).toBe(true)

    fire(column('doing'), 'dragover')
    await settle()
    expect(source.isConnected).toBe(false)
    expect(column('review').classList.contains('drop-disabled')).toBe(true)
    expect(stack.classList.contains('dragging')).toBe(true)

    moveMouse()
    await settle()

    expect(q('.drop-allowed, .drop-disabled').map((e) => e.dataset.state)).toEqual([])
    expect(stack.classList.contains('dragging')).toBe(false)
    expect(cardIds(column('todo'))).toEqual(['t00', 't01'])
    expect(cardIds(column('doing'))).toEqual(['d00'])
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

  it('removes its window listener when the drag ends and when the board is destroyed', async () => {
    await dragBoard()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const mouseCalls = (spy: typeof add): unknown[][] => spy.mock.calls.filter(([type]) => type === 'mousemove')

    fire(cardEl('t00'), 'dragstart')
    fire(column('doing'), 'dragover')
    fire(one('.kanban-container'), 'dragend')
    await settle()
    fire(cardEl('t01'), 'dragstart')
    fire(column('doing'), 'dragover')
    await settle()
    mounted.forEach((c) => {
      c.$destroy()
    })
    mounted = []

    expect(mouseCalls(add)).toHaveLength(2)
    expect(mouseCalls(remove)).toEqual(mouseCalls(add))
    for (const type of ['drop', 'dragend']) {
      const added = add.mock.calls.filter(([event]) => event === type)
      const removed = remove.mock.calls.filter(([event]) => event === type)
      expect(added).toHaveLength(2)
      expect(removed).toEqual(added)
      expect(added.every((call) => call[2] === true)).toBe(true)
    }
    add.mockRestore()
    remove.mockRestore()
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

    it('shows full-form spots in a swim lane cell and stands the card in the hovered one', async () => {
      await dragBoard({ dropTargets: new Map([['done', [{ id: 'x' }, { id: 'y' }]]]) })

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cell('A', 'done'), 'dragover')
      await settle()
      // The spots show: the card is out of the cell's card list, in a spot only when aimed at.
      const slot = one('[data-drop-target="x"]', cell('A', 'done'))
      expect(cardIds(cell('A', 'done'))).not.toContain('a1')
      expect(q('[data-test="card-body"]', slot)).toHaveLength(0)

      fire(slot, 'dragover')
      await settle()
      // The card stands in the spot and stays out of the cell's card list.
      expect(q('[data-test="card-body"]', slot).map((e) => e.textContent)).toEqual(['a1'])
      expect(cardIds(cell('A', 'done'))).not.toContain('a1')
    })

    it('keeps a card in its lane when the other lane has no update for it', async () => {
      await dragBoard({ getSwimLaneUpdateProps: () => undefined })

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cell('B', 'done'), 'dragover')
      await settle()
      expect(cardIds(cell('B', 'done'))).not.toContain('a1')
      fire(cell('B', 'done'), 'drop')
      await settle()

      expect(fakeClient.update).not.toHaveBeenCalled()
      expect(fakeClient.diffUpdate).not.toHaveBeenCalled()
    })

    it('moves a card between columns of its lane when the other lanes have no update for it', async () => {
      await dragBoard({ getSwimLaneUpdateProps: () => undefined })

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cell('A', 'done'), 'dragover')
      await settle()
      fire(cell('A', 'done'), 'drop')
      await settle()

      expect(fakeClient.update).toHaveBeenCalledTimes(1)
      const [, update] = fakeClient.update.mock.calls[0] as [Card, Record<string, string>]
      expect(update.status).toBe('done')
      expect(update).not.toHaveProperty('lane')
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

    it('shows a card where the data puts it after a drop whose dragend never reached the board', async () => {
      const groups = board({
        todo: [card('a1', 'todo', 'A'), card('a2', 'todo', 'A'), card('b1', 'todo', 'B')],
        done: [card('b2', 'done', 'B')]
      })
      const component = await mount(swimProps(groups, lanes))
      await flush()
      const source = cardEl('a1')

      fire(source, 'dragstart')
      await settle()
      fire(cell('B', 'todo'), 'dragover')
      await settle()
      // The card left its cell, so its dragend would go to a node that is no longer in the board.
      expect(source.isConnected).toBe(false)
      fire(cardEl('b1'), 'drop')
      await settle()
      expect(fakeClient.update).toHaveBeenCalledTimes(1)
      window.dispatchEvent(new MouseEvent('mousemove'))
      await settle()

      const moved = { ...groups.todo[0], status: 'done' } as unknown as Card
      docs.set('a1', moved)
      const next = board({ todo: [groups.todo[1], groups.todo[2]], done: [moved, groups.done[0]] })
      component.$set({ groupByDocs: next, objects: Object.values(next).flat() })
      await settle()
      await flush()

      expect(cardIds(cell('A', 'done'))).toEqual(['a1'])
      expect(cardIds(cell('B', 'todo'))).toEqual(['b1'])
    })

    it('leaves the board data alone when a drag ends without a drop', async () => {
      const groups = board({
        todo: [card('a1', 'todo', 'A'), card('a2', 'todo', 'A'), card('b1', 'todo', 'B')],
        done: [card('b2', 'done', 'B')]
      })
      const component = await mount(swimProps(groups, lanes))
      await flush()

      fire(cardEl('a2'), 'dragstart')
      await settle()
      // a1 leaves todo while a2 is dragged, so a2 changes its index there.
      const next = board({ todo: [groups.todo[1], groups.todo[2]], done: [groups.todo[0], groups.done[0]] })
      component.$set({ groupByDocs: next })
      await settle()
      fire(one('.kanban-container'), 'dragend')
      await settle()

      expect(next.todo.map((c) => c._id)).toEqual(['a2', 'b1'])
    })

    it('sends the lane update of a card drop even when the drag ends while the first update is pending', async () => {
      await dragBoard()
      let finish = (): void => {}
      fakeClient.diffUpdate.mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            finish = () => {
              resolve({})
            }
          })
      )

      fire(cardEl('a1'), 'dragstart')
      await settle()
      fire(cell('B', 'todo'), 'dragover')
      await settle()
      fire(cardEl('b1'), 'drop')
      window.dispatchEvent(new MouseEvent('mousemove'))
      finish()
      await settle()

      expect(fakeClient.update).toHaveBeenCalledTimes(1)
      const [target, update] = fakeClient.update.mock.calls[0] as [Card | undefined, { lane: string }]
      expect(target?._id).toBe('a1')
      expect(update.lane).toBe('B')
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

describe('Kanban WIP limit in swim lane mode', () => {
  const states = ['s0', 's1', 's2', 's3', 's4']
  const laneIds = Array.from({ length: 12 }, (_, i) => `L${i}`)

  function laneBoard (): Record<string, Card[]> {
    const groups: Record<string, Card[]> = {}
    states.forEach((s, si) => {
      groups[s] = laneIds.flatMap((l) => cards(`${s}${l}-`, 10 + si, s, l))
    })
    return groups
  }

  it('reads the card count of a column once per column, not once per cell', async () => {
    const groups = laneBoard()
    const reads = vi.fn((g: Record<string, Item[]>, c: string) => g[c])
    const overLimit = vi.fn((_state: string, count: number) => count > 150)
    const props = swimProps(groups, laneIds.map(lane), { getGroupByValues: reads })

    await mount(props)
    await flush()
    const baseline = reads.mock.calls.length
    mounted.forEach((c) => {
      c.$destroy()
    })
    mounted = []
    parent.innerHTML = ''
    reads.mockClear()

    await mount({ ...props, overLimit })
    await flush()

    // Column s1 has 12 * 11 = 132 cards, s2 144, s3 156, s4 168: only s3 and s4 are over 150.
    const red = q('[data-id="kanban-swimlane-cell"].over-limit').map((e) => e.dataset.state)
    expect(new Set(red)).toEqual(new Set(['s3', 's4']))
    expect(red).toHaveLength(laneIds.length * 2)
    expect(overLimit).toHaveBeenCalledWith('s4', 168)
    expect(overLimit).toHaveBeenCalledWith('s0', 120)
    // The check may add one read per column, a recount per cell adds one per cell (60) per render.
    const extra = reads.mock.calls.length - baseline
    expect(extra).toBeLessThanOrEqual(states.length * 2)
  })
})

describe('Kanban card modern mode', () => {
  it('marks the card container modern only in modern mode, so the scoped styles can tell the modes apart', async () => {
    await mount(legacyProps(board({ todo: cards('m', 2, 'todo') }), { modern: true }))
    await flush()
    expect(q('.card-container.modern').length).toBeGreaterThan(0)

    document.body.innerHTML = ''
    parent = document.createElement('div')
    document.body.appendChild(parent)
    await mount(legacyProps(board({ todo: cards('n', 2, 'todo') })))
    await flush()
    expect(cardEls().length).toBeGreaterThan(0)
    expect(q('.card-container.modern')).toHaveLength(0)
  })
})

describe('Kanban card click gestures', () => {
  let body: HTMLElement
  let open: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    await mount(legacyProps(board({ todo: cards('gesture', 1, 'todo') })))
    await flush()
    body = one('[data-test="card-body"]', cardEl('gesture00'))
    open = vi.fn()
    body.addEventListener('click', open)
  })

  function gesture (target: Element, type: string, timeStamp: number, options: MouseEventInit = {}): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1, ...options })
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    target.dispatchEvent(event)
    return event
  }

  it('opens on a short click but intercepts a held click before its child handler', () => {
    gesture(body, 'pointerdown', 100)
    gesture(body, 'pointerup', 150)
    expect(gesture(body, 'click', 150).defaultPrevented).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)

    gesture(body, 'pointerdown', 200)
    gesture(body, 'pointerup', 700)
    expect(gesture(body, 'click', 700).defaultPrevented).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)

    gesture(body, 'pointerdown', 800)
    gesture(body, 'click', 850)
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('ignores the click after a native drag, including its pointer cancellation', () => {
    gesture(body, 'pointerdown', 100)
    fire(cardEl('gesture00'), 'dragstart')
    gesture(body, 'pointercancel', 150)
    fire(cardEl('gesture00'), 'dragend')
    expect(gesture(body, 'click', 200).defaultPrevented).toBe(true)
    expect(open).not.toHaveBeenCalled()

    gesture(body, 'pointerdown', 300)
    gesture(body, 'click', 350)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('keeps keyboard activation after a held pointer gesture', () => {
    gesture(body, 'pointerdown', 100)
    expect(gesture(body, 'click', 700, { detail: 0 }).defaultPrevented).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('does not retain a cancelled pointer hold', () => {
    gesture(body, 'pointerdown', 100)
    gesture(body, 'pointercancel', 150)
    expect(gesture(body, 'click', 700).defaultPrevented).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('does not intercept secondary buttons', () => {
    gesture(body, 'pointerdown', 100, { button: 2 })
    expect(gesture(body, 'click', 700, { button: 2 }).defaultPrevented).toBe(false)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('keeps held clicks on interactive child controls', () => {
    const button = document.createElement('button')
    body.appendChild(button)
    const action = vi.fn()
    button.addEventListener('click', action)
    gesture(button, 'pointerdown', 100)
    expect(gesture(button, 'click', 700).defaultPrevented).toBe(false)
    expect(action).toHaveBeenCalledTimes(1)
  })
})
