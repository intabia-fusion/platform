//
// Copyright © 2024-2025 Hardcore Engineering Inc.
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
import cors from 'cors'
import express from 'express'
import { setMetadata } from '@hcengineering/platform'
import serverClient, { withRetry } from '@hcengineering/server-client'
import {
  ConsumerControl,
  ConsumerHandle,
  ConsumerMessage,
  getDeadletterTopic,
  initStatisticsContext,
  QueueTopic,
  QueueWorkspaceEvent,
  QueueWorkspaceMessage
} from '@hcengineering/server-core'
import serverToken, { generateToken } from '@hcengineering/server-token'

import { getClient as getAccountClient } from '@hcengineering/account-client'
import { AIEventRequest } from '@hcengineering/ai-bot'
import { createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import { newMetrics, type SocialId, type WorkspaceUuid } from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { join } from 'path'
import { updateDeepgramBilling } from './billing'
import config from './config'
import { AIControl } from './controller'
import { registerLoaders } from './loaders'
import { createServer } from './server/server'
import { TranscriptionQueueTask } from './transcription'
import { createTranscriptionsSupport } from './transcriptions'
import { TranscriptionTask } from './types'
import { getAccountUuid } from './utils/account'
import { ClisrServer } from '@intabiafusion/clisr'
import { QueueMeetingEvent, QueueMeetingMessage } from '@hcengineering/love'

export const startQueue = async (): Promise<void> => {
  setMetadata(serverToken.metadata.Secret, config.ServerSecret)
  setMetadata(serverToken.metadata.Service, 'ai-bot-service')
  setMetadata(serverClient.metadata.UserAgent, config.ServiceID)
  setMetadata(serverClient.metadata.Endpoint, config.AccountsURL)

  registerLoaders()

  // Check if we are using queue mode
  const queue = getPlatformQueue(QueueTopic.AIQueue)

  const ctx = initStatisticsContext('ai-bot-service', {
    factory: () =>
      createOpenTelemetryMetricsContext(
        'ai-bot-service',
        {},
        {},
        newMetrics(),
        new SplitLogger('ai-bot-service', {
          root: join(process.cwd(), 'logs'),
          enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
        })
      )
  })
  ctx.info('AI Bot Queue Service started', { firstName: config.FirstName, lastName: config.LastName })

  const personUuid = await withRetry(
    async () => await getAccountUuid(ctx),
    (_, attempt) => attempt >= 5,
    5000
  )()

  if (personUuid === undefined) {
    ctx.error('AI Bot Service failed to start. No person found.')
    process.exit()
  }
  ctx.info('AI person uuid', { personUuid })

  const socialIds: SocialId[] = await getAccountClient(
    config.AccountsURL,
    generateToken(personUuid, undefined, { service: 'aibot' })
  ).getSocialIds()

  // Create AIControl first
  const aiControl = new AIControl(personUuid, socialIds, ctx)

  // Create Express app first
  const app = express()
  app.use(cors())

  // Create ClisrServer with the app
  const clisrServer = new ClisrServer(
    ctx,
    async (token) => token === config.ApiToken,
    '1.0',
    app,
    async (ctx, method, ops, session) => {
      if (method === 'transcription') {
        session.options.transcription = ops[0] as boolean
      }
      if (method === 'llm') {
        session.options.llm = ops[0] as boolean
      }
      return {}
    }
  )

  // Initialize LLM provider with ClisrServer for server provider support
  aiControl.initLLM(clisrServer)

  // Setup server routes on the app
  createServer(aiControl, ctx, app)

  await clisrServer.start(ctx, config.Port)

  // Check and create bucket if missing.
  await aiControl.chunkStorageAdapter.make(ctx, {
    uuid: '' as WorkspaceUuid,
    url: ''
  })

  // Create a workspace consumer
  // Create queue consumer's
  //
  const workspaceConsumer = queue.createConsumer<QueueWorkspaceMessage>(
    ctx,
    QueueTopic.Workspace,
    'ai-bot',
    async (ctx, message, control) => {
      try {
        if (message.value.type === QueueWorkspaceEvent.Up) {
          await aiControl.connect(message.workspace)
        }
      } catch (err: any) {
        ctx.error('failed to handle operation', { error: err.message })
      }
    }
  )

  const aiEventConsumer = queue.createConsumer<AIEventRequest>(
    ctx,
    QueueTopic.AIQueue,
    'ai-bot',
    async (ctx, message, control) => {
      try {
        await aiControl.processEvent(message.workspace, [message.value], control)
      } catch (err: any) {
        ctx.error('failed to handle ai event', { error: err.message })
        setTimeout(() => {
          console.error('Retrying after error...')
        }, 1000)
      }
    }
  )

  const loveConsumer = queue.createConsumer<QueueMeetingMessage>(
    ctx,
    QueueTopic.LoveQueue,
    'ai-bot',
    async (ctx, msg) => {
      switch (msg.value.type) {
        case QueueMeetingEvent.started: {
          const wsClient = await aiControl.getWorkspaceClient(msg.workspace)
          await wsClient?.meetingStarted(msg.value.meetingId)
          break
        }
        case QueueMeetingEvent.finished: {
          const wsClient = await aiControl.getWorkspaceClient(msg.workspace)
          await wsClient?.meetingFinished(msg.value.meetingId)
          break
        }
      }
    }
  )

  // Set up transcription queue producer
  const transcriptionProducer = queue.getProducer<TranscriptionTask>(ctx, QueueTopic.TranscriptionQueue)
  if (transcriptionProducer !== undefined) {
    aiControl.setTranscriptionProducer(transcriptionProducer)
  }

  const transcriptionDeadLetterProducer = queue.getProducer<{
    task: TranscriptionQueueTask
    error: string
    errorType: string
  }>(ctx, getDeadletterTopic(QueueTopic.TranscriptionQueue))

  let transcriptionConsumer: ConsumerHandle | undefined
  const transcriptionHandler = await createTranscriptionsSupport(
    ctx,
    aiControl,
    transcriptionDeadLetterProducer,
    clisrServer
  )

  if (transcriptionHandler !== undefined) {
    const handleMsg = async (message: ConsumerMessage<TranscriptionTask>, control?: ConsumerControl): Promise<void> => {
      const task = message.value as unknown as TranscriptionQueueTask
      const workspace = message.workspace

      try {
        // Pass control to processTask for heartbeat during retries
        await transcriptionHandler.processTask(ctx, workspace, task, control)
      } catch (err: any) {
        ctx.error('Failed to process transcription task', { error: err.message, workspace, blobId: task.blobId })
      }
    }
    if (config.SttProcessingBatch === 1) {
      // Set up queue consumer for transcription tasks
      transcriptionConsumer = queue.createConsumer<TranscriptionTask>(
        ctx,
        QueueTopic.TranscriptionQueue,
        'ai-bot-transcription',
        async (ctx, message, control) => {
          await handleMsg(message, control)
        }
      )
    } else {
      // Set up queue consumer for transcription tasks
      transcriptionConsumer = queue.createBatchConsumer<TranscriptionTask>(
        ctx,
        QueueTopic.TranscriptionQueue,
        'ai-bot-transcription',
        async (ctx, messages, control) => {
          const i1 = setInterval(() => {
            void control?.heartbeat()
          }, 1000)
          try {
            await Promise.all(messages.map((message) => handleMsg(message, control)))
          } finally {
            // Just in case
            clearInterval(i1)
          }
        },
        {
          batchSize: config.SttProcessingBatch
        }
      )
    }
  }

  let billingIntervalId: any | undefined
  if (config.BillingUrl !== '') {
    billingIntervalId = setInterval(
      () => {
        try {
          void updateDeepgramBilling(ctx)
        } catch {}
      },
      config.DeepgramPollIntervalMinutes * 60 * 1000
    )
    try {
      void updateDeepgramBilling(ctx)
    } catch {}
  }

  const onClose = (): void => {
    void workspaceConsumer?.close()
    void aiEventConsumer?.close()
    void transcriptionConsumer?.close()
    void transcriptionProducer?.close()
    void transcriptionDeadLetterProducer?.close()
    void loveConsumer?.close()
    if (billingIntervalId !== undefined) {
      clearInterval(billingIntervalId)
    }
    void aiControl.close()
    void clisrServer.close().then(() => process.exit())
  }

  process.on('SIGINT', onClose)
  process.on('SIGTERM', onClose)
  process.on('uncaughtException', (e: Error) => {
    console.error(e)
  })
  process.on('unhandledRejection', (e: Error) => {
    console.error(e)
  })
}
