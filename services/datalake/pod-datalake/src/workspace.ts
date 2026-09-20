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

import { type MeasureContext } from '@hcengineering/core'
import {
  type ConsumerControl,
  type ConsumerHandle,
  type ConsumerMessage,
  type PlatformQueue,
  type QueueWorkspaceMessage,
  QueueTopic,
  QueueWorkspaceEvent
} from '@hcengineering/server-core'

import { type Datalake } from './datalake/types'

/** Shared group: one replica applies the change, the rest skip the message. */
const GROUP_ID = 'datalake-workspace'

export async function handleWorkspaceMessage (
  ctx: MeasureContext,
  datalake: Datalake,
  msg: ConsumerMessage<QueueWorkspaceMessage>
): Promise<void> {
  if (msg.value.type !== QueueWorkspaceEvent.Deleted) return
  await datalake.deleteWorkspace(ctx, msg.workspace)
}

/**
 * Deleting a workspace drops its database, never its blobs - marking them keeps the files for a
 * later sweep. Archiving needs nothing here: its tokens are read-only, which every write refuses.
 */
export function createWorkspaceCleaner (ctx: MeasureContext, queue: PlatformQueue, datalake: Datalake): ConsumerHandle {
  return queue.createConsumer<QueueWorkspaceMessage>(
    ctx,
    QueueTopic.Workspace,
    GROUP_ID,
    async (ctx: MeasureContext, msg: ConsumerMessage<QueueWorkspaceMessage>, _control: ConsumerControl) => {
      await handleWorkspaceMessage(ctx, datalake, msg)
    }
  )
}
