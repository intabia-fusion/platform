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

import { type BlobDB, RetryDB } from '../datalake/db'
import { createStorageCleaner, StorageCleanup } from '../cleanup'

const ctx: any = { info: jest.fn(), error: jest.fn() }

it('does not block HTTP startup while the cleanup consumer waits for Kafka', async () => {
  const consumer = {
    close: jest.fn().mockResolvedValue(undefined),
    waitReady: jest.fn(() => new Promise<void>(() => {}))
  }
  const producer = { close: jest.fn().mockResolvedValue(undefined) }
  const queue = { getProducer: () => producer, createConsumer: () => consumer }
  const cleaner = createStorageCleaner(ctx, queue as any, new StorageCleanup({} as any, []))
  expect(cleaner.close).toBeInstanceOf(Function)
  expect(consumer.waitReady).not.toHaveBeenCalled()
  await cleaner.close()
  expect(consumer.close).toHaveBeenCalledTimes(1)
  expect(producer.close).toHaveBeenCalledTimes(1)
})

it('never retries a data-lock callback that may consume a stream or delete S3 data', async () => {
  const operation = jest.fn().mockRejectedValue(new Error('stream already consumed'))
  const db = { withDataLock: async (_ctx: any, _id: any, operation: any) => await operation({}) } as unknown as BlobDB
  const retry = new RetryDB(db, { retries: 5 })
  await expect(retry.withDataLock(ctx, { hash: 'hash', location: 'eu' } as any, operation)).rejects.toThrow(
    'stream already consumed'
  )
  expect(operation).toHaveBeenCalledTimes(1)
})

it('does not accept an invalid cleanup action', async () => {
  const cleanup = new StorageCleanup({} as any, [])
  await expect(cleanup.handle(ctx, { jobId: 'job', action: 'purge', requestedAt: 0 } as any)).rejects.toThrow(
    'Invalid cleanup command'
  )
})
