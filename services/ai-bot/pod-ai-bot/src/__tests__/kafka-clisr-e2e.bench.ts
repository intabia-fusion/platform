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

// The whole stt-worker path on a real broker: Kafka -> batch consumer -> ServerProvider ->
// clisr -> worker -> back, swept over batch size and clisr capacity. Own topic and group per run, so the stand's topics stay untouched.

// Stub config so importing the provider chain does not run the env-validating IIFE.
jest.mock('../config', () => ({ __esModule: true, default: {} }))

/* eslint-disable import/first */
import { MeasureMetricsContext, newMetrics } from '@hcengineering/core'
import { createPlatformQueue, parseQueueConfig } from '@hcengineering/kafka'
import type { PlatformQueue } from '@hcengineering/server-core'
import { kafkaBrokers } from '@hcengineering/test-containers'
import { runScenario, type Run } from './kafka-clisr-scenario'
/* eslint-enable import/first */

describe('bench: kafka -> clisr -> worker', () => {
  const ctx = new MeasureMetricsContext('queue-e2e', {}, {}, newMetrics())
  let brokers: string
  let queue: PlatformQueue

  beforeAll(async () => {
    brokers = await kafkaBrokers()
    queue = createPlatformQueue(parseQueueConfig(brokers, 'clisr-e2e', ''))
  })

  afterAll(async () => {
    await queue.shutdown()
  })

  jest.setTimeout(600000)

  it('shows what queue batch size and clisr capacity each buy', async () => {
    const tasks = 200
    const workMs = 1
    const runs: Run[] = []
    for (const batchSize of [1, 8, 32]) {
      for (const capacity of [1, 4]) {
        runs.push(await runScenario(ctx, queue, { tasks, batchSize, capacity, workMs }))
      }
    }
    console.info(`\ntasks=${tasks}, work=${workMs}ms, brokers=${brokers}`)
    console.table(runs)
  })
})
