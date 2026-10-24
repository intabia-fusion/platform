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
import type { ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import EmptyState from '../../ui-kit/empty-state/EmptyState.svelte'
import EmptyStateWithActions from './EmptyStateWithActions.svelte'

const LABEL = getEmbeddedLabel('No issues yet')
const DESCRIPTION = getEmbeddedLabel('Create the first one')
const ICON = 'ui:icon:Folder' as Asset

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<EmptyState>): HTMLElement {
  return mountWith(props).root
}

function mountWith (props: ComponentProps<EmptyState>): { root: HTMLElement, component: EmptyState } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new EmptyState({ target: host, props })
  mounted.push(component)
  return { root: host.querySelector('.empty-state') as HTMLElement, component }
}

describe('ui-kit EmptyState', () => {
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

  it('is large by default, with the message, the description and a decorative icon', () => {
    const root = mount({ label: LABEL, description: DESCRIPTION, icon: ICON })
    expect(root.classList.contains('empty-state--large')).toBe(true)
    expect(root.querySelector('.empty-state__label')?.textContent).toBe('No issues yet')
    expect(root.querySelector('.empty-state__description')?.textContent).toBe('Create the first one')
    expect(root.querySelector('.empty-state__plate')?.getAttribute('aria-hidden')).toBe('true')
    // The icon fills its box, which the size sets: 1.75rem on the large plate, 1.5rem in small.
    expect(root.querySelector('.empty-state__icon svg')?.classList.contains('svg-full')).toBe(true)
    expect(root.querySelector('.empty-state__actions')).toBeNull()
  })

  it('leaves out what is not given', () => {
    const root = mount({ label: LABEL, size: 'small' })
    expect(root.classList.contains('empty-state--small')).toBe(true)
    expect(root.querySelector('.empty-state__icon')).toBeNull()
    expect(root.querySelector('.empty-state__description')).toBeNull()
  })

  it('puts the default slot under the text as actions', () => {
    const host = document.createElement('div')
    target.appendChild(host)
    mounted.push(new EmptyStateWithActions({ target: host, props: { props: { label: LABEL, size: 'small' } } }))
    expect(host.querySelector('.empty-state__actions .action')).not.toBeNull()
  })

  it('shows the large picture by kind: a brand circle by default, a neutral plate', () => {
    expect(mount({ label: LABEL, icon: ICON }).classList.contains('empty-state--brand')).toBe(true)
    expect(mount({ label: LABEL, icon: ICON, kind: 'plate' }).classList.contains('empty-state--plate')).toBe(true)
    expect(mount({ label: LABEL, kind: 'brand', size: 'small' }).classList.contains('empty-state--brand')).toBe(false)
  })

  it('turns a small state with an action into a dashed add button holding the message and the action', () => {
    const { root, component } = mountWith({
      label: LABEL,
      size: 'small',
      icon: ICON,
      action: getEmbeddedLabel('Create an application')
    })
    expect(root.tagName).toBe('BUTTON')
    expect(root.getAttribute('type')).toBe('button')
    expect(root.querySelector('.empty-state__label')?.textContent).toBe('No issues yet')
    expect(root.querySelector('.empty-state__action')?.textContent?.trim()).toBe('Create an application')
    expect(root.querySelector('.empty-state__plate')?.getAttribute('aria-hidden')).toBe('true')
    const onClick = vi.fn()
    component.$on('click', onClick)
    root.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('ignores the action in a large state', () => {
    const root = mount({ label: LABEL, action: getEmbeddedLabel('Create') })
    expect(root.tagName).toBe('DIV')
    expect(root.textContent).not.toContain('Create')
  })
})
