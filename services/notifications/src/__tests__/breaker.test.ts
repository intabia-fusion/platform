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

import type { WorkspaceUuid } from '@hcengineering/core'

import { WorkspaceBreaker } from '../breaker'

const ws = 'ws-1' as WorkspaceUuid
const other = 'ws-2' as WorkspaceUuid

function make (): { breaker: WorkspaceBreaker, clock: { t: number } } {
  const clock = { t: 1_000_000 }
  const breaker = new WorkspaceBreaker({
    giveUpAfterMs: 300_000,
    cooldownMs: 300_000,
    probeGiveUpAfterMs: 30_000,
    now: () => clock.t
  })
  return { breaker, clock }
}

describe('WorkspaceBreaker', () => {
  it('retries a failing tx until the budget is spent, then drops it and opens the workspace', () => {
    const { breaker, clock } = make()

    expect(breaker.failed(ws, 'tx-1')).toEqual({ action: 'retry' })
    clock.t += 299_999
    expect(breaker.failed(ws, 'tx-1')).toEqual({ action: 'retry' })
    expect(breaker.isOpen(ws)).toBe(false)

    clock.t += 1
    expect(breaker.failed(ws, 'tx-1')).toEqual({ action: 'drop', opened: true, failingForMs: 300_000 })
    expect(breaker.isOpen(ws)).toBe(true)
  })

  it('skips the txes of an open workspace during the cooldown and leaves other workspaces alone', () => {
    const { breaker, clock } = make()
    breaker.failed(ws, 'tx-1')
    clock.t += 300_000
    breaker.failed(ws, 'tx-1')

    expect(breaker.shouldSkip(ws)).toBe(true)
    expect(breaker.shouldSkip(ws)).toBe(true)
    expect(breaker.shouldSkip(other)).toBe(false)
  })

  it('lets one tx probe after the cooldown and closes on its success, reporting the skipped count', () => {
    const { breaker, clock } = make()
    breaker.failed(ws, 'tx-1')
    clock.t += 300_000
    breaker.failed(ws, 'tx-1')
    breaker.shouldSkip(ws)
    breaker.shouldSkip(ws)

    clock.t += 300_000
    expect(breaker.shouldSkip(ws)).toBe(false)
    // The probe is in flight: a second tx of the workspace is not skipped either, it queues behind it.
    expect(breaker.shouldSkip(ws)).toBe(false)

    expect(breaker.succeeded(ws, 'tx-2')).toBe(2)
    expect(breaker.isOpen(ws)).toBe(false)
    expect(breaker.shouldSkip(ws)).toBe(false)
  })

  it('gives the probe the short budget and reopens without counting it as a new opening', () => {
    const { breaker, clock } = make()
    breaker.failed(ws, 'tx-1')
    clock.t += 300_000
    breaker.failed(ws, 'tx-1')
    clock.t += 300_000
    expect(breaker.shouldSkip(ws)).toBe(false)

    expect(breaker.failed(ws, 'tx-2')).toEqual({ action: 'retry' })
    clock.t += 30_000
    expect(breaker.failed(ws, 'tx-2')).toEqual({ action: 'drop', opened: false, failingForMs: 30_000 })
    expect(breaker.shouldSkip(ws)).toBe(true)
  })

  it('forgets a tx that succeeds after failures and does not open on it', () => {
    const { breaker, clock } = make()
    breaker.failed(ws, 'tx-1')
    clock.t += 100_000
    expect(breaker.succeeded(ws, 'tx-1')).toBeUndefined()
    clock.t += 300_000
    // A fresh failure of the same id starts a new budget.
    expect(breaker.failed(ws, 'tx-1')).toEqual({ action: 'retry' })
  })
})
