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

import os from 'os'
import { setMetadata } from '@hcengineering/platform'
import serverClient from '@hcengineering/server-client'
import { initStatisticsContext } from '@hcengineering/server-core'
import serverToken from '@hcengineering/server-token'

import { createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import { newMetrics } from '@hcengineering/core'
import { join } from 'path'
import config from './config'
import { registerLoaders } from './loaders'
import { createTranscriptionProvider, TranscriptionConfig, TranscriptionOptions } from './transcription'
import { ClisrClient, createCallbackClient } from '@intabiafusion/clisr'

export const startClient = async (): Promise<void> => {
  setMetadata(serverToken.metadata.Secret, config.ServerSecret)
  setMetadata(serverToken.metadata.Service, 'ai-bot-service')
  setMetadata(serverClient.metadata.UserAgent, config.ServiceID)
  setMetadata(serverClient.metadata.Endpoint, config.AccountsURL)

  registerLoaders()

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
  ctx.info('AI Bot Client Service started', { firstName: config.FirstName, lastName: config.LastName })

  const transcriptionConfig: TranscriptionConfig = {
    provider: config.SttProvider,
    url: config.SttUrl,
    apiKey: config.SttApiKey,
    model: config.SttModel,
    vadRmsThreshold: config.VadRmsThreshold,
    vadSpeechRatioThreshold: config.VadSpeechRatioThreshold
  }

  ctx.info('Transcription config', {
    provider: transcriptionConfig.provider,
    url: transcriptionConfig.url,
    vadRmsThreshold: transcriptionConfig.vadRmsThreshold,
    vadSpeechRatioThreshold: transcriptionConfig.vadSpeechRatioThreshold
  })

  const methods: Record<string, ClisrClient['binaryHandler']> = {}

  const client = await createCallbackClient(ctx, config.ServerUrl, config.ApiToken, {
    clientHost: `ai-bot-client@${os.hostname()}`,
    binaryExecutor: async (ctx, method, data, headers) => {
      const handler = methods[method]
      if (handler === undefined) {
        throw new Error(`No handler for method ${method}`)
      }
      return await handler(ctx, method, data, headers)
    }
  })

  try {
    const provider = createTranscriptionProvider(ctx, transcriptionConfig)

    methods.transcribe = async (ctx, method, data, headers) => {
      const options: TranscriptionOptions = headers?.options ?? {}
      // OGG/Opus audio format - pass directly to provider
      return await provider.transcribe(Buffer.from(data), options)
    }
    // Inform aibot client is enabled for transcriptions
    await client.request('transcription', [true])
  } catch (err: any) {
    ctx.warn('Failed to create transcription provider', { error: err.message })
  }

  const onClose = (): void => {
    void client.close()
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
