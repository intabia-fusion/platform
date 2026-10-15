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

import { DocManager, type Doc, type Ref, type Space } from '@hcengineering/core'
import type { SwimLane } from '@hcengineering/kanban'
import { type Component, IssuePriority } from '@hcengineering/tracker'
import tracker from '../plugin'
import {
  buildSwimLanes,
  normalizeSwimValue,
  orderSwimLanes,
  sortSwimLanes,
  swimLaneUpdateProps,
  UNASSIGNED_SWIM
} from '../swimLanes'
import { issuePriorities } from '../types'

interface Lane {
  _id: string
  title: string
  value: unknown
}

const lane = (_id: string, title = ''): Lane => ({ _id, title, value: _id })
const byTitleOrId = (l: Lane): string => (l.title !== '' ? l.title : l._id)

describe('orderSwimLanes', () => {
  it('follows the sorted values and puts the rest after them by the fallback key', () => {
    const lanes = [lane('done'), lane('todo'), lane('zzz-orphan'), lane('in-progress'), lane('aaa-orphan')]
    const sorted = ['todo', 'in-progress', 'done']
    expect(orderSwimLanes(lanes, sorted, byTitleOrId).map((l) => l._id)).toEqual([
      'todo',
      'in-progress',
      'done',
      'aaa-orphan',
      'zzz-orphan'
    ])
  })

  it('uses only the fallback key when the field has no sort function', () => {
    const lanes = [lane('c-ref', 'Chat'), lane('a-ref', 'Web'), lane('b-ref', 'Api')]
    expect(orderSwimLanes(lanes, undefined, byTitleOrId).map((l) => l.title)).toEqual(['Api', 'Chat', 'Web'])
  })

  it('does not mutate the input', () => {
    const lanes = [lane('b'), lane('a')]
    orderSwimLanes(lanes, ['a', 'b'], byTitleOrId)
    expect(lanes.map((l) => l._id)).toEqual(['b', 'a'])
  })
})

const component = (_id: string, label: string, space: string): Component =>
  ({ _id: _id as Ref<Component>, label, space: space as Ref<Space> }) as unknown as Component
// Two projects with their own "Chat" component, one with "Web".
const components = new DocManager<Component>([
  component('chat-1', 'Chat', 'p1'),
  component('chat-2', ' chat ', 'p2'),
  component('web-1', 'Web', 'p1')
])
const task = (fields: Record<string, unknown>): Doc => ({ _id: 't', space: 'p1', ...fields }) as unknown as Doc
const swim = (_id: string, value: unknown): SwimLane => ({ _id, title: '', value })

describe('normalizeSwimValue', () => {
  it('puts empty values and the no-parent marker into the empty lane', () => {
    expect(normalizeSwimValue('assignee', null, components)).toEqual({ key: UNASSIGNED_SWIM, value: null, empty: true })
    expect(normalizeSwimValue('assignee', undefined, components).key).toBe(UNASSIGNED_SWIM)
    expect(normalizeSwimValue('attachedTo', tracker.ids.NoParent, components)).toEqual({
      key: UNASSIGNED_SWIM,
      value: tracker.ids.NoParent,
      empty: true
    })
  })

  it('keeps the no-parent marker as a value for other fields', () => {
    expect(normalizeSwimValue('assignee', tracker.ids.NoParent, components).empty).toBe(false)
  })

  it('groups components of different projects by their trimmed, case-folded label', () => {
    const a = normalizeSwimValue('component', 'chat-1', components)
    const b = normalizeSwimValue('component', 'chat-2', components)
    expect(a.key).toBe('component:chat')
    expect(b.key).toBe(a.key)
    expect(a.title).toBe('Chat')
    expect(a.value).toBe('chat-1')
  })

  it('keys an unknown component by its id', () => {
    expect(normalizeSwimValue('component', 'gone', components)).toEqual({ key: 'gone', value: 'gone', empty: false })
  })

  it('keys scalars by their string and other values by JSON', () => {
    expect(normalizeSwimValue('priority', 2, components).key).toBe('2')
    expect(normalizeSwimValue('flag', false, components).key).toBe('false')
    expect(normalizeSwimValue('labels', ['a', 'b'], components).key).toBe('["a","b"]')
  })
})

