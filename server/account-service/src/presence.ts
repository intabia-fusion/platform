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

import { type AccountDB, type AccountWorkspacePresence } from '@hcengineering/account'
import { type MeasureContext } from '@hcengineering/core'
import {
  QueueUserEvent,
  type QueueUserLogin,
  type QueueUserLogout,
  type QueueUserMessage,
  QueueTransactorEvent,
  type QueueTransactorMessage,
  type ConsumerMessage
} from '@hcengineering/server-core'

export async function handleTransactorLifecycle (
  ctx: MeasureContext,
  msg: ConsumerMessage<QueueTransactorMessage>,
  _db: Promise<[AccountDB, () => void]>
): Promise<void> {
  const { type, transactorId, timestamp } = msg.value
  if (type === QueueTransactorEvent.started || type === QueueTransactorEvent.stopped) {
    const [db] = await _db
    ctx.info(`Transactor ${transactorId} ${type}. Clearing its previous sessions.`)
    await db.clearPresenceForTransactor(transactorId, timestamp)
  }
}

export async function handlePresenceBatch (
  ctx: MeasureContext,
  msgs: ConsumerMessage<QueueUserMessage>[],
  _db: Promise<[AccountDB, () => void]>
): Promise<void> {
  const presences: AccountWorkspacePresence[] = msgs
    .filter((msg) => [QueueUserEvent.login, QueueUserEvent.logout].includes(msg.value.type))
    .map((msg) => {
      const { type, user, sessions, transactorId, timestamp } = msg.value as QueueUserLogin | QueueUserLogout
      return {
        accountUuid: user,
        workspaceUuid: msg.workspace,
        online: type === QueueUserEvent.login || (sessions ?? 0) > 0,
        updatedOn: timestamp,
        transactorId
      }
    })

  if (presences.length > 0) {
    const [db] = await _db
    await db.batchUpsertPresence(presences)
  }

  const [db] = await _db
  for (const msg of msgs) {
    if (msg.value.type === QueueUserEvent.notifyStatusChanged) {
      const { user, hasUnread } = msg.value
      await db.setAccountWorkspaceBadgeStatus(user, msg.workspace, hasUnread)
    }
  }
}
