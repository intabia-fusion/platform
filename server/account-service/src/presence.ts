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

import { type AccountDB, type AccountWorkspacePresence, getAllTransactors, EndpointKind } from '@hcengineering/account'
import { type AccountUuid, type MeasureContext, systemAccountUuid } from '@hcengineering/core'
import {
  QueueUserEvent,
  type QueueUserLogin,
  QueueTransactorEvent,
  type QueueTransactorMessage,
  type ConsumerMessage
} from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { createRestClient, type TransactorSessionSnapshot } from '@hcengineering/api-client'

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
  msgs: ConsumerMessage<QueueUserLogin>[],
  _db: Promise<[AccountDB, () => void]>
): Promise<void> {
  const presences: AccountWorkspacePresence[] = msgs.map((msg) => {
    const { type, user, sessions, transactorId, timestamp } = msg.value
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
}

export function initPresenceRehydration (ctx: MeasureContext, db: AccountDB, serviceId: string): void {
  // Start rehydration loop in background
  void runStartupRehydration(ctx, db, serviceId)
}

async function runStartupRehydration (ctx: MeasureContext, db: AccountDB, serviceId: string): Promise<void> {
  let pendingEndpoints = getAllTransactors(EndpointKind.Internal)
  const startTime = Date.now()

  ctx.info(`Starting presence rehydration for ${pendingEndpoints.length} transactors`)

  while (pendingEndpoints.length > 0) {
    const failedEndpoints = await rehydratePresence(ctx, db, serviceId, pendingEndpoints)

    if (failedEndpoints.length === 0) {
      ctx.info('Presence rehydration completed successfully for all transactors')
      // Only after we got a FULL snapshot, we can safely reset statuses for sessions that didn't reappear
      await db.resetPresenceOffline(startTime)
      break
    }

    pendingEndpoints = failedEndpoints
    ctx.warn(
      `Presence rehydration partially failed. ${pendingEndpoints.length} transactors remaining. Retrying in 1 minute...`
    )
    await new Promise((resolve) => setTimeout(resolve, 60 * 1000))
  }
}

async function rehydratePresence (
  ctx: MeasureContext,
  db: AccountDB,
  serviceId: string,
  endpoints: string[]
): Promise<string[]> {
  const token = generateToken(systemAccountUuid, undefined, { service: serviceId })
  const failedEndpoints: string[] = []

  for (const endpoint of endpoints) {
    try {
      const time = Date.now()
      const serverEndpoint = endpoint.replaceAll('wss://', 'https://').replace('ws://', 'http://')
      const client = createRestClient(serverEndpoint, '', token)
      const { sessions, transactorId }: TransactorSessionSnapshot = await client.getSessions()

      const presences: AccountWorkspacePresence[] = []
      for (const [account, workspaces] of Object.entries(sessions)) {
        const accountUuid = account as AccountUuid
        for (const workspaceUuid of workspaces) {
          presences.push({
            accountUuid,
            workspaceUuid,
            online: true,
            updatedOn: time,
            transactorId
          })
        }
      }

      if (presences.length > 0) {
        await db.batchUpsertPresence(presences)
      }
      ctx.info(`Successfully rehydrated ${presences.length} sessions from transactor ${transactorId} (${endpoint})`)
    } catch (err: any) {
      ctx.error(`Failed to rehydrate presence from ${endpoint}: ${err.message}`)
      failedEndpoints.push(endpoint)
    }
  }

  return failedEndpoints
}
