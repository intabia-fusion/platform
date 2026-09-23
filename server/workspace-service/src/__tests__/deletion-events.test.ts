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

import {
  type MeasureContext,
  type WorkspaceInfoWithStatus,
  type WorkspaceMode,
  type WorkspaceUuid
} from '@hcengineering/core'
import { QueueWorkspaceEvent, type QueueWorkspaceMessage } from '@hcengineering/server-core'

import { WorkspaceWorker } from '../service'

const updateWorkspaceInfo = jest.fn()

jest.mock('@hcengineering/account-client', () => ({
  getClient: () => ({ updateWorkspaceInfo })
}))
jest.mock('@hcengineering/server-token', () => ({
  generateToken: () => 'token'
}))
jest.mock('@hcengineering/server-client', () => ({
  getTransactorEndpoint: async () => 'http://transactor',
  withRetryConnUntilSuccess: (fn: () => Promise<any>) => fn,
  withRetryConnUntilTimeout: (fn: () => Promise<any>) => fn
}))

const ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as MeasureContext

interface Sent {
  events: QueueWorkspaceMessage[]
  worker: any
  cleanup: jest.Mock
}

function workerFor (mode: WorkspaceMode): Sent {
  const events: QueueWorkspaceMessage[] = []
  const worker = Object.create(WorkspaceWorker.prototype)
  worker.accountsUrl = 'http://account'
  worker.version = {}
  worker.workspaceQueue = {
    send: async (_ctx: MeasureContext, _ws: WorkspaceUuid, msgs: QueueWorkspaceMessage[]) => {
      events.push(...msgs)
    }
  }

  const cleanup = jest.fn()
  worker.doCleanup = cleanup
  worker.sendTransactorMaitenance = jest.fn()
  worker.doBackup = jest.fn(async () => true)
  worker._upgradeWorkspace = jest.fn()
  worker._createWorkspace = jest.fn()
  worker.doRestore = jest.fn(async () => true)

  return { events, worker, cleanup }
}

async function run (mode: WorkspaceMode, worker: any): Promise<void> {
  const workspace = { uuid: 'w1' as WorkspaceUuid, url: 'w1', mode } as unknown as WorkspaceInfoWithStatus
  await worker.doWorkspaceOperation(ctx, workspace, {})
}

describe('the Deleted event is the point of no return', () => {
  beforeEach(() => {
    updateWorkspaceInfo.mockReset()
  })

  it('is sent once the workspace is actually purged', async () => {
    const { events, worker, cleanup } = workerFor('pending-deletion')

    await run('pending-deletion', worker)

    expect(cleanup).toHaveBeenCalled()
    expect(events.map((e) => e.type)).toEqual([QueueWorkspaceEvent.Deleted])
  })

  it('is not sent while the workspace is only read-only and can still be called off', async () => {
    const { events, worker } = workerFor('active')

    await run('active', worker)

    expect(events).toHaveLength(0)
  })

  it('is not sent on archiving - an archived workspace comes back with unarchive', async () => {
    for (const mode of ['archiving-pending-backup', 'archiving-clean'] as WorkspaceMode[]) {
      const { events, worker } = workerFor(mode)

      await run(mode, worker)

      expect(events.map((e) => e.type)).not.toContain(QueueWorkspaceEvent.Deleted)
    }
  })

  it('is not sent when the purge itself failed: the data is still there', async () => {
    const { events, worker, cleanup } = workerFor('pending-deletion')
    cleanup.mockRejectedValue(new Error('db is down'))

    await run('pending-deletion', worker)

    expect(events).toHaveLength(0)
  })
})
