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

import { TxOperations } from '@hcengineering/core'
import { guestId } from '@hcengineering/guest'
import { guestOperation } from '../migration'

const endpoint = process.env.STORAGE_CONFIG
let update: jest.SpyInstance
let create: jest.SpyInstance
beforeEach(() => {
  process.env.STORAGE_CONFIG = 'datalake|http://datalake:4030'
  update = jest.spyOn(TxOperations.prototype, 'updateDoc').mockResolvedValue({} as any)
  create = jest.spyOn(TxOperations.prototype, 'createDoc').mockResolvedValue('marker' as any)
})
afterEach(() => {
  jest.restoreAllMocks()
  if (endpoint === undefined) delete process.env.STORAGE_CONFIG
  else process.env.STORAGE_CONFIG = endpoint
})
const source = (findAll: jest.Mock): any => ({ findAll })
it('registers existing links in bounded pages before recording completion', async () => {
  const links = Array.from({ length: 11 }, (_, i) => ({
    _id: String(i).padStart(2, '0'),
    _class: 'link',
    space: 'space',
    revokable: true
  }))
  const findAll = jest.fn().mockResolvedValueOnce(links.slice(0, 10)).mockResolvedValueOnce(links.slice(10))
  await guestOperation.upgrade(new Map(), async () => source(findAll), 'upgrade')
  expect(update).toHaveBeenCalledTimes(11)
  expect(findAll.mock.calls[1][1]._id).toEqual({ $gt: '09' })
  expect(create).toHaveBeenCalledTimes(1)
  expect(create.mock.invocationCallOrder[0]).toBeGreaterThan(update.mock.invocationCallOrder[10])
})
it('does not record completion after failure and retries all links safely', async () => {
  const findAll = jest.fn().mockResolvedValue([{ _id: 'link', _class: 'link', space: 'space', revokable: true }])
  update.mockRejectedValueOnce(new Error('registry unavailable'))
  await expect(guestOperation.upgrade(new Map(), async () => source(findAll), 'upgrade')).rejects.toThrow(
    'registry unavailable'
  )
  expect(create).not.toHaveBeenCalled()
  await guestOperation.upgrade(new Map(), async () => source(findAll), 'upgrade')
  expect(create).toHaveBeenCalledTimes(1)
})
it('does not mark disabled synchronization complete or repeat a completed migration', async () => {
  const client = jest.fn()
  process.env.STORAGE_CONFIG = 'minio|minio:9000?accessKey=minio&secretKey=minio'
  await guestOperation.upgrade(new Map(), client, 'upgrade')
  process.env.STORAGE_CONFIG = 'datalake|http://datalake:4030'
  await guestOperation.upgrade(new Map([[guestId, new Set(['public-file-access-v1'])]]), client, 'upgrade')
  expect(client).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
})
