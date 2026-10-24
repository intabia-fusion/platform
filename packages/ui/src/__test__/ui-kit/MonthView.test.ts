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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import MonthView from '../../ui-kit/month-view/MonthView.svelte'
import YearView from '../../ui-kit/year-view/YearView.svelte'
import MonthViewWithDay from './MonthViewWithDay.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []
const october = new Date(2026, 9, 15).getTime()

function host (): HTMLElement {
  const element = document.createElement('div')
  target.appendChild(element)
  return element
}

function day (root: HTMLElement, date: Date): HTMLButtonElement {
  const key = date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate()
  return root.querySelector(`[data-key="${key}"]`) as HTMLButtonElement
}

describe('ui-kit MonthView', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('draws whole weeks with the days of the neighbour months marked outside', () => {
    const root = host()
    mounted.push(new MonthView({ target: root, props: { month: october } }))
    expect(root.querySelectorAll('.month-view__day')).toHaveLength(42)
    expect(root.querySelectorAll('[role="columnheader"]')).toHaveLength(7)
    expect(day(root, new Date(2026, 9, 1)).classList.contains('month-view__day--outside')).toBe(false)
    expect(root.querySelector('.month-view__day--outside')).not.toBeNull()
  })

  it('picks the clicked day and reports it at its start', async () => {
    const root = host()
    const component = new MonthView({ target: root, props: { month: october } })
    mounted.push(component)
    let picked: number | undefined
    component.$on('select', (event: CustomEvent<number>) => (picked = event.detail))
    day(root, new Date(2026, 9, 20)).click()
    await tick()
    expect(picked).toBe(new Date(2026, 9, 20).getTime())
    expect(day(root, new Date(2026, 9, 20)).classList.contains('month-view__day--selected')).toBe(true)
  })

  it('keeps one tab stop and moves it with the arrows, PageDown shows the next month', async () => {
    const root = host()
    const component = new MonthView({ target: root, props: { month: october, value: october } })
    mounted.push(component)
    let shown: number | undefined
    component.$on('navigate', (event: CustomEvent<number>) => (shown = event.detail))
    expect(root.querySelectorAll('.month-view__day[tabindex="0"]')).toHaveLength(1)
    const start = day(root, new Date(2026, 9, 15))
    expect(start.tabIndex).toBe(0)
    start.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await tick()
    await tick()
    expect(document.activeElement).toBe(day(root, new Date(2026, 9, 16)))
    day(root, new Date(2026, 9, 16)).dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))
    await tick()
    await tick()
    expect(shown).toBe(new Date(2026, 10, 1).getTime())
    expect(document.activeElement).toBe(day(root, new Date(2026, 10, 16)))
  })

  it('puts the place content of each day under its number', () => {
    const root = host()
    mounted.push(new MonthViewWithDay({ target: root, props: { props: { month: october, weeks: 5 } } }))
    expect(root.querySelectorAll('.month-view__content .content')).toHaveLength(35)
  })
})

describe('ui-kit YearView', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('shows twelve months without the year in their titles and marks days', () => {
    const root = host()
    mounted.push(new YearView({ target: root, props: { year: october, marked: (date: Date) => date.getDate() === 1 } }))
    const titles = [...root.querySelectorAll('.calendar__title')].map((it) => it.textContent ?? '')
    expect(titles).toHaveLength(12)
    expect(titles.some((it) => it.includes('2026'))).toBe(false)
    expect(root.querySelectorAll('.calendar__day--marked')).toHaveLength(12)
  })

  it('reports the clicked day', async () => {
    const root = host()
    const component = new YearView({ target: root, props: { year: october } })
    mounted.push(component)
    let picked: number | undefined
    component.$on('select', (event: CustomEvent<number>) => (picked = event.detail))
    const march = root.querySelectorAll('.calendar')[2]
    ;(march.querySelector('[data-day="8"]') as HTMLButtonElement).click()
    await tick()
    expect(new Date(picked ?? 0).getMonth()).toBe(2)
    expect(new Date(picked ?? 0).getDate()).toBe(8)
  })
})
