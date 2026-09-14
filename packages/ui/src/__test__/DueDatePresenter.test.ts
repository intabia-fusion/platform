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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DueDatePresenter from '../components/calendar/DueDatePresenter.svelte'
import ui from '../plugin'

const NOW = new Date('2026-01-15T18:00:00Z').getTime()
const TODAY_START = new Date(new Date(NOW).setHours(0, 0, 0, 0)).getTime()
const DAY = 1000 * 60 * 60 * 24

let target: HTMLElement

function mount (props: Record<string, unknown>): { host: HTMLElement, component: DueDatePresenter } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DueDatePresenter({ target: host, props: { onChange: vi.fn(), ...props } })
  return { host, component }
}

describe('DueDatePresenter', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
  })

  it('renders nothing when shouldRender is false, and carries width otherwise', () => {
    const hidden = mount({ shouldRender: false })
    expect(hidden.host.querySelector('.clear-mins')).toBeNull()
    hidden.component.$destroy()

    const shown = mount({ width: '12rem' })
    const wrapper = shown.host.querySelector('.clear-mins') as HTMLElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.width).toBe('12rem')
    shown.component.$destroy()
  })

  it('shows the DueDate label, not the generic NoDate label, with no value', () => {
    const { host, component } = mount({ value: null })
    expect(host.querySelector('.not-selected')?.textContent?.trim()).toBe(ui.string.DueDate)
    component.$destroy()
  })

  it('grades the icon normal, critical today, and a warning within a week', () => {
    const none = mount({ value: null })
    expect(none.host.querySelector('.btn-icon')?.classList.contains('normal')).toBe(true)
    none.component.$destroy()

    const dueToday = mount({ value: TODAY_START })
    expect(dueToday.host.querySelector('.btn-icon')?.classList.contains('critical')).toBe(true)
    dueToday.component.$destroy()

    const dueSoon = mount({ value: TODAY_START + 3 * DAY })
    expect(dueSoon.host.querySelector('.btn-icon')?.classList.contains('warning')).toBe(true)
    dueSoon.component.$destroy()
  })

  it('marks a past date overdue, unless shouldIgnoreOverdue suppresses it', () => {
    const overdue = mount({ value: TODAY_START - DAY })
    expect(overdue.host.querySelector('.btn-icon')?.classList.contains('overdue')).toBe(true)
    overdue.component.$destroy()

    const ignored = mount({ value: TODAY_START - DAY, shouldIgnoreOverdue: true })
    expect(ignored.host.querySelector('.btn-icon')?.classList.contains('normal')).toBe(true)
    ignored.component.$destroy()
  })

  it('forwards kind, size, editable and width to the inner date button', () => {
    const readOnly = mount({ kind: 'regular', size: 'large', editable: false, width: '8rem' })
    const readOnlyButton = readOnly.host.querySelector('button') as HTMLButtonElement
    expect(readOnlyButton.classList.contains('regular')).toBe(true)
    expect(readOnlyButton.classList.contains('large')).toBe(true)
    expect(readOnlyButton.classList.contains('editable')).toBe(false)
    expect(readOnlyButton.style.width).toBe('8rem')
    readOnly.component.$destroy()

    const editable = mount({ editable: true })
    expect((editable.host.querySelector('button') as HTMLButtonElement).classList.contains('editable')).toBe(true)
    editable.component.$destroy()
  })
})
