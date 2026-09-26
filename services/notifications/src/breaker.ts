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

export interface WorkspaceBreakerOptions {
  // How long one tx is retried before it is dropped and the workspace breaker opens.
  giveUpAfterMs: number
  // How long the txes of an open workspace are skipped before one of them probes it again.
  cooldownMs: number
  // How long the probe tx is retried: shorter than `giveUpAfterMs`, the workspace was broken a
  // moment ago and the partition should not wait the full budget on it again.
  probeGiveUpAfterMs: number
  now?: () => number
}

export type FailureVerdict =
  | { action: 'retry' }
  // `opened` is set when this failure opened the breaker (the tx was retried to the budget).
  | { action: 'drop', opened: boolean, failingForMs: number }

interface OpenState {
  until: number
  probing: boolean
  skipped: number
}

// A partition of the tx topic is consumed in order, and the queue retries a failing message
// forever. One workspace whose transactor keeps failing would hold every other workspace of the
// partition: each of its txes would spend the whole retry budget before being dropped. The breaker
// opens after the first dropped tx and skips the workspace's txes for a cooldown; then one tx
// probes the workspace with a short budget, and either closes the breaker or opens it again.
export class WorkspaceBreaker {
  private readonly failingSince = new Map<string, number>()
  private readonly open = new Map<WorkspaceUuid, OpenState>()
  private readonly now: () => number

  constructor (private readonly options: WorkspaceBreakerOptions) {
    this.now = options.now ?? Date.now
  }

  isOpen (ws: WorkspaceUuid): boolean {
    return this.open.has(ws)
  }

  // True when the tx has to be skipped: the workspace is open and still cooling down. After the
  // cooldown exactly one tx goes through as the probe.
  shouldSkip (ws: WorkspaceUuid): boolean {
    const state = this.open.get(ws)
    if (state === undefined) return false
    if (state.probing) return false
    if (this.now() < state.until) {
      state.skipped++
      return true
    }
    state.probing = true
    return false
  }

  // Returns how many txes were skipped when this success closes an open breaker.
  succeeded (ws: WorkspaceUuid, txId: string): number | undefined {
    this.failingSince.delete(txId)
    const state = this.open.get(ws)
    if (state === undefined) return undefined
    this.open.delete(ws)
    return state.skipped
  }

  failed (ws: WorkspaceUuid, txId: string): FailureVerdict {
    const now = this.now()
    const state = this.open.get(ws)
    const budget = state?.probing === true ? this.options.probeGiveUpAfterMs : this.options.giveUpAfterMs

    const since = this.failingSince.get(txId) ?? now
    const failingForMs = now - since
    if (failingForMs >= budget) {
      this.failingSince.delete(txId)
      this.open.set(ws, { until: now + this.options.cooldownMs, probing: false, skipped: state?.skipped ?? 0 })
      return { action: 'drop', opened: state === undefined, failingForMs }
    }

    // A bounded map: ids of txes that never come back are the exception, not the rule.
    if (this.failingSince.size > 100) this.failingSince.clear()
    this.failingSince.set(txId, since)
    return { action: 'retry' }
  }
}
