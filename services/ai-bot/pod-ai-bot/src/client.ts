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
import { type MeasureContext, newMetrics } from '@hcengineering/core'
import { join } from 'path'
import config from './config'
import { registerLoaders } from './loaders'
import { createTranscriptionProvider, TranscriptionConfig, TranscriptionOptions } from './transcription'
import { ClisrClient, createCallbackClient } from '@intabiafusion/clisr'
import { createLLMFromConfig, type LLMRequest } from './llms'

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

  let transcriptionEnabled = false
  let llmEnabled = false

  // Create LLM provider for client mode
  const llmProvider = createLLMFromConfig(ctx)

  // Build LLM request handler
  async function handleLLMRequest (ctx: MeasureContext, args: any[]): Promise<any> {
    if (llmProvider === undefined) {
      throw new Error('LLM provider is not configured')
    }
    const request = args[0] as LLMRequest
    switch (request.method) {
      case 'translateHtml':
        return await llmProvider.translateHtml(ctx, request.workspace, request.html, request.lang)
      case 'summarizeMessages':
        return await llmProvider.summarizeMessages(ctx, request.workspace, request.messages, request.lang)
      case 'createChatCompletion':
        return await llmProvider.createChatCompletion(
          ctx,
          request.workspace,
          request.message,
          request.user,
          request.history,
          request.skipCache,
          request.reason
        )
      case 'createChatCompletionWithTools':
        // Tools are not fully serializable, pass empty tools array
        return await llmProvider.createChatCompletionWithTools(
          [] as any,
          request.message,
          request.contextMode,
          request.assistantMemory,
          request.userMemory,
          request.sharedContext,
          request.user,
          ctx,
          request.workspace,
          request.history,
          request.skipCache,
          request.reason
        )
      case 'requestSummary':
        return await llmProvider.requestSummary(ctx, request.workspace, request.personMemory, request.history)
      case 'countTokens':
        return llmProvider.countTokens(request.messages)
      default:
        throw new Error(`Unknown LLM method: ${(request as any).method}`)
    }
  }

  const client = await createCallbackClient(ctx, config.ServerUrl, config.ApiToken, {
    clientHost: `ai-bot-client@${os.hostname()}`,
    callback: async (ctx, task, args) => {
      if (task === 'llm') {
        return await handleLLMRequest(ctx, args)
      }
      throw new Error(`Unknown task: ${task}`)
    },
    binaryExecutor: async (ctx, method, data, headers) => {
      const handler = methods[method]
      if (handler === undefined) {
        throw new Error(`No handler for method ${method}`)
      }
      return await handler(ctx, method, data, headers)
    },
    onConnect: async (event) => {
      if (transcriptionEnabled) {
        await client.request('transcription', [true])
      }
      if (llmEnabled) {
        await client.request('llm', [true])
      }
    }
  })

  // Register LLM capability
  if (llmProvider !== undefined) {
    llmEnabled = true
    await client.request('llm', [true])
    ctx.info('LLM provider registered with server', { provider: config.LLMProvider })
  }

  if (transcriptionConfig.provider !== undefined && transcriptionConfig.provider !== '') {
    try {
      const provider = createTranscriptionProvider(ctx, transcriptionConfig)

      methods.transcribe = async (ctx, method, data, headers) => {
        const options: TranscriptionOptions = headers?.options ?? {}
        // OGG/Opus audio format - pass directly to provider
        return await provider.transcribe(Buffer.from(data), options)
      }
      transcriptionEnabled = true
      // Inform aibot client is enabled for transcriptions
      await client.request('transcription', [true])
    } catch (err: any) {
      ctx.warn('Failed to create transcription provider', { error: err.message })
    }
  } else {
    ctx.info('Transcription provider not configured, skipping')
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
