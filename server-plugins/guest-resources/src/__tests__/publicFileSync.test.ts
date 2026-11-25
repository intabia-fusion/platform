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

import { PublicFileSync } from '../publicFileSync'
import { PublicFileAccessError } from '@hcengineering/datalake'
import { type WorkspaceUuid } from '@hcengineering/core'

const workspace = '11111111-1111-4111-8111-111111111111' as WorkspaceUuid
function fixture (): any {
  const state = { revision: 1, revoked: false, blobs: ['old', 'kept'] }
  const source = { links: jest.fn(async () => ['link']), files: jest.fn(async () => ['kept', 'new']) }
  const client = {
    state: jest.fn(async () => ({ ...state, blobs: [...state.blobs] })),
    replace: jest.fn(async (_ws, _id, revision, blobs) => {
      Object.assign(state, { revision, blobs })
    }),
    revoke: jest.fn(async () => {
      state.revoked = true
      state.blobs = []
    }),
    activeLinks: jest.fn(async () => ['link'])
  }
  const report = jest.fn()
  const sync = new PublicFileSync(workspace, client, source, report)
  return { state, source, client, report, sync }
}
it('closes removed files synchronously and publishes additions on a later full reconciliation', async () => {
  const { state, client, sync } = fixture()
  await sync.sync('link', true)
  expect(state.blobs).toEqual(['kept'])
  expect(client.replace).toHaveBeenCalledWith(workspace, 'link', 2, ['kept'])
  await sync.sync('link')
  expect(state.blobs).toEqual(['kept', 'new'])
  await sync.close()
})
it('does not write a registry for an unchanged set or an addition-only restriction', async () => {
  const { source, client, sync } = fixture()
  source.files.mockResolvedValue(['old', 'kept', 'new'])
  await sync.sync('link', true)
  expect(client.replace).not.toHaveBeenCalled()
  await sync.close()
})
it('propagates a failed reduction and does not report success', async () => {
  const { client, sync } = fixture()
  client.replace.mockRejectedValue(new PublicFileAccessError(503))
  await expect(sync.sync('link', true)).rejects.toMatchObject({ status: 503 })
  await sync.close()
})
it('revokes missing or invalid links and never restores an already revoked id', async () => {
  const { state, source, client, sync } = fixture()
  source.files.mockResolvedValue(undefined)
  await sync.sync('link', true)
  expect(client.revoke).toHaveBeenCalledWith(workspace, 'link', 2)
  source.files.mockResolvedValue(['file'])
  await sync.sync('link')
  expect(state.revoked).toBe(true)
  expect(client.replace).not.toHaveBeenCalled()
  await sync.close()
})
it('reads revision before source and recollects after a concurrent revision conflict', async () => {
  const { client, source, sync } = fixture()
  const events: string[] = []
  client.state.mockImplementation(async () => {
    events.push('state')
    return { revision: events.length, blobs: [], revoked: false }
  })
  source.files.mockImplementation(async () => {
    events.push('source')
    return ['file']
  })
  client.replace.mockRejectedValueOnce(new PublicFileAccessError(409))
  await sync.sync('link')
  expect(events).toEqual(['state', 'source', 'state', 'source'])
  expect(client.replace).toHaveBeenCalledTimes(2)
  await sync.close()
})
it('limits revision conflicts to three requests', async () => {
  const { client, sync } = fixture()
  client.replace.mockRejectedValue(new PublicFileAccessError(409))
  await expect(sync.sync('link')).rejects.toMatchObject({ status: 409 })
  expect(client.replace).toHaveBeenCalledTimes(3)
  await sync.close()
})
it('recovers a missed addition from persisted source links after restart', async () => {
  const { client, source, state, sync } = fixture()
  await sync.close()
  const restarted = new PublicFileSync(workspace, client, source, () => {})
  await restarted.tick()
  expect(state.blobs).toEqual(['kept', 'new'])
  await restarted.close()
})
it('recovers a missed deletion from registered links when the source record is gone', async () => {
  const { source, state, sync } = fixture()
  source.links.mockResolvedValue([])
  source.files.mockResolvedValue(undefined)
  await sync.tick()
  expect(state.revoked).toBe(true)
  await sync.close()
})
it('backs off failures and stops its timer on close', async () => {
  jest.useFakeTimers()
  jest.spyOn(Math, 'random').mockReturnValue(0.5)
  const { client, report, sync } = fixture()
  client.activeLinks.mockRejectedValue(new PublicFileAccessError(503))
  sync.start()
  await jest.advanceTimersByTimeAsync(1000)
  expect(report).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1999)
  expect(report).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1)
  expect(report).toHaveBeenCalledTimes(2)
  await sync.close()
  await jest.advanceTimersByTimeAsync(300000)
  expect(report).toHaveBeenCalledTimes(2)
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it('wakes the worker for a new addition without waiting for a complete scan', async () => {
  jest.useFakeTimers()
  jest.spyOn(Math, 'random').mockReturnValue(0.5)
  const { source, sync, state } = fixture()
  source.links.mockResolvedValue([])
  sync.start()
  sync.enqueue(['link'])
  await jest.advanceTimersByTimeAsync(1)
  expect(state.blobs).toEqual(['kept', 'new'])
  await sync.close()
  jest.useRealTimers()
  jest.restoreAllMocks()
})