describe('buildSwimLanes', () => {
  it('returns no lanes without a field', () => {
    expect(buildSwimLanes('none', [task({ assignee: 'u1' })], components, 'Empty')).toEqual([])
    expect(buildSwimLanes('', [task({ assignee: 'u1' })], components, 'Empty')).toEqual([])
  })

  it('makes one lane per value and puts the empty lane first with the empty label', () => {
    const tasks = [
      task({ assignee: 'u2' }),
      task({ assignee: null }),
      task({ assignee: 'u1' }),
      task({ assignee: 'u2' })
    ]
    const lanes = buildSwimLanes('assignee', tasks, components, 'No assignee')
    expect(lanes.map((l) => l._id)).toEqual([UNASSIGNED_SWIM, 'u2', 'u1'])
    expect(lanes[0].title).toBe('No assignee')
    expect(lanes[1].title).toBe('')
  })

  it('makes one component lane for same-label components of different projects', () => {
    const tasks = [task({ component: 'chat-1' }), task({ component: 'chat-2' }), task({ component: 'web-1' })]
    const lanes = buildSwimLanes('component', tasks, components, '')
    expect(lanes.map((l) => [l._id, l.title, l.value])).toEqual([
      ['component:chat', 'Chat', 'chat-1'],
      ['component:web', 'Web', 'web-1']
    ])
  })

  it('keeps every priority lane, even without tasks, with its icon', () => {
    const lanes = buildSwimLanes('priority', [task({ priority: IssuePriority.High })], components, '')
    expect(new Set(lanes.map((l) => l.value))).toEqual(
      new Set([
        IssuePriority.NoPriority,
        IssuePriority.Urgent,
        IssuePriority.High,
        IssuePriority.Medium,
        IssuePriority.Low
      ])
    )
    expect(lanes).toHaveLength(5)
    for (const l of lanes) expect(l.icon).toBe(issuePriorities[l.value as IssuePriority].icon)
  })

  it('reads nested values by path', () => {
    const lanes = buildSwimLanes('$lookup.space.name', [task({ $lookup: { space: { name: 'P' } } })], components, '')
    expect(lanes.map((l) => l._id)).toEqual(['P'])
  })
})

describe('sortSwimLanes', () => {
  const byId = (l: SwimLane): string => l._id
  const lanes = [swim('c', 'c'), swim(UNASSIGNED_SWIM, null), swim('a', 'a'), swim('b', 'b')]

  it('keeps the empty lane first and follows the sort', async () => {
    const sorted = await sortSwimLanes(lanes, async (values) => [...values].reverse(), byId)
    expect(sorted.map(byId)).toEqual([UNASSIGNED_SWIM, 'b', 'a', 'c'])
  })

  it('falls back to the fallback key when the field has no sort', async () => {
    const sorted = await sortSwimLanes(lanes, async () => undefined, byId)
    expect(sorted.map(byId)).toEqual([UNASSIGNED_SWIM, 'a', 'b', 'c'])
  })

  // A rejected sort used to leave the board with no lanes, and the board then loads no cards.
  it('falls back to the fallback key when the sort fails, and logs the error', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('sort failed')
    const sorted = await sortSwimLanes(lanes, async () => await Promise.reject(error), byId)
    expect(sorted.map(byId)).toEqual([UNASSIGNED_SWIM, 'a', 'b', 'c'])
    expect(log).toHaveBeenCalledWith('Swim lane sort failed', error)
    log.mockRestore()
  })

  it('does not ask the sort for a single lane', async () => {
    const sort = jest.fn(async (values: unknown[]) => values)
    const sorted = await sortSwimLanes([swim(UNASSIGNED_SWIM, null), swim('a', 'a')], sort, byId)
    expect(sort).not.toHaveBeenCalled()
    expect(sorted.map(byId)).toEqual([UNASSIGNED_SWIM, 'a'])
  })

  it('passes the lane values without the empty lane to the sort', async () => {
    const sort = jest.fn(async (values: unknown[]) => values)
    await sortSwimLanes(lanes, sort, byId)
    expect(sort).toHaveBeenCalledWith(['c', 'a', 'b'])
  })
})

describe('swimLaneUpdateProps', () => {
  const doc = task({ space: 'p2' })

  it('gives no update without a field or for the project', () => {
    expect(swimLaneUpdateProps('none', doc, swim('u1', 'u1'), components)).toBeUndefined()
    expect(swimLaneUpdateProps('', doc, swim('u1', 'u1'), components)).toBeUndefined()
    expect(swimLaneUpdateProps('space', doc, swim('p1', 'p1'), components)).toBeUndefined()
  })

  it('writes the lane value to the field', () => {
    expect(swimLaneUpdateProps('assignee', doc, swim('u1', 'u1'), components)).toEqual({ assignee: 'u1' })
    expect(swimLaneUpdateProps('assignee', doc, swim(UNASSIGNED_SWIM, null), components)).toEqual({ assignee: null })
  })

  it('sets the parent class together with the parent', () => {
    expect(swimLaneUpdateProps('attachedTo', doc, swim('i1', 'i1'), components)).toEqual({
      attachedTo: 'i1',
      attachedToClass: tracker.class.Issue
    })
  })

  it("picks the same-label component of the issue's project", () => {
    // The lane was built from p1's "Chat"; the issue lives in p2.
    expect(swimLaneUpdateProps('component', doc, swim('component:chat', 'chat-1'), components)).toEqual({
      component: 'chat-2'
    })
  })

  it("gives no update when the issue's project has no such component", () => {
    expect(swimLaneUpdateProps('component', doc, swim('component:web', 'web-1'), components)).toBeUndefined()
  })
})
