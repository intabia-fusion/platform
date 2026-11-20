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

import { PublicFileClients, PublicFileClientsBusy } from '../publicFileClients'

const wsIds = { uuid: 'workspace' as any, url: 'test' }
let pools: PublicFileClients[] = []
function fixture (limits = { maxClients: 2, idleMs: 1000, maxAgeMs: 5000 }): { pool: PublicFileClients, open: jest.Mock, close: jest.Mock } {
  const close = jest.fn(async () => {})
  const open = jest.fn(async () => ({ client: { close } as any, wsIds }))
  const pool = new PublicFileClients(open, limits)
  pools.push(pool)
  return { pool, open, close }
}
beforeEach(() => { jest.useFakeTimers() })
afterEach(async () => {
  for (const pool of pools) pool.close()
  pools = []
  await Promise.resolve()
  jest.useRealTimers()
})
it('opens one client for 20 concurrent files of the same token', async () => {
  const { pool, open, close } = fixture()
  const requests = await Promise.all(Array.from({ length: 20 }, async () => await pool.acquire('token')))
  expect(open).toHaveBeenCalledTimes(1)
  for (const request of requests) request.release()
  const next = await pool.acquire('token')
  expect(open).toHaveBeenCalledTimes(1)
  expect(close).not.toHaveBeenCalled()
  next.release()
})
it('does not share clients across tokens', async () => {
  const { pool, open } = fixture()
  const a = await pool.acquire('a')
  const b = await pool.acquire('b')
  expect(open.mock.calls).toEqual([['a'], ['b']])
  a.release(); b.release()
})
it('bounds active and pending clients instead of opening extra connections', async () => {
  const { pool, open } = fixture()
  const a = await pool.acquire('a')
  const b = await pool.acquire('b')
  await expect(pool.acquire('c')).rejects.toBeInstanceOf(PublicFileClientsBusy)
  expect(open).toHaveBeenCalledTimes(2)
  a.release(); b.release()
})
it('evicts an idle client when the pool is full', async () => {
  const { pool, open, close } = fixture({ maxClients: 1, idleMs: 1000, maxAgeMs: 5000 })
  const a = await pool.acquire('a'); a.release()
  const b = await pool.acquire('b')
  expect(close).toHaveBeenCalledTimes(1)
  expect(open).toHaveBeenCalledTimes(2)
  b.release()
})
it('closes idle clients after the timeout', async () => {
  const { pool, close } = fixture()
  const request = await pool.acquire('a'); request.release()
  await jest.advanceTimersByTimeAsync(1000)
  expect(close).toHaveBeenCalledTimes(1)
})
it('keeps active clients alive until release, then retires old models', async () => {
  const { pool, close, open } = fixture()
  const request = await pool.acquire('a')
  await jest.advanceTimersByTimeAsync(5000)
  expect(close).not.toHaveBeenCalled()
  await expect(pool.acquire('a')).rejects.toBeInstanceOf(PublicFileClientsBusy)
  request.release()
  await Promise.resolve()
  const next = await pool.acquire('a')
  expect(close).toHaveBeenCalledTimes(1)
  expect(open).toHaveBeenCalledTimes(2)
  next.release()
})
it('retries failed opens and discards broken clients', async () => {
  const { pool, open, close } = fixture()
  open.mockRejectedValueOnce(new Error('connect failed'))
  await expect(pool.acquire('a')).rejects.toThrow('connect failed')
  const request = await pool.acquire('a'); request.release(true)
  await Promise.resolve()
  const next = await pool.acquire('a')
  expect(open).toHaveBeenCalledTimes(3)
  expect(close).toHaveBeenCalledTimes(1)
  next.release()
})
it('closes the pool without interrupting an active authorization check', async () => {
  const { pool, close } = fixture()
  const request = await pool.acquire('a')
  pool.close()
  expect(close).not.toHaveBeenCalled()
  await expect(pool.acquire('b')).rejects.toBeInstanceOf(PublicFileClientsBusy)
  request.release(); request.release()
  await Promise.resolve()
  expect(close).toHaveBeenCalledTimes(1)
})
