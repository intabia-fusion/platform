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

import { generateId, MeasureMetricsContext, type WorkspaceUuid } from '@hcengineering/core'
import { type ConsumerHandle, type PlatformQueue } from '@hcengineering/server-core'
import { Kafka } from 'kafkajs'
import { createPlatformQueue, parseQueueConfig } from '..'
import { REDPANDA_START_TIMEOUT, startRedpanda, type TestBroker } from './redpanda'

jest.setTimeout(60000)
const testCtx = new MeasureMetricsContext('test', {})
const ws = 'ws' as WorkspaceUuid

type Kind = 'single' | 'batch'

async function waitFor (what: string, cond: () => boolean, timeoutMs = 20000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

function consume (
  queue: PlatformQueue,
  kind: Kind,
  topic: string,
  groupId: string,
  received: string[],
  options: Record<string, any>
): ConsumerHandle {
  const opts = { retryDelay: 50, maxRetryDelay: 1, fromBegining: true, missingTopicPollMs: 500, ...options }
  if (kind === 'batch') {
    return queue.createBatchConsumer<string>(
      testCtx,
      topic,
      groupId,
      async (_ctx, msgs) => {
        received.push(...msgs.map((m) => m.value))
      },
      { batchSize: 10, batchTimeout: 100, ...opts }
    )
  }
  return queue.createConsumer<string>(
    testCtx,
    topic,
    groupId,
    async (_ctx, msg) => {
      received.push(msg.value)
    },
    opts
  )
}

describe.each([true, false])('regional queue (auto create topics: %s)', (autoCreateTopics) => {
  let broker: TestBroker
  let queue: PlatformQueue
  let postfix: string

  beforeAll(async () => {
    broker = await startRedpanda({ autoCreateTopics })
  }, REDPANDA_START_TIMEOUT)

  afterAll(async () => {
    await broker?.container.stop()
  })

  // Own region is 'own', so a bare-topic region ('') is a distinct, explicit target.
  beforeEach(() => {
    postfix = '-' + generateId()
    queue = createPlatformQueue(parseQueueConfig(broker.brokers + ';' + postfix, 'test' + postfix, 'own'))
  })

  afterEach(async () => {
    await queue.shutdown()
  })

  async function listTopics (): Promise<string[]> {
    const admin = new Kafka({ brokers: [broker.brokers] }).admin()
    await admin.connect()
    try {
      return await admin.listTopics()
    } finally {
      await admin.disconnect()
    }
  }

  it('createTopic with regions creates the topic in each region, own region by default', async () => {
    await queue.createTopic('ct', 1, ['', 'eu'])
    await queue.createTopic('ct-own', 1)
    const topics = await listTopics()
    expect(topics).toEqual(expect.arrayContaining(['ct' + postfix, 'eu.ct' + postfix, 'own.ct-own' + postfix]))
  })

  it('getProducer writes to the region topic, own region by default', async () => {
    await queue.createTopic('p', 1, ['own', 'eu', ''])
    const got: Record<string, string[]> = { own: [], eu: [], '': [] }
    for (const r of Object.keys(got)) {
      consume(queue, 'single', 'p', 'g-' + (r === '' ? 'bare' : r), got[r], { regions: [r] })
    }
    await queue.getProducer<string>(testCtx, 'p').send(testCtx, ws, ['to-own'])
    await queue.getProducer<string>(testCtx, 'p', 'eu').send(testCtx, ws, ['to-eu'])
    await queue.getProducer<string>(testCtx, 'p', '').send(testCtx, ws, ['to-bare'])

    await waitFor('all regions', () => Object.values(got).every((it) => it.length > 0))
    expect(got).toEqual({ own: ['to-own'], eu: ['to-eu'], '': ['to-bare'] })
  })

  describe.each(['single', 'batch'] as const)('%s consumer', (kind) => {
    it('one consumer receives the topic of every listed region', async () => {
      await queue.createTopic('all', 1, ['', 'eu', 'us'])
      const received: string[] = []
      consume(queue, kind, 'all', 'g', received, { regions: ['', 'eu', 'us'] })
      for (const r of ['', 'eu', 'us']) {
        await queue.getProducer<string>(testCtx, 'all', r).send(testCtx, ws, ['m-' + r])
      }

      await waitFor('3 messages', () => received.length === 3)
      expect(received.sort()).toEqual(['m-', 'm-eu', 'm-us'])
    })

    it('consumes present regions while one is missing and picks it up once created', async () => {
      await queue.createTopic('part', 1, [''])
      const received: string[] = []
      consume(queue, kind, 'part', 'g', received, { regions: ['', 'eu'] })
      await queue.getProducer<string>(testCtx, 'part', '').send(testCtx, ws, ['m-bare'])
      await waitFor('present region', () => received.includes('m-bare'))

      await queue.createTopic('part', 1, ['eu'])
      await queue.getProducer<string>(testCtx, 'part', 'eu').send(testCtx, ws, ['m-eu'])
      await waitFor('late region', () => received.includes('m-eu'))
      expect(received.sort()).toEqual(['m-bare', 'm-eu'])
    })

    it('waits while no regional topic exists yet', async () => {
      const received: string[] = []
      consume(queue, kind, 'late', 'g', received, { regions: ['eu'] })
      await new Promise((resolve) => setTimeout(resolve, 1000))

      await queue.createTopic('late', 1, ['eu'])
      await queue.getProducer<string>(testCtx, 'late', 'eu').send(testCtx, ws, ['m'])
      await waitFor('message', () => received.length === 1)
    })

    it('own-region consumer waits for a topic created after it started', async () => {
      const received: string[] = []
      consume(queue, kind, 'late-own', 'g', received, {})
      await new Promise((resolve) => setTimeout(resolve, 1000))

      await queue.createTopic('late-own', 1)
      await queue.getProducer<string>(testCtx, 'late-own').send(testCtx, ws, ['m'])
      await waitFor('message', () => received.length === 1)
    })

    it('an empty region list consumes the own region', async () => {
      await queue.createTopic('empty', 1)
      const received: string[] = []
      consume(queue, kind, 'empty', 'g', received, { regions: [] })
      await queue.getProducer<string>(testCtx, 'empty').send(testCtx, ws, ['m'])
      await waitFor('message', () => received.length === 1)
    })
  })

  it('regional consumers sharing a group name on different topics both get their messages', async () => {
    await queue.createTopic(['ta', 'tb'], 1, [''])
    const a: string[] = []
    const b: string[] = []
    consume(queue, 'batch', 'ta', 'shared', a, { regions: [''] })
    consume(queue, 'batch', 'tb', 'shared', b, { regions: [''] })
    await queue.getProducer<string>(testCtx, 'ta', '').send(testCtx, ws, ['a'])
    await queue.getProducer<string>(testCtx, 'tb', '').send(testCtx, ws, ['b'])

    await waitFor('both topics', () => a.length === 1 && b.length === 1)
  })

  it('a regional consumer resumes from the committed offset after restart', async () => {
    await queue.createTopic('resume', 1, [''])
    const producer = queue.getProducer<string>(testCtx, 'resume', '')

    const first: string[] = []
    const c1 = consume(queue, 'single', 'resume', 'g', first, { regions: [''] })
    await producer.send(testCtx, ws, ['m1'])
    await waitFor('first message', () => first.length === 1)
    await c1.close()

    await producer.send(testCtx, ws, ['m2'])
    const second: string[] = []
    consume(queue, 'single', 'resume', 'g', second, { regions: [''] })
    await waitFor('second message', () => second.length === 1)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(second).toEqual(['m2'])
  })
})
