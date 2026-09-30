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

import { tick } from 'svelte'
import { describe, expect, it } from 'vitest'
import Timeline from '../components/Timeline.svelte'
import type { TimelineRow } from '../types'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 0, 15).getTime()

describe('Timeline rows added on the fly', () => {
  it('renders rows appended after mount (drag placeholders)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const bar = { startDate: NOW + DAY, targetDate: NOW + 3 * DAY }
    const lines: TimelineRow[] = [{ items: [bar] }]
    const component = new Timeline({ target: host, props: { currentTime: NOW, lines, editable: true } })
    await tick()
    component.$set({ lines: [...lines, { items: [], droppable: true }, { items: [bar], droppable: true }] })
    await tick()
    expect(host.querySelectorAll('.listGrid').length).toBe(3)
    component.$destroy()
    host.remove()
  })
})
