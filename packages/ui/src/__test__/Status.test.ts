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
import { Severity, Status as PlatformStatus } from '@hcengineering/platform'
import StatusComponent from '../components/Status.svelte'

const CODE = 'ui:string:Ok' as IntlString

let target: HTMLElement

function mount (severity: Severity, props: Record<string, unknown> = {}): HTMLElement {
  const host = document.createElement('div')
  target.appendChild(host)
  const status = new PlatformStatus(severity, CODE, {})
  // eslint-disable-next-line no-new
  new StatusComponent({ target: host, props: { status, ...props } })
  return host.querySelector('.container') as HTMLElement
}

describe('Status', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('shows nothing but the container for an OK status', () => {
    const container = mount(Severity.OK)
    expect(container.classList.contains('OK')).toBe(true)
    expect(container.querySelector('.text-sm')).toBeNull()
  })

  it('shows the info icon and label for a non-OK status', () => {
    const container = mount(Severity.WARNING)
    expect(container.classList.contains('WARNING')).toBe(true)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('.text-sm')).not.toBeNull()
  })

  it('puts overflow-label on the container by default, and drops it when overflow is false', () => {
    expect(mount(Severity.ERROR).classList.contains('overflow-label')).toBe(true)
    expect(mount(Severity.ERROR, { overflow: false }).classList.contains('overflow-label')).toBe(false)
  })

  it('puts overflow-label on the message span too', () => {
    const container = mount(Severity.ERROR)
    expect((container.querySelector('.text-sm') as HTMLElement).classList.contains('overflow-label')).toBe(true)
  })

  // notLocalizedParams runs translateCB per param; with no loader registered it must not throw.
  it('resolves notLocalizedParams without throwing', async () => {
    const host = document.createElement('div')
    target.appendChild(host)
    const status = new PlatformStatus(Severity.ERROR, CODE, {}, { extra: 'ui:string:Ok' as IntlString })
    expect(() => new StatusComponent({ target: host, props: { status } })).not.toThrow()
    await tick()
  })
})
