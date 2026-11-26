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
import { type PublicFileAccess } from './datalake/publicFileAccess'

/** Shared group: one replica applies the change, the rest skip the message. */
const GROUP_ID = 'datalake-workspace'

export async function handleWorkspaceMessage (
  ctx: MeasureContext,
  datalake: Datalake,
  msg: ConsumerMessage<QueueWorkspaceMessage>,
  access: Pick<PublicFileAccess, 'setWorkspaceAvailable'>
): Promise<void> {
  switch (msg.value.type) {
    case QueueWorkspaceEvent.Archived:
    case QueueWorkspaceEvent.Restoring:
      await access.setWorkspaceAvailable(msg.workspace, false)
      break
    case QueueWorkspaceEvent.Restored:
      await access.setWorkspaceAvailable(msg.workspace, true)
      break
    case QueueWorkspaceEvent.Deleted:
      await access.setWorkspaceAvailable(msg.workspace, false)
      await datalake.deleteWorkspace(ctx, msg.workspace)
      break
  }
}

/**
 * Deleting a workspace drops its database, never its blobs - marking them keeps the files for a
 * later sweep. Archive/restore events change guest availability without changing blobs or link permissions.
 */
export function createWorkspaceCleaner (
  ctx: MeasureContext,
  queue: PlatformQueue,
  datalake: Datalake,
  access: Pick<PublicFileAccess, 'setWorkspaceAvailable'>
): ConsumerHandle {
  return queue.createConsumer<QueueWorkspaceMessage>(
    ctx,
    QueueTopic.Workspace,
    GROUP_ID,
    async (ctx: MeasureContext, msg: ConsumerMessage<QueueWorkspaceMessage>, _control: ConsumerControl) => {
      await handleWorkspaceMessage(ctx, datalake, msg, access)
    }
  )
}
