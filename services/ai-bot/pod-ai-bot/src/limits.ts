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
import { type WorkspaceUuid } from '@hcengineering/core'
import { LimitCategory, LimitStatus, type QueueWorkspaceLimitsMessage } from '@hcengineering/server-core'

/** In-memory exhausted state for aibot. Fail-open: empty sets = permitted until first event. */
export class LimitsState {
  private readonly tokensExhausted = new Set<WorkspaceUuid>()
  private readonly transcriptExhausted = new Set<WorkspaceUuid>()
  private readonly paymentExhausted = new Set<WorkspaceUuid>()

  applyEvent (msg: QueueWorkspaceLimitsMessage, workspace: WorkspaceUuid): void {
    const set = this.getSet(msg.category)
    if (set === undefined) return
    if (msg.status === LimitStatus.Exhausted) {
      set.add(workspace)
    } else {
      set.delete(workspace)
    }
  }

  /** True when LLM usage is blocked (tokens or payment exhausted). */
  isTokensBlocked (workspace: WorkspaceUuid): boolean {
    return this.tokensExhausted.has(workspace) || this.paymentExhausted.has(workspace)
  }

  /** True when transcription should be skipped (transcript or payment exhausted). */
  isTranscriptBlocked (workspace: WorkspaceUuid): boolean {
    return this.transcriptExhausted.has(workspace) || this.paymentExhausted.has(workspace)
  }

  private getSet (category: string): Set<WorkspaceUuid> | undefined {
    if (category === LimitCategory.Tokens) return this.tokensExhausted
    if (category === LimitCategory.Transcript) return this.transcriptExhausted
    if (category === LimitCategory.Payment) return this.paymentExhausted
    return undefined
  }
}
