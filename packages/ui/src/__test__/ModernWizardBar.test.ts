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
import type { IntlString } from '@hcengineering/platform'
import ModernWizardBar from '../components/wizard/ModernWizardBar.svelte'
import type { IWizardStep } from '../types'

let target: HTMLElement

const steps: readonly IWizardStep[] = [
  { id: 'a', title: 'ui:string:StepA' as IntlString },
  { id: 'b', title: 'ui:string:StepB' as IntlString },
  { id: 'c', title: 'ui:string:StepC' as IntlString }
]

function mount (props: Record<string, unknown>): { host: HTMLElement, component: ModernWizardBar } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernWizardBar({ target: host, props })
  return { host, component }
}

describe('ModernWizardBar', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one circle and one label per step, numbered from 1', () => {
    const { host } = mount({ steps, selectedStep: '' })
    const circles = host.querySelectorAll('.circle')
    const labels = host.querySelectorAll('.label')
    expect(circles).toHaveLength(3)
    expect(labels).toHaveLength(3)
    expect(labels[0].textContent).toContain('1.')
    expect(labels[1].textContent).toContain('2.')
    expect(labels[2].textContent).toContain('3.')
  })

  it('renders a connecting path between steps but not before the first or after the last', () => {
    const { host } = mount({ steps, selectedStep: '' })
    // idx!=0 gives a leading path (2), idx!=last gives a trailing path (2) -> 4 for 3 steps.
    expect(host.querySelectorAll('.path')).toHaveLength(4)
  })

  it('renders no path at all for a single step', () => {
    const { host } = mount({ steps: [steps[0]], selectedStep: '' })
    expect(host.querySelectorAll('.path')).toHaveLength(0)
    expect(host.querySelectorAll('.circle')).toHaveLength(1)
  })

  it('leaves everything unhighlighted when selectedStep is empty', () => {
    const { host } = mount({ steps, selectedStep: '' })
    const circles = host.querySelectorAll('.circle')
    circles.forEach((c) => {
      expect(c.classList.contains('filled')).toBe(true)
      expect(c.classList.contains('filledHighlighted')).toBe(false)
    })
    expect(host.querySelectorAll('.checkmark')).toHaveLength(0)
    host.querySelectorAll('.label').forEach((l) => { expect(l.classList.contains('highlighted')).toBe(false) })
    host.querySelectorAll('.path').forEach((p) => { expect(p.classList.contains('highlighted')).toBe(false) })
  })

  it('marks steps before the selected one as past (checkmarked, highlighted), and the selected as current', () => {
    const { host } = mount({ steps, selectedStep: 'b' }) // idx 1 of 3
    const circles = host.querySelectorAll('.circle')
    const labels = host.querySelectorAll('.label')

    // step a (idx 0): past
    expect(circles[0].classList.contains('filledHighlighted')).toBe(true)
    expect(circles[0].classList.contains('filled')).toBe(false)
    expect(circles[0].querySelector('.checkmark')).not.toBeNull()
    expect(labels[0].classList.contains('highlighted')).toBe(true)

    // step b (idx 1): current, not past
    expect(circles[1].classList.contains('filledHighlighted')).toBe(false)
    expect(circles[1].classList.contains('filled')).toBe(false)
    expect(circles[1].querySelector('.checkmark')).toBeNull()
    expect(labels[1].classList.contains('highlighted')).toBe(true)

    // step c (idx 2): neither past nor current
    expect(circles[2].classList.contains('filled')).toBe(true)
    expect(circles[2].querySelector('.checkmark')).toBeNull()
    expect(labels[2].classList.contains('highlighted')).toBe(false)
  })

  it('treats a selectedStep not present in steps as no selection (index -1)', () => {
    const { host } = mount({ steps, selectedStep: 'missing' })
    const circles = host.querySelectorAll('.circle')
    circles.forEach((c) => {
      expect(c.classList.contains('filled')).toBe(true)
      expect(c.classList.contains('filledHighlighted')).toBe(false)
    })
    expect(host.querySelectorAll('.checkmark')).toHaveLength(0)
  })

  it('places circles/labels in the grid row 3*idx+1, and path wrappers in 3*idx / 3*idx+2', () => {
    const { host } = mount({ steps, selectedStep: '' })
    const circles = host.querySelectorAll('.circle')
    const labels = host.querySelectorAll('.label')
    const pathWrappers = host.querySelectorAll('.flex-col-center') // holds the grid-row; .path itself is unstyled

    expect((circles[1] as HTMLElement).style.gridRow).toBe('4') // 3*1+1
    expect((labels[2] as HTMLElement).style.gridRow).toBe('7') // 3*2+1
    // trailing path after idx 0 sits in row 3*0+2=2, leading path before idx 1 sits in row 3*1=3
    const rows = Array.from(pathWrappers).map((p) => (p as HTMLElement).style.gridRow)
    expect(rows).toContain('2')
    expect(rows).toContain('3')
  })

  it('recomputes highlighting when selectedStep changes', async () => {
    const { host, component } = mount({ steps, selectedStep: 'a' })
    expect(host.querySelectorAll('.circle')[0].classList.contains('filled')).toBe(false)

    component.$set({ selectedStep: 'c' })
    await tick()
    const circles = host.querySelectorAll('.circle')
    expect(circles[0].classList.contains('filledHighlighted')).toBe(true) // now past
    expect(circles[2].classList.contains('filled')).toBe(false) // now current
  })
})
