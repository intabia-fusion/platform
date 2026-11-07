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

import { tick } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { fakeQueries } from './fakePresentation'
import { controllerFixture } from './kanbanFixture'
import Harness from './KanbanHarness.svelte'

vi.mock('@hcengineering/presentation', async () => await import('./fakePresentation'))

function fire (target: Element, type: string): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    clientX: { value: 150 },
    clientY: { value: 175 },
    offsetY: { value: 75 },
    dataTransfer: { value: null }
  })
  target.dispatchEvent(event)
}

describe('mounted drag operation budgets', () => {
  it.each([10, 100])(
    'keeps 1000 flushed hovers free of mutations across %s columns x 20 visible cards',
    async (columns) => {
      const inputs = controllerFixture(columns, 20)
      const docs = new Map(inputs.objects.map((doc) => [doc._id, doc]))
      const writes = vi.fn(inputs.setGroupByValues)
      const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(77)
      const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
      const parent = document.createElement('div')
      document.body.append(parent)
      localStorage.setItem('#platform.lazy.loading', 'false')
      fakeQueries.calls.length = 0
      const component = new Harness({
        target: parent,
        props: {
          _class: 'test:Card',
          categories: inputs.categories,
          groupByKey: 'status',
          groupByDocs: inputs.groupByDocs,
          objects: inputs.objects,
          getGroupByValues: inputs.getGroupByValues,
          setGroupByValues: writes,
          getUpdateProps: inputs.getUpdateProps,
          limitScale: 2
        } as any
      })
      const mutations: MutationRecord[] = []
      const observer = new MutationObserver((records) => {
        mutations.push(...records)
      })
      try {
        await tick()
        fakeQueries.calls.forEach((call) => {
          call.callback(call.query._id.$in.map((id: string) => docs.get(id as any)))
        })
        await Promise.resolve()
        await tick()
        expect(parent.querySelectorAll('[data-id="kanban-card"]')).toHaveLength(columns * 20)
        const source = parent.querySelector<HTMLElement>('[data-card-id="column0-0"]') as HTMLElement
        const target = parent.querySelector<HTMLElement>('[data-card-id="column0-1"]') as HTMLElement
        target.getBoundingClientRect = () => new DOMRect(100, 100, 100, 100)
        fire(source, 'dragstart')
        await tick()
        fire(target, 'dragover')
        await tick()
        const queryCount = fakeQueries.calls.length
        observer.observe(parent, { childList: true, subtree: true, attributes: true, characterData: true })
        writes.mockClear()
        for (let index = 0; index < 1000; index++) {
          fire(target, 'dragover')
          await tick()
        }
        mutations.push(...observer.takeRecords())
        observer.disconnect()
        expect(mutations).toHaveLength(0)
        expect(writes).not.toHaveBeenCalled()
        expect(fakeQueries.calls).toHaveLength(queryCount)
        expect(frames).toHaveBeenCalledTimes(1)
        expect(parent.querySelector('[data-card-id="column0-0"]')).toBe(source)
        expect(parent.querySelector('[data-card-id="column0-1"]')).toBe(target)
        fire(source, 'dragend')
        await tick()
        expect(cancel).toHaveBeenCalledWith(77)
      } finally {
        observer.disconnect()
        component.$destroy()
        parent.remove()
        frames.mockRestore()
        cancel.mockRestore()
      }
    },
    15000
  )
})
