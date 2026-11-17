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

import { AggregateValue } from '@hcengineering/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KanbanController } from '../kanbanController'
import type { CardDragEvent } from '../types'
import { controllerFixture } from './kanbanFixture'

vi.mock('@hcengineering/presentation', async () => await import('./fakePresentation'))
afterEach(() => {
  vi.restoreAllMocks()
})

const hover = (target: HTMLElement, x: number, y: number): CardDragEvent =>
  ({
    target,
    clientX: x,
    clientY: y,
    offsetY: 75,
    preventDefault: vi.fn()
  }) as unknown as CardDragEvent

describe('deterministic drag operation budgets', () => {
  it('keeps the shifted origin fixed while a manual reorder moves the source card', async () => {
    const inputs = controllerFixture(1, 2)
    inputs.dropTargets = new Map([['column0', [{ id: 'column0' }]]])
    const scroller = document.createElement('div')
    const cell = document.createElement('div')
    cell.dataset.state = 'column0'
    const spots = document.createElement('div')
    spots.dataset.id = 'kanban-drop-targets'
    const source = document.createElement('div')
    source.dataset.cardId = inputs.objects[0]._id
    cell.append(spots, source)
    scroller.append(cell)
    inputs.scrollerEl = scroller
    const measure = vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    const controller = new KanbanController(inputs)
    try {
      await controller.onDragStart(inputs.objects[0], 'column0')
      controller.handleDragMove(hover(scroller, 400, 500))
      measure.mockReturnValue(new DOMRect(100, 260, 200, 100))
      controller.handleDragMove(hover(scroller, 400, 500))
      const neighbor = document.createElement('div')
      vi.spyOn(neighbor, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 380, 200, 100))
      neighbor.dataset.cardId = inputs.objects[1]._id
      controller.cardDragOver(hover(neighbor, 110, 460), inputs.objects[1], 'column0')
      expect(controller.state.dragCardTargetIndex).toBe(1)
      measure.mockReturnValue(new DOMRect(100, 380, 200, 100))
      controller.handleDragMove(hover(source, 110, 460))
      expect(controller.state.atInitialPlace).toBe(false)
      expect(controller.state.dragCardTargetIndex).toBe(1)
      controller.handleDragMove(hover(cell, 110, 300))
      expect(controller.state.atInitialPlace).toBe(true)
      expect(controller.state.dragCardTargetIndex).toBeUndefined()
      expect(controller.state.groupByDocs.column0).toEqual(inputs.objects)
    } finally {
      controller.destroy()
    }
  })

  it.each([false, true])('keeps a reorder when returning from another column, swim lanes: %s', async (swim) => {
    const inputs = controllerFixture(2, 3)
    const lane = { _id: 'A', title: 'A', value: 'A' }
    inputs.swimLaneMode = swim
    inputs.swimLanes = swim ? [lane] : []
    inputs.getSwimLaneOfDoc = () => lane._id
    inputs.dropTargets = new Map([['column0', [{ id: 'column0' }]]])
    const controller = new KanbanController(inputs)
    const target = document.createElement('div')
    target.dataset.cardId = inputs.objects[2]._id
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 300, 200, 100))
    try {
      await controller.onDragStart(inputs.objects[0], 'column0', swim ? lane : undefined)
      controller.panelDragOver(undefined, 'column1', swim ? lane : undefined)
      controller.cardDragOver(hover(target, 150, 390), inputs.objects[2], 'column0', swim ? lane : undefined)
      controller.panelDragOver(undefined, 'column0', swim ? lane : undefined)
      expect(controller.state.dragCardTargetIndex).toBe(2)
      expect(controller.state.dragCardState).toBe('column0')
    } finally {
      controller.destroy()
    }
  })

  it('keeps descending board cards in their original lane when visiting another column', async () => {
    const inputs = controllerFixture(2, 2)
    const lane = { _id: 'A', title: 'A', value: 'A' }
    inputs.swimLanes = [lane]
    inputs.swimLaneMode = true
    inputs.getSwimLaneOfDoc = () => lane._id
    inputs.dontUpdateRank = true
    inputs.orderBy = ['modifiedOn', -1]
    inputs.dropTargets = new Map([
      ['column0', [{ id: 'column0' }]],
      ['column1', [{ id: 'column1' }]]
    ])
    const controller = new KanbanController(inputs)
    try {
      await controller.onDragStart(inputs.objects[0], 'column0', lane)
      controller.panelDragOver(undefined, 'column1', lane)
      expect(controller.state.dragCardTargetIndex).toBeUndefined()
      expect(
        controller.getSwimLaneCategoryValues(
          lane,
          'column0',
          controller.state.groupByDocs,
          controller.state.dragCard,
          controller.state.dragCardCurrentSwimLane,
          controller.state.dragCardState,
          controller.state.dragCardTargetIndex
        )
      ).toEqual(inputs.groupByDocs.column0)
    } finally {
      controller.destroy()
    }
  })

  it.each([
    [10, 20],
    [100, 200]
  ])('keeps 1000 unchanged hovers local on %s columns x %s cards', async (columns, count) => {
    const inputs = controllerFixture(columns, count)
    const publish = vi.fn()
    const controller = new KanbanController(inputs, publish)
    const state = controller.state
    const notifications = vi.fn()
    const unsubscribe = Object.values(controller.view).map((store) => store.subscribe(notifications))
    const reads = vi.spyOn(state, 'getGroupByValues')
    const writes = vi.spyOn(state, 'setGroupByValues')
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    const target = document.createElement('div')
    target.dataset.cardId = state.groupByDocs.column0[1]._id
    Object.defineProperty(target, 'offsetHeight', { value: 100 })
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 100, 100))
    const event = hover(target, 150, 175)
    const card = state.groupByDocs.column0[0]
    const neighbor = state.groupByDocs.column0[1]
    await controller.onDragStart(card, 'column0')
    controller.handleDragMove(event)
    controller.cardDragOver(event, neighbor, 'column0')
    const preview = state.groupByDocs.column0
    publish.mockClear()
    notifications.mockClear()
    reads.mockClear()
    writes.mockClear()
    for (let index = 0; index < 1000; index++) {
      controller.handleDragMove(event)
      controller.cardDragOver(event, neighbor, 'column0')
    }
    expect(state.groupByDocs.column0).toBe(preview)
    expect(writes).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
    expect(notifications).not.toHaveBeenCalled()
    expect(reads.mock.calls.length).toBeLessThanOrEqual(1000)
    expect(frames).toHaveBeenCalledTimes(1)
    controller.onDragEnd()
    expect(state.groupByDocs.column0[0]).toBe(card)
    expect(writes).toHaveBeenCalledTimes(2)
    expect(state.isDragging).toBe(false)
    controller.destroy()
    unsubscribe.forEach((stop) => {
      stop()
    })
  })

  it('keeps 1000 origin hovers free of queries, mutations, notifications and frames', async () => {
    const inputs = controllerFixture(100, 200)
    const scroller = document.createElement('div')
    const original = document.createElement('div')
    original.dataset.cardId = inputs.objects[0]._id
    scroller.append(original)
    vi.spyOn(original, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
    inputs.scrollerEl = scroller
    const publish = vi.fn()
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame')
    const controller = new KanbanController(inputs, publish)
    const state = controller.state
    const notifications = vi.fn()
    const unsubscribe = Object.values(controller.view).map((store) => store.subscribe(notifications))
    const writes = vi.spyOn(state, 'setGroupByValues')
    await controller.onDragStart(state.objects[0], 'column0')
    const event = hover(original, 104, 104)
    controller.handleDragMove(event)
    publish.mockClear()
    notifications.mockClear()
    for (let index = 0; index < 1000; index++) {
      controller.handleDragMove(event)
      controller.cardDragOver(event, state.objects[1], 'column0')
    }
    expect(publish).not.toHaveBeenCalled()
    expect(notifications).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
    expect(frames).not.toHaveBeenCalled()
    controller.destroy()
    unsubscribe.forEach((stop) => {
      stop()
    })
  })

  it('ends a gesture when its workflow lookup rejects', async () => {
    const inputs = controllerFixture(2, 2)
    inputs.getAvailableCategories = async () => {
      throw new Error('workflow unavailable')
    }
    const controller = new KanbanController(inputs)
    try {
      await expect(controller.onDragStart(inputs.objects[0], 'column0')).resolves.toBeUndefined()
      expect(controller.state.isDragging).toBe(false)
      expect(controller.state.dragCard).toBeUndefined()
    } finally {
      controller.destroy()
    }
  })

  it('rebuilds columns after a same-reference category array is mutated', () => {
    const inputs = controllerFixture(2, 2)
    const controller = new KanbanController(inputs)
    inputs.categories.push('added')
    controller.updateInputs(inputs)
    expect(controller.state.membersOf.has('added')).toBe(true)
    controller.destroy()
  })

  it('uses a replacement category object even when its key stays the same', () => {
    const inputs = controllerFixture(2, 2)
    const original = new AggregateValue('same', [])
    const replacement = new AggregateValue('same', [])
    inputs.categories = [original]
    inputs.getGroupByValues = (groups, state) => (state === original ? groups.column0 : groups.column1)
    const controller = new KanbanController(inputs)
    expect(controller.columnValues(inputs.groupByDocs, original, controller.state.membersOf)).toEqual(
      inputs.groupByDocs.column0
    )
    inputs.categories[0] = replacement
    controller.updateInputs(inputs)
    expect(controller.state.membersOf.get('same')?.[0]).toBe(replacement)
    expect(controller.columnValues(inputs.groupByDocs, replacement, controller.state.membersOf)).toEqual(
      inputs.groupByDocs.column1
    )
    controller.destroy()
  })

  it('does not republish column layout when only selection or card order changes', () => {
    const inputs = controllerFixture(2, 2)
    const controller = new KanbanController(inputs)
    const columns = vi.fn()
    const unsubscribe = controller.view.columns.subscribe(columns)
    columns.mockClear()
    controller.updateInputs({ ...inputs, selection: 1 })
    inputs.groupByDocs.column0.reverse()
    controller.updateInputs(inputs)
    expect(columns).not.toHaveBeenCalled()
    unsubscribe()
    controller.destroy()
  })

  it('preserves check and menu event order and updates the bound selection/checked props', async () => {
    const inputs = controllerFixture(2, 2)
    const dispatch = vi.fn(() => true)
    inputs.dispatch = dispatch
    inputs.checked = [inputs.objects[0]]
    const changes = vi.fn()
    const controller = new KanbanController(inputs, changes)
    controller.check(inputs.objects, true)
    expect(dispatch).toHaveBeenLastCalledWith('check', { docs: inputs.objects, value: true })
    dispatch.mockClear()
    const event = new MouseEvent('contextmenu')
    await controller.showMenu(event, inputs.objects[1])
    expect(changes).toHaveBeenNthCalledWith(1, { selection: 1 })
    expect(changes).toHaveBeenNthCalledWith(2, { checked: [] })
    expect(dispatch.mock.calls).toEqual([
      ['check', { docs: inputs.objects, value: false }],
      ['contextmenu', { evt: event, objects: inputs.objects[1] }]
    ])
    controller.destroy()
  })

  it('keeps the done-bar callback idle without a drag and writes the captured active card', async () => {
    const inputs = controllerFixture(2, 2)
    const controller = new KanbanController(inputs)
    const update = vi.spyOn(controller.state.client, 'update').mockResolvedValue({})
    update.mockClear()
    await controller.updateDone({ rank: 'done' })
    expect(update).not.toHaveBeenCalled()
    const card = inputs.objects[0]
    await controller.onDragStart(card, 'column0')
    const pending = controller.updateDone({ rank: 'done' })
    controller.onDragEnd()
    await pending
    expect(update).toHaveBeenCalledExactlyOnceWith(card, { rank: 'done' })
    expect(controller.state.isDragging).toBe(false)
    controller.destroy()
  })

  it.each([false, true])(
    'scrolls toward the top-left and ignores a late frame, unbound scroller: %s',
    async (unbind) => {
      const inputs = controllerFixture(2, 2)
      const scroller = document.createElement('div')
      scroller.getBoundingClientRect = () => new DOMRect(0, 0, 300, 300)
      scroller.scrollLeft = 100
      scroller.scrollTop = 100
      inputs.scrollerEl = scroller
      const callbacks: FrameRequestCallback[] = []
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
        callbacks.push(callback)
        return callbacks.length
      })
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
      const controller = new KanbanController(inputs)
      await controller.onDragStart(inputs.objects[0], 'column0')
      controller.handleDragMove(hover(scroller, 5, 5))
      callbacks[0](0)
      expect(scroller.scrollLeft).toBe(78)
      expect(scroller.scrollTop).toBe(78)
      expect(callbacks).toHaveLength(2)
      if (unbind) controller.updateInputs({ ...inputs, scrollerEl: undefined })
      else controller.onDragEnd()
      callbacks[1](16)
      expect(callbacks).toHaveLength(2)
      expect(scroller.scrollLeft).toBe(78)
      expect(scroller.scrollTop).toBe(78)
      controller.destroy()
    }
  )
  it.each([
    { left: 80, top: 200, x: 90, y: 175, oldX: 305, oldY: 175 },
    { left: 60, top: 250, x: 150, y: 75, oldX: 150, oldY: 175 },
    { left: 80, top: 250, x: 90, y: 75, oldX: 150, oldY: 175 }
  ])('tracks the original card through nested and outer scrolling: %j', async (offsets) => {
    const inputs = controllerFixture(2, 2)
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    const source = document.createElement('div')
    source.dataset.cardId = inputs.objects[0]._id
    const measure = vi.fn(() => new DOMRect(100, 100, 200, 100))
    source.getBoundingClientRect = measure
    outer.append(inner)
    inner.append(source)
    outer.scrollLeft = 60
    inner.scrollTop = 200
    inputs.scrollerEl = outer
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(77)
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    const controller = new KanbanController(inputs)
    try {
      await controller.onDragStart(inputs.objects[0], 'column0')
      outer.scrollLeft = offsets.left
      inner.scrollTop = offsets.top
      controller.handleDragMove(hover(inner, offsets.x, offsets.y))
      expect(controller.state.atInitialPlace).toBe(true)
      controller.handleDragMove(hover(inner, offsets.oldX, offsets.oldY))
      expect(controller.state.atInitialPlace).toBe(false)
      expect(measure).toHaveBeenCalledTimes(1)
    } finally {
      controller.destroy()
    }
  })
})
