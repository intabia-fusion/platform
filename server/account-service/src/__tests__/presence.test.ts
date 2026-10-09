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
import { MeasureMetricsContext } from '@hcengineering/core'
import { QueueUserEvent } from '@hcengineering/server-core'

import { handlePresenceBatch } from '../presence'

const ctx = new MeasureMetricsContext('test', {})

function setup (rows: Array<{ accountUuid: string, workspaceUuid: string, hasUnread: boolean }>): {
  db: any
  producer: any
  sent: any[]
} {
  const sent: any[] = []
  const db = {
    batchWorkspaceBadgeStatuses: jest.fn(async () => {}),
    accountWorkspaceBadgeStatus: { find: jest.fn(async () => rows) }
  }
  const producer = {
    send: jest.fn(async (_ctx: unknown, _ws: string, msgs: any[]) => {
      sent.push(...msgs)
    })
  }
  return { db, producer, sent }
}

const statusChanged = (user: string, workspace: string, hasUnread: boolean): any => ({
  workspace,
  value: { type: QueueUserEvent.notifyStatusChanged, user, hasUnread, timestamp: 1 }
})

describe('handlePresenceBatch', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('stores the last flag of a user and workspace in the batch and sends all of their flags', async () => {
    const { db, producer, sent } = setup([
      { accountUuid: 'acc', workspaceUuid: 'ws-1', hasUnread: false },
      { accountUuid: 'acc', workspaceUuid: 'ws-2', hasUnread: true }
    ])

    await handlePresenceBatch(
      ctx,
      [statusChanged('acc', 'ws-1', true), statusChanged('acc', 'ws-1', false)],
      Promise.resolve([db, () => {}]),
      producer
    )

    expect(db.batchWorkspaceBadgeStatuses).toHaveBeenCalledWith([
      { accountId: 'acc', workspaceId: 'ws-1', hasUnread: false }
    ])
    expect(sent).toHaveLength(1)
    expect(sent[0].account).toBe('acc')
    expect(sent[0].tx.attributes).toEqual({ account: 'acc', 'ws-1': false, 'ws-2': true })
  })

  it('stamps the notification with the moment before the read, not after', async () => {
    let now = 1000
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    const { db, producer, sent } = setup([{ accountUuid: 'acc', workspaceUuid: 'ws-1', hasUnread: true }])
    // A slow read: a snapshot taken by another replica meanwhile must look newer than this one.
    db.accountWorkspaceBadgeStatus.find.mockImplementation(async () => {
      now = 5000
      return [{ accountUuid: 'acc', workspaceUuid: 'ws-1', hasUnread: true }]
    })

    await handlePresenceBatch(
      ctx,
      [{ workspace: 'ws-1', value: { type: QueueUserEvent.login, user: 'acc' } } as any],
      Promise.resolve([db, () => {}]),
      producer
    )

    expect(sent[0].tx.modifiedOn).toBe(1000)
  })
})
