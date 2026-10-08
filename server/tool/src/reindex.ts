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

import core, {
  DOMAIN_MIGRATION,
  type Class,
  type Doc,
  type Domain,
  type LowLevelStorage,
  type MeasureContext,
  type MigrationState,
  type Ref,
  type WorkspaceUuid
} from '@hcengineering/core'
import { workspaceEvents, type PlatformQueueProducer, type QueueWorkspaceMessage } from '@hcengineering/server-core'

export const reindexRequestPlugin = 'fulltext-reindex'
const fullReindexState = 'full'

/** `state` is the domain to reindex, or 'full'. */
export interface ReindexRequest extends MigrationState {
  classes?: Array<Ref<Class<Doc>>>
}

/** A fixed id per domain: a migration re-run after a crash overwrites its request instead of adding one. */
export function reindexRequest (domain?: Domain, classes?: Array<Ref<Class<Doc>>>): ReindexRequest {
  const state = domain ?? fullReindexState
  return {
    _id: `${reindexRequestPlugin}-${state}` as Ref<ReindexRequest>,
    _class: core.class.MigrationState,
    space: core.space.Configuration,
    modifiedBy: core.account.System,
    modifiedOn: Date.now(),
    plugin: reindexRequestPlugin,
    state,
    ...(classes !== undefined ? { classes } : {})
  }
}

async function findReindexRequests (lowLevel: LowLevelStorage): Promise<ReindexRequest[]> {
  return await lowLevel.rawFindAll<ReindexRequest>(DOMAIN_MIGRATION, {
    _class: core.class.MigrationState,
    plugin: reindexRequestPlugin
  })
}

/**
 * Sends the stored requests and removes them. A full reindex covers the partial ones. A failed send keeps
 * everything for the next upgrade; a crash between send and removal only repeats a reindex.
 */
export async function sendPendingReindex (
  ctx: MeasureContext,
  lowLevel: LowLevelStorage,
  queue: PlatformQueueProducer<QueueWorkspaceMessage>,
  workspace: WorkspaceUuid
): Promise<QueueWorkspaceMessage[]> {
  const requests = await findReindexRequests(lowLevel)
  if (requests.length === 0) {
    return []
  }
  const msgs = requests.some((it) => it.state === fullReindexState)
    ? [workspaceEvents.fullReindex()]
    : requests.map((it) => workspaceEvents.reindex(it.state as Domain, it.classes ?? []))
  await queue.send(ctx, workspace, msgs)
  await lowLevel.clean(
    ctx,
    DOMAIN_MIGRATION,
    requests.map((it) => it._id)
  )
  return msgs
}

/** A new workspace gets a full reindex on Created: its migrations' requests are not needed. */
export async function dropPendingReindex (ctx: MeasureContext, lowLevel: LowLevelStorage): Promise<void> {
  const requests = await findReindexRequests(lowLevel)
  if (requests.length > 0) {
    await lowLevel.clean(
      ctx,
      DOMAIN_MIGRATION,
      requests.map((it) => it._id)
    )
  }
}
