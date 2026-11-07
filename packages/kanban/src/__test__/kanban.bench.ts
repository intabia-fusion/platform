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
import { tick } from 'svelte'
import { bench, describe, vi } from 'vitest'
import { laneCellValues, neighbourRanks } from '../board'
import { createLaneQueryController } from '../laneQueryController'
import { mergeLaneDocs, type LaneDocs } from '../laneQueries'
import type { DocWithRank, Item } from '../types'
import { fakeQueries } from './fakePresentation'
import { controllerFixture } from './kanbanFixture'
import Harness from './KanbanHarness.svelte'

vi.mock('@hcengineering/presentation', async () => await import('./fakePresentation'))
const options = { time: 200, warmupTime: 50, iterations: 10 }

const fixture = controllerFixture(100, 200)
const raw = fixture.groupByDocs.column0

describe('pure board operations', () => {
  bench(
    '1000 lane previews, 200 cards',
    () => {
      for (let index = 0; index < 1000; index++) {
        laneCellValues(raw, 'lane', 'column0', undefined, {
          card: raw[0],
          initialLane: 'lane',
          initialState: 'column0',
          lane: 'lane',
          state: 'column0',
          targetIndex: index % 200
        })
      }
    },
    options
  )
  bench(
    '1000 neighbour rank lookups, 200 cards',
    () => {
      for (let index = 0; index < 1000; index++) neighbourRanks(raw, raw[0]._id, index % 200)
    },
    options
  )
})

const lanes: LaneDocs[] = Array.from({ length: 100 }, (_, lane) => {
  const docs = Array.from(
    { length: 50 },
    (_, card) => ({ _id: `${lane}-${card}` as Ref<DocWithRank> }) as unknown as DocWithRank
  )
  return { ids: docs.map((doc) => doc._id), docs: new Map(docs.map((doc) => [doc._id, doc])), pending: false }
})

describe('100 lane answers x 50 documents', () => {
  bench(
    'eager board merge for each answer',
    () => {
      let previous = new Map<Ref<DocWithRank>, DocWithRank>()
      for (let index = 0; index < lanes.length; index++) previous = mergeLaneDocs(lanes.slice(0, index + 1), previous)
    },
    options
  )
  bench(
    'one reduceCalls merge for the burst',
    async () => {
      fakeQueries.calls.length = 0
      const controller = createLaneQueryController(() => {})
      controller.sync(new Map(lanes.map((lane, index) => [String(index), lane.ids])), 'test:Card' as any, undefined)
      fakeQueries.calls.forEach((call, index) => {
        call.callback([...lanes[index].docs.values()])
      })
      await Promise.resolve()
      await Promise.resolve()
      controller.destroy()
    },
    options
  )
})

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

for (const columns of [10, 100]) {
  describe(`mounted board ${columns} columns x 20 visible cards`, () => {
    let component: InstanceType<typeof Harness> | undefined
    let source: HTMLElement
    let target: HTMLElement
    bench(
      'drag, 60 flushed stable hovers, cancel',
      async () => {
        fire(source, 'dragstart')
        await tick()
        for (let index = 0; index < 60; index++) {
          fire(target, 'dragover')
          await tick()
        }
        fire(source, 'dragend')
        await tick()
      },
      {
        ...options,
        setup: async () => {
          component?.$destroy()
          document.body.innerHTML = ''
          fakeQueries.calls.length = 0
          localStorage.setItem('#platform.lazy.loading', 'false')
          const state = controllerFixture(columns, 20)
          const docs = new Map(state.objects.map((doc) => [doc._id, doc]))
          component = new Harness({
            target: document.body,
            props: {
              _class: 'test:Card',
              categories: state.categories,
              groupByKey: 'status',
              groupByDocs: state.groupByDocs,
              objects: state.objects,
              getGroupByValues: state.getGroupByValues,
              setGroupByValues: state.setGroupByValues,
              getUpdateProps: state.getUpdateProps,
              limitScale: 2
            } as any
          })
          await tick()
          fakeQueries.calls.forEach((call) => {
            call.callback(call.query._id.$in.map((id: Ref<Item>) => docs.get(id)).filter(Boolean))
          })
          await Promise.resolve()
          await tick()
          source = document.querySelector<HTMLElement>('[data-card-id="column0-0"]') as HTMLElement
          target = document.querySelector<HTMLElement>('[data-card-id="column0-1"]') as HTMLElement
          Object.defineProperty(target, 'offsetHeight', { configurable: true, value: 100 })
          target.getBoundingClientRect = () => new DOMRect(100, 100, 100, 100)
        },
        teardown: () => {
          component?.$destroy()
          component = undefined
        }
      }
    )
  })
}
