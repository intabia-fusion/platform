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
import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import {
  type ConsumerControl,
  type ConsumerHandle,
  LimitCategory,
  LimitStatus,
  type PlatformQueue,
  type PlatformQueueProducer,
  QueueTopic,
  QueueWorkspaceEvent,
  type QueueWorkspaceLimitsMessage,
  type QueueWorkspaceMessage
} from '@hcengineering/server-core'

/** Matches BillingUsageMessage from pod-billing (plan 3); defined locally to avoid cross-service import. */
interface StorageDeltaMessage {
  workspace: WorkspaceUuid
  metric: 'storage'
  amount: number
  /** Idempotency key — sha256 of blob content. */
  ref: string
}

/** Tracks disk-exhausted workspaces (consumed from Workspace topic) and emits storage deltas. */
export class LimitsState {
  private readonly diskExhausted = new Set<WorkspaceUuid>()

  private readonly usageProducer: PlatformQueueProducer<StorageDeltaMessage>
  private readonly consumer: ConsumerHandle

  constructor (ctx: MeasureContext, queue: PlatformQueue) {
    this.usageProducer = queue.getProducer<StorageDeltaMessage>(ctx, QueueTopic.BillingUsage)

    this.consumer = queue.createBatchConsumer<QueueWorkspaceMessage>(
      ctx,
      QueueTopic.Workspace,
      queue.getClientId(), // per-instance group: every instance keeps its own sets, must get all events
      async (_ctx: MeasureContext, messages, _control: ConsumerControl) => {
        for (const m of messages) {
          const value = m.value
          if (value.type !== QueueWorkspaceEvent.LimitsChanged) continue
          const { category, status } = value as QueueWorkspaceLimitsMessage
          if (category !== LimitCategory.Disk) continue

          if (status === LimitStatus.Exhausted) {
            this.diskExhausted.add(m.workspace)
          } else {
            this.diskExhausted.delete(m.workspace)
          }
        }
      },
      { batchSize: 50, batchTimeout: 500 }
    )
  }

  /** True when user uploads should be blocked for this workspace (disk exhausted). */
  isExhausted (workspace: WorkspaceUuid): boolean {
    return this.diskExhausted.has(workspace)
  }

  /** Fire-and-forget storage delta to billing-usage. Call only for user uploads. ref=sha256 for idempotency. */
  sendStorageDelta (ctx: MeasureContext, workspace: WorkspaceUuid, size: number, sha256: string): void {
    void this.usageProducer
      .send(ctx, workspace, [{ workspace, metric: 'storage', amount: size, ref: sha256 }])
      .catch((err) => {
        ctx.error('failed to send storage delta', { workspace, size, sha256, err })
      })
  }

  async close (): Promise<void> {
    await this.consumer.close()
    await this.usageProducer.close()
  }
}
