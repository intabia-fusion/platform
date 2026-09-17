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
import { Severity, Status } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import StatusBadge from '../components/StatusBadge.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<StatusBadge>> = {}): { component: StatusBadge, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = {
    status: new Status(Severity.OK, 'test.ok' as any, {}),
    ...props
  }
  const component = new StatusBadge({ target: host, props: merged as ComponentProps<StatusBadge> })
  return { component, root: host }
}

describe('StatusBadge', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a status circle', () => {
    const { root } = mount()
    expect(root.querySelector('.status-circle')).not.toBeNull()
  })

  it('carries the severity class', () => {
    const { root } = mount({ status: new Status(Severity.ERROR, 'e', {}) })
    const container = root.querySelector('.container')
    expect(container?.classList.contains('ERROR')).toBe(true)
  })

  it('applies overflow-label class by default', () => {
    const { root } = mount()
    expect(root.querySelector('.container')?.classList.contains('overflow-label')).toBe(true)
  })

  it('removes overflow-label when overflow is false', () => {
    const { root } = mount({ overflow: false })
    expect(root.querySelector('.container')?.classList.contains('overflow-label')).toBe(false)
  })

  it('carries multicolor class by default', () => {
    const { root } = mount()
    expect(root.querySelector('.container')?.classList.contains('multicolor')).toBe(true)
  })

  it('removes multicolor class when multicolor is false', () => {
    const { root } = mount({ multicolor: false })
    expect(root.querySelector('.container')?.classList.contains('multicolor')).toBe(false)
  })
})
