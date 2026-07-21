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
import { generateId, type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import {
  type ConsumerHandle,
  LimitCategory,
  LimitStatus,
  type PlatformQueue,
  QueueTopic,
  QueueWorkspaceEvent,
  type QueueWorkspaceLimitsMessage,
  type QueueWorkspaceMessage
} from '@hcengineering/server-core'

/**
 * Tracks disk/payment-exhausted workspaces (consumed from Workspace topic, same pattern as datalake).
 * Recordings are written straight to S3 by LiveKit egress, so the datalake upload gate never sees
 * them — block starting a recording here instead when the workspace is out of disk or unpaid.
 */
export class LimitsState {
  private readonly diskExhausted = new Set<WorkspaceUuid>()
  private readonly paymentExhausted = new Set<WorkspaceUuid>()

  private readonly consumer: ConsumerHandle

  constructor (ctx: MeasureContext, queue: PlatformQueue) {
    this.consumer = queue.createBatchConsumer<QueueWorkspaceMessage>(
      ctx,
      QueueTopic.Workspace,
      `love-limits-${generateId()}`, // unique per-process group: every replica must receive all LimitsChanged events
      async (_ctx: MeasureContext, messages) => {
        for (const m of messages) {
          const value = m.value
          if (value.type !== QueueWorkspaceEvent.LimitsChanged) continue
          const { category, status } = value as QueueWorkspaceLimitsMessage
          let set: Set<WorkspaceUuid> | undefined
          if (category === LimitCategory.Disk) set = this.diskExhausted
          else if (category === LimitCategory.Payment) set = this.paymentExhausted
          if (set === undefined) continue

          if (status === LimitStatus.Exhausted) {
            set.add(m.workspace)
          } else {
            set.delete(m.workspace)
          }
        }
      },
      { batchSize: 50, batchTimeout: 500 }
    )
  }

  /** True when starting a recording should be blocked for this workspace (disk or payment exhausted). */
  isExhausted (workspace: WorkspaceUuid): boolean {
    return this.diskExhausted.has(workspace) || this.paymentExhausted.has(workspace)
  }

  async close (): Promise<void> {
    await this.consumer.close()
  }
}
