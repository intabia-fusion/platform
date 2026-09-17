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

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentProps } from 'svelte'
import TimeShiftPicker from '../components/TimeShiftPicker.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<TimeShiftPicker>> = {}): { component: TimeShiftPicker, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TimeShiftPicker({ target: host, props: props as ComponentProps<TimeShiftPicker> })
  return { component, root: host }
}

describe('TimeShiftPicker', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('mounts without error', () => {
    const { component } = mount()
    expect(component).toBeDefined()
  })
})
