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
import { MeasureContext, Ref, WorkspaceUuid } from '@hcengineering/core'
import config from './config'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createTranscriptionConsumer, SendToDeadLetterCallback, TranscriptionConsumer } from './transcription/consumer'
import { AIControl } from './controller'
import { Room } from '@hcengineering/love'
import { Person } from '@hcengineering/contact'
import { ChatMessage } from '@hcengineering/chunter'
import { PlatformQueueProducer } from '@hcengineering/server-core'
import { TranscriptionConfig, TranscriptionQueueTask } from './transcription/types'
import { ClisrServer } from '@intabiafusion/clisr'
import { createTranscriptionProvider } from './transcription'

export async function createTranscriptionsSupport (
  ctx: MeasureContext,
  aiControl: AIControl,
  transcriptionDeadLetterProducer?: PlatformQueueProducer<{
    task: TranscriptionQueueTask
    error: string
    errorType: string
  }>,
  server?: ClisrServer
): Promise<TranscriptionConsumer | undefined> {
  // Set up transcription configuration from environment
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

  const provider = createTranscriptionProvider(ctx, transcriptionConfig, server)

  try {
    if (config.DebugDir !== '' && config.DebugDir != null) {
      // We need to store chunk and transcription to testing file.
      if (!existsSync(config.DebugDir)) {
        await mkdir(config.DebugDir, { recursive: true })
      }
    }
    const transcriptionHandler = createTranscriptionConsumer(
      ctx,
      transcriptionConfig,
      provider,
      aiControl.chunkStorageAdapter,
      // Callback to get workspace storage info
      async (workspace: WorkspaceUuid) => {
        const wsClient = await aiControl.getWorkspaceClient(workspace)
        if (wsClient === undefined) {
          return undefined
        }
        return { wsIds: wsClient.wsIds }
      },
      async (
        ctx,
        workspace: WorkspaceUuid,
        roomName: string,
        participant: string,
        transcript: string,
        _startTimeSec: number,
        _endTimeSec: number
      ) => {
        const wsClient = await aiControl.getWorkspaceClient(workspace)
        if (wsClient === undefined) {
          ctx.error('Failed to get workspace client for sending transcript', { workspace })
          return
        }
        // Parse roomId from roomName (format: workspaceUuid_roomId)
        const parsed = roomName.split('_')
        const roomId = parsed[parsed.length - 1] as Ref<Room>

        // participant identity from LiveKit is Ref<Person> as string
        await wsClient.processLoveTranscript(ctx, transcript, participant as Ref<Person>, roomId)
      },
      // Callback to update/delete placeholder message
      async (ctx, workspace: WorkspaceUuid, roomName: string, messageId: string, text: string | null) => {
        const wsClient = await aiControl.getWorkspaceClient(workspace)
        if (wsClient === undefined) {
          ctx.error('Failed to get workspace client for updating message', { workspace })
          return false
        }
        return await wsClient.updateTranscriptionMessage(ctx, messageId as Ref<ChatMessage>, text)
      },
      // Callback to create message with timestamp (fallback when placeholder not found)
      async (
        ctx,
        workspace: WorkspaceUuid,
        roomId: string,
        participant: string,
        text: string,
        startTimeSec: number
      ) => {
        const wsClient = await aiControl.getWorkspaceClient(workspace)
        if (wsClient === undefined) {
          ctx.error('Failed to get workspace client for creating fallback message', { workspace })
          return false
        }

        // Get meeting start time to calculate absolute timestamp
        // startTimeSec is relative to meeting start
        const meetingMinutes = await wsClient.getMeetingMinutesByRoom(ctx, roomId as Ref<Room>)
        if (meetingMinutes === undefined) {
          ctx.error('Failed to get meeting minutes for fallback message', { workspace, roomId })
          return false
        }

        // Calculate absolute timestamp: meeting creation time + offset in seconds
        const timestamp = (meetingMinutes.createdOn ?? Date.now()) + startTimeSec * 1000

        return await wsClient.createTranscriptionMessageWithTimestamp(
          ctx,
          text,
          participant as Ref<Person>,
          roomId as Ref<Room>,
          timestamp
        )
      },
      // Callback to send failed tasks to dead letter queue
      (async (ctx, workspace, task, error, errorType) => {
        await transcriptionDeadLetterProducer?.send(ctx, workspace, [{ task, error, errorType }])
      }) as SendToDeadLetterCallback,
      config.DebugDir
    )

    if (!transcriptionHandler.isReady()) {
      ctx.warn('Transcription consumer not ready - check provider configuration', {
        provider: transcriptionConfig.provider
      })
    }
    return transcriptionHandler
  } catch (err: any) {
    ctx.info('Failed to create transcription consumer', { error: err.message })
  }
  return undefined
}
