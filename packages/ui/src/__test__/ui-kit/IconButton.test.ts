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

import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IconButton from '../../ui-kit/button/IconButton.svelte'

const ICON = 'ui:icon:Settings' as Asset
const TOOLTIP = { label: getEmbeddedLabel('Settings') }

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<IconButton>): { button: HTMLButtonElement, component: IconButton } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new IconButton({ target: host, props })
  mounted.push(component)
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

describe('ui-kit IconButton', () => {
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

  it('renders an icon-only kit button with a small icon', () => {
    const { button } = mount({ icon: ICON, tooltip: TOOLTIP })
    expect(button.classList.contains('button')).toBe(true)
    expect(button.classList.contains('button--icon-only')).toBe(true)
    expect(button.querySelector('svg.svg-small')).not.toBeNull()
  })

  it('is named by its tooltip, or by aria-label', async () => {
    const { button: byTooltip } = mount({ icon: ICON, tooltip: TOOLTIP })
    const { button: byAriaLabel } = mount({ icon: ICON, 'aria-label': 'Open settings' })
    await tick()
    expect(byTooltip.getAttribute('aria-label')).toBe('Settings')
    expect(byAriaLabel.getAttribute('aria-label')).toBe('Open settings')
  })

  it('passes button props and attributes through', () => {
    const { button } = mount({ icon: ICON, tooltip: TOOLTIP, kind: 'negative', size: 'small', 'data-id': 'remove' })
    expect([...button.classList]).toEqual(expect.arrayContaining(['button--negative', 'button--small']))
    expect(button.dataset.id).toBe('remove')
  })

  it('forwards click and exposes focus()', () => {
    const { button, component } = mount({ icon: ICON, tooltip: TOOLTIP })
    const onClick = vi.fn<(event: MouseEvent) => void>()
    component.$on('click', onClick)
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)

    component.focus()
    expect(document.activeElement).toBe(button)
  })
})
