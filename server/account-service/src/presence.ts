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

import { type AccountDB, type AccountWorkspaceBadgeStatus, type AccountWorkspacePresence } from '@hcengineering/account'
import core, {
  type AccountUuid,
  type MeasureContext,
  type Ref,
  generateId,
  type TxCreateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import {
  QueueUserEvent,
  type QueueUserLogin,
  type QueueUserLogout,
  type QueueUserMessage,
  QueueTransactorEvent,
  type QueueTransactorMessage,
  type ConsumerMessage,
  type QueueOnlineUserTx,
  type PlatformQueueProducer
} from '@hcengineering/server-core'
import pulse, { type WorkspacesNotification } from '@hcengineering/pulse'
import { type PersonSpace } from '@hcengineering/contact'

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
  _db: Promise<[AccountDB, () => void]>,
  onlineUserTxProducer: PlatformQueueProducer<QueueOnlineUserTx>
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
  const usersWithBadgeUpdates = new Set<AccountUuid>()
  const badgeUpdatesMap = new Map<string, { accountId: AccountUuid, workspaceId: WorkspaceUuid, hasUnread: boolean }>()

  for (const msg of msgs) {
    if (msg.value.type === QueueUserEvent.notifyStatusChanged) {
      const { user, hasUnread } = msg.value
      badgeUpdatesMap.set(`${user}:${msg.workspace}`, {
        accountId: user,
        workspaceId: msg.workspace,
        hasUnread
      })
      usersWithBadgeUpdates.add(user)
    } else if (msg.value.type === QueueUserEvent.login) {
      usersWithBadgeUpdates.add(msg.value.user)
    }
  }

  if (badgeUpdatesMap.size > 0) {
    await db.batchWorkspaceBadgeStatuses(Array.from(badgeUpdatesMap.values()))
  }

  if (usersWithBadgeUpdates.size > 0) {
    const userIds = Array.from(usersWithBadgeUpdates)

    // Batch fetch all statuses and presences for these users
    const [allStatuses, allPresences] = await Promise.all([
      db.accountWorkspaceBadgeStatus.find({ accountUuid: { $in: userIds } }),
      db.userWorkspacePresence.find({ accountUuid: { $in: userIds }, online: true })
    ])

    // Group by user
    const statusesByUser = new Map<AccountUuid, AccountWorkspaceBadgeStatus[]>()
    for (const status of allStatuses) {
      const arr = statusesByUser.get(status.accountUuid) ?? []
      arr.push(status)
      statusesByUser.set(status.accountUuid, arr)
    }

    const onlineWorkspacesByUser = new Map<AccountUuid, Set<WorkspaceUuid>>()
    for (const p of allPresences) {
      const set = onlineWorkspacesByUser.get(p.accountUuid) ?? new Set<WorkspaceUuid>()
      set.add(p.workspaceUuid)
      onlineWorkspacesByUser.set(p.accountUuid, set)
    }

    for (const user of userIds) {
      const dbStatuses = statusesByUser.get(user) ?? []
      const unreadStatusByWorkspace: Record<WorkspaceUuid, boolean> = {}
      for (const s of dbStatuses) unreadStatusByWorkspace[s.workspaceUuid] = s.hasUnread

      const onlineWorkspaces = onlineWorkspacesByUser.get(user) ?? new Set<WorkspaceUuid>()
      if (onlineWorkspaces.size > 0 && onlineUserTxProducer !== undefined) {
        // Send OnlineUserTx to each online workspace
        const tx: TxCreateDoc<WorkspacesNotification> = {
          _id: generateId(),
          _class: core.class.TxCreateDoc,
          objectId: generateId(),
          objectClass: pulse.class.WorkspacesNotification,
          objectSpace: core.space.Workspace as Ref<PersonSpace>, // Replace it with real person space in middleware
          space: core.space.DerivedTx,
          modifiedBy: core.account.System,
          modifiedOn: Date.now(),
          createdBy: core.account.System,
          attributes: {
            account: user,
            ...unreadStatusByWorkspace
          }
        }

        for (const wsUuid of onlineWorkspaces) {
          await onlineUserTxProducer.send(ctx, wsUuid, [{ workspaceUuid: wsUuid, tx, account: user }])
        }
      }
    }
  }
}
