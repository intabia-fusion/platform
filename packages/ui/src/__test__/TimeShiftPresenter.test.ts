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
import type { ComponentProps } from 'svelte'
import TimeShiftPresenter from '../components/TimeShiftPresenter.svelte'
import ui from '../plugin'
import { DAY, HOUR, MINUTE } from '../types'

let target: HTMLElement

function mount (props: Partial<ComponentProps<TimeShiftPresenter>> = {}): { component: TimeShiftPresenter, span: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TimeShiftPresenter({ target: host, props: props as ComponentProps<TimeShiftPresenter> })
  return { component, span: host.querySelector('span') as HTMLElement }
}

describe('TimeShiftPresenter', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders an empty span until the async translation resolves', () => {
    const { span } = mount({ value: 30 * MINUTE })
    expect(span).not.toBeNull()
    expect(span.textContent).toBe('')
  })

  it('shows MinutesAfter for positive values under an hour', async () => {
    const { span } = mount({ value: 30 * MINUTE })
    await vi.waitFor(() => expect(span.textContent).toBe(ui.string.MinutesAfter))
  })

  it('shows HoursAfter for values between an hour and a day', async () => {
    const { span } = mount({ value: 5 * HOUR })
    await vi.waitFor(() => expect(span.textContent).toBe(ui.string.HoursAfter))
  })

  it('shows DaysAfter for values of a day or more', async () => {
    const { span } = mount({ value: 3 * DAY })
    await vi.waitFor(() => expect(span.textContent).toBe(ui.string.DaysAfter))
  })

  it('shows the Before variants for negative values', async () => {
    const mins = mount({ value: -30 * MINUTE })
    await vi.waitFor(() => expect(mins.span.textContent).toBe(ui.string.MinutesBefore))
    mins.component.$destroy()

    const hours = mount({ value: -5 * HOUR })
    await vi.waitFor(() => expect(hours.span.textContent).toBe(ui.string.HoursBefore))
    hours.component.$destroy()

    const days = mount({ value: -3 * DAY })
    await vi.waitFor(() => expect(days.span.textContent).toBe(ui.string.DaysBefore))
    days.component.$destroy()
  })

  it('treats exactly one hour as hours, not minutes', async () => {
    const { span } = mount({ value: HOUR })
    await vi.waitFor(() => expect(span.textContent).toBe(ui.string.HoursAfter))
  })

  it('composes days, hours and minutes when exact is set', async () => {
    const { span } = mount({ value: 2 * DAY + 3 * HOUR + 15 * MINUTE, exact: true })
    await vi.waitFor(() =>
      expect(span.textContent).toBe(`${ui.string.DaysShort} ${ui.string.HoursShort} ${ui.string.MinutesShort}`)
    )
  })

  it('omits zero parts in exact mode', async () => {
    const { span } = mount({ value: 2 * DAY, exact: true })
    await vi.waitFor(() => expect(span.textContent).toBe(ui.string.DaysShort))
  })

  it('re-renders when value changes', async () => {
    const { component, span } = mount({ value: 30 * MINUTE })
    await vi.waitFor(() => expect(span.textContent).toBe(ui.string.MinutesAfter))
    component.$set({ value: 2 * HOUR })
    await vi.waitFor(() => expect(span.textContent).toBe(ui.string.HoursAfter))
  })
})
