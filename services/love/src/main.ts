//
// Copyright © 2024 Hardcore Engineering Inc.
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
import {
  getClient as getAccountClientRaw,
  isWorkspaceLoginInfo,
  type AccountClient
} from '@hcengineering/account-client'
import { createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import {
  MeasureContext,
  newMetrics,
  Ref,
  WorkspaceIds,
  WorkspaceUuid,
  readOnlyGuestAccountUuid
} from '@hcengineering/core'
import { MeetingMinutes, RecordingState, RoomMetadata, TranscriptionStatus } from '@hcengineering/love'
import { setMetadata } from '@hcengineering/platform'
import serverClient from '@hcengineering/server-client'

import { getPlatformQueue } from '@hcengineering/kafka'
import { initStatisticsContext, QueueTopic, StorageConfig, StorageConfiguration } from '@hcengineering/server-core'
import { storageConfigFromEnv } from '@hcengineering/server-storage'
import serverToken, { decodeToken, generateToken, Token } from '@hcengineering/server-token'
import cors from 'cors'
import express, { Response, type Request } from 'express'
import { IncomingHttpHeaders } from 'http'
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomAgentDispatch,
  RoomServiceClient,
  S3Upload,
  WebhookConfig,
  WebhookReceiver,
  type WebhookEvent
} from 'livekit-server-sdk'
import { join } from 'path'
import { updateLiveKitSessions } from './billing'
import config from './config'
import { LiveKitPollingService } from './polling'
import { getRecordingPreset } from './preset'
import { getS3UploadParams } from './storage'
import { WebhookProcessor } from './webhook'
import { WorkspaceClient } from './workspaceClient'
import { combineName } from '@hcengineering/contact'

const extractToken = (header: IncomingHttpHeaders): any => {
  try {
    return header.authorization?.slice(7) ?? ''
  } catch {
    return undefined
  }
}

/**
 * Recursively converts all BigInt values in an object to strings.
 * This is needed because JSON.stringify cannot handle BigInt values.
 */
function convertBigIntToString (obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }
  if (typeof obj === 'bigint') {
    return obj.toString()
  }
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString)
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigIntToString(value)
    }
    return result
  }
  return obj
}

function getAccountClient (token?: string): AccountClient {
  return getAccountClientRaw(config.AccountsURL, token)
}

export const main = async (): Promise<void> => {
  setMetadata(serverClient.metadata.Endpoint, config.AccountsURL)
  setMetadata(serverClient.metadata.UserAgent, config.ServiceID)
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, 'love')

  const storageConfigs: StorageConfiguration = storageConfigFromEnv()
  const s3StorageConfigs: StorageConfiguration | undefined =
    config.S3StorageConfig !== undefined ? storageConfigFromEnv(config.S3StorageConfig) : undefined

  const queue = getPlatformQueue('love-client')

  const ctx = initStatisticsContext('love', {
    factory: () =>
      createOpenTelemetryMetricsContext(
        'love',
        {},
        {},
        newMetrics(),
        new SplitLogger('love', {
          root: join(process.cwd(), 'logs'),
          enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
        })
      )
  })

  const storageConfig = storageConfigs.storages.find((it) => ['datalake', 's3'].includes(it.kind))
  const s3storageConfig = s3StorageConfigs?.storages.findLast((p) => p.kind === 's3')

  const app = express()
  const port = config.Port
  app.use(cors())
  app.use(express.raw({ type: 'application/webhook+json' }))
  app.use(express.json())

  const roomClient = new RoomServiceClient(config.LiveKitHost, config.ApiKey, config.ApiSecret)
  const egressClient = new EgressClient(config.LiveKitHost, config.ApiKey, config.ApiSecret)

  const webhookProcessor = new WebhookProcessor(ctx, roomClient, egressClient, storageConfig, s3storageConfig)

  const receivers = [new WebhookReceiver(config.ApiKey, config.ApiSecret)]

  if (config.LiveKitWebhookKey !== '' && config.LiveKitWebhookSecret !== '') {
    receivers.push(new WebhookReceiver(config.LiveKitWebhookKey, config.LiveKitWebhookSecret))
  }

  async function decodeEvent (req: Request): Promise<WebhookEvent> {
    for (const r of receivers) {
      try {
        return await r.receive(req.body, req.get('Authorization'))
      } catch (e) {
        // Ignore
      }
    }
    throw new Error('Failed to decode webhook event with all receivers')
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/webhook', async (req, res) => {
    try {
      const rawEvent: WebhookEvent = await decodeEvent(req)
      // Convert all BigInt values to strings to prevent serialization errors throughout the handler
      const event = convertBigIntToString(rawEvent) as typeof rawEvent

      if (event.room?.metadata != null && event.room?.metadata !== '') {
        try {
          const metadata = JSON.parse(event.room.metadata) as RoomMetadata
          if (metadata.projectKey != null && metadata.projectKey !== config.LiveKitProject) {
            ctx.info('Ignoring event from different project', { eventProjectKey: metadata.projectKey })
            return
          }
        } catch (err: any) {
          ctx.error('Failed to parse room metadata', { error: err, room: JSON.stringify(event?.room, null, 2) })
        }
      }

      // We need to filter not our events if projectKey is defined.

      await ctx.with('handle-webhook', {}, () => webhookProcessor.processEvent(event))
    } catch (e) {
      ctx.error('Failed to process webhook event', { error: e })
    } finally {
      res.status(200).send() // We should always say event is received
    }
  })

  function getRoomName (workspaceId: WorkspaceUuid, meetingId: Ref<MeetingMinutes>): string {
    return `${workspaceId}_${meetingId}`
  }

  function decodeMeetingToken (
    req: Request<any>,
    res: Response<any>
  ): { workspaceId?: WorkspaceUuid, meetingId?: Ref<MeetingMinutes> } {
    const meetingId: Ref<MeetingMinutes> = req.body.meetingId
    if (typeof meetingId !== 'string') {
      res.status(400).send()
      return {}
    }

    const workspaceId = getWorkspaceId(req)
    if (workspaceId === undefined) {
      res.status(401).send()
      return {}
    }
    return { meetingId, workspaceId }
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/getToken', async (req, res) => {
    const { meetingId, workspaceId } = decodeMeetingToken(req, res)
    if (meetingId == null || workspaceId == null) {
      return
    }

    const _id = req.body._id
    const participantName = req.body.participantName
    const roomName = getRoomName(workspaceId, meetingId)

    const room = await roomClient.listRooms([roomName])
    // TODO: Retry creation
    if (room === undefined || room.length === 0) {
      ctx.info('Creating room', { roomName })
      try {
        await roomClient.createRoom({
          metadata: JSON.stringify({ projectKey: config.LiveKitProject, workspaceId, meetingId }),
          name: roomName,
          agents: config.Agents.map((it) => new RoomAgentDispatch({ agentName: it }))
        })
      } catch (err: any) {
        console.error('Error creating room:', err)
      }
    }

    res.send(await createToken(roomName, _id, participantName))
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/guestToken', async (req, res) => {
    const { meetingId, workspaceId } = decodeMeetingToken(req, res)
    if (meetingId == null || workspaceId == null) {
      return
    }

    try {
      // We also need workspace info to generate guest token with proper workspace claims, so validate token and workspace access first
      const token = extractToken(req.headers)
      const wsLoginInfo = await getAccountClient(token).getLoginInfoByToken()
      if (!isWorkspaceLoginInfo(wsLoginInfo)) {
        res.status(401).send()
        return
      }
      const wsClient = await WorkspaceClient.create(workspaceId, ctx)
      try {
        const meetingDoc = await wsClient.findMeetingById(meetingId)
        if (meetingDoc === undefined) {
          res.status(404).send({ error: 'Meeting not found' })
          return
        }

        const workspaceUrl = wsLoginInfo.workspaceUrl ?? ''
        const guestToken = generateToken(
          readOnlyGuestAccountUuid,
          wsLoginInfo.workspace,
          { meetingId, workspaceUrl },
          config.ApiSecret
        )

        res.status(200).send({ token: guestToken })
      } finally {
        await wsClient.close()
      }
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/guestInfo', async (req, res) => {
    const guestToken = req.body.token

    if (typeof guestToken !== 'string') {
      res.status(400).send()
      return
    }

    try {
      let decoded: Token
      try {
        decoded = decodeToken(guestToken, true, config.ApiSecret)
      } catch (err) {
        res.status(401).send({ error: 'Invalid or expired token' })
        return
      }

      const meetingId: Ref<MeetingMinutes> = decoded.extra?.meetingId
      const workspace = decoded.workspace
      const workspaceUrl = decoded.extra?.workspaceUrl ?? null

      if (typeof meetingId !== 'string' || typeof workspace !== 'string') {
        res.status(400).send({ error: 'Invalid token payload' })
        return
      }

      // Resolve meeting & room presence via workspace client and livekit room list
      const wsClient = await WorkspaceClient.create(workspace, ctx)
      try {
        const meetingDoc = await wsClient.findMeetingById(meetingId)
        if (meetingDoc === undefined) {
          res.status(404).send({ error: 'Meeting not found' })
          return
        }
        const meetingStatus = meetingDoc.status
        const roomName = getRoomName(workspace, meetingId)
        const rooms = await roomClient.listRooms([roomName])
        const roomFound = !(rooms === undefined || rooms.length === 0)

        res.status(200).send({
          meetingId,
          workspace,
          workspaceUrl,
          title: meetingDoc.title,
          meetingStatus,
          roomFound
        })
      } finally {
        await wsClient.close()
      }
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/guestJoin', async (req, res) => {
    const guestToken = req.body.token
    const firstName = req.body.firstName
    const lastName = req.body.lastName

    if (typeof guestToken !== 'string') {
      res.status(400).send()
      return
    }

    try {
      // Validate guest token and extract meeting + workspace
      let decoded: Token
      try {
        decoded = decodeToken(guestToken, true, config.ApiSecret)
      } catch (err) {
        res.status(401).send({ error: 'Invalid or expired token' })
        return
      }

      const meetingId: Ref<MeetingMinutes> = decoded.extra?.meetingId
      const workspace = decoded.workspace

      if (typeof meetingId !== 'string' || typeof workspace !== 'string') {
        res.status(400).send({ error: 'Invalid token payload' })
        return
      }
      // Resolve or create a Person for this guest (so webhook and ui can reliably reference a Person)
      const wsClient = await WorkspaceClient.create(workspace, ctx)

      try {
        const meetingDoc = await wsClient.findMeetingById(meetingId)
        if (meetingDoc === undefined) {
          res.status(404).send({ error: 'Meeting not found' })
          return
        }

        const roomName = getRoomName(workspace, meetingId)

        // Ensure LiveKit room exists
        const room = await roomClient.listRooms([roomName])
        if (room === undefined || room.length === 0) {
          ctx.info('No room found guest join, not possible to join', { roomName })
          res.status(404).send({
            error: 'Meeting room not found.'
          })
          return
        }
        // Try finding an existing person by name to avoid duplicates
        let personRef = await wsClient.findPersonByName(firstName, lastName)

        // Create a guest person if not found
        if (personRef === undefined) {
          personRef = await wsClient.createGuestPerson(firstName, lastName)
        }

        if (personRef === undefined) {
          // Repeated failures while creating a Person - do not fallback to ephemeral identity.
          ctx.error('[guestJoin] Failed to create Person for guest join after retries', { firstName, lastName })
          res.status(500).send({ error: 'Failed to create guest identity' })
          return
        }

        // Use the person's document id as LiveKit identity so webhooks can resolve the person
        ctx.info('[guestJoin] Using identity', { identity: personRef })
        const roomToken = await createToken(roomName, personRef, combineName(firstName, lastName))

        res.status(200).send({
          token: roomToken,
          wsUrl: config.LiveKitHost,
          roomName,
          person: personRef
        })
      } finally {
        await wsClient.close()
      }
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get('/checkRecordAvailable', async (_req, res) => {
    res.send(await checkRecordAvailable(ctx, storageConfig, s3storageConfig))
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/startRecord', async (req, res) => {
    const { meetingId, workspaceId } = decodeMeetingToken(req, res)
    if (meetingId == null || workspaceId == null) {
      return
    }

    const roomName = getRoomName(workspaceId, meetingId)

    try {
      // Check if LiveKit room exists before starting recording
      const existingRooms = await roomClient.listRooms([roomName])
      if (existingRooms === undefined || existingRooms.length === 0) {
        ctx.error('Cannot start recording: LiveKit room does not exist', { roomName })
        res.status(404).send({ error: 'Room does not exist. Please ensure participants have joined the meeting.' })
        return
      }

      const token = extractToken(req.headers)
      const wsLoginInfo = await getAccountClient(token).getLoginInfoByToken()
      if (!isWorkspaceLoginInfo(wsLoginInfo)) {
        console.error('No workspace found for the token')
        res.status(401).send()
        return
      }

      const dateStr = new Date().toISOString().replace('T', '_').slice(0, 19)
      // Use MeetingMinutes title for recording filename
      let meetingTitle = req.body.title ?? 'recording'

      const wsClient = await WorkspaceClient.create(wsLoginInfo.workspace, ctx)
      try {
        const meetingDoc = await wsClient.findMeetingById(meetingId)
        if (meetingDoc === undefined) {
          ctx.error('Meeting document not found when starting recording', { meetingId })
          res.status(404).send({ error: 'Meeting not found' })
          return
        }
        meetingTitle = meetingTitle.replace(/[^a-zA-Z0-9_-]/g, '_')

        const name = `${meetingTitle}_${dateStr}.mp4`
        const wsIds = {
          uuid: wsLoginInfo.workspace,
          dataId: wsLoginInfo.workspaceDataId,
          url: wsLoginInfo.workspaceUrl
        }
        const { egressId } = await startRecord(
          ctx,
          storageConfig,
          s3storageConfig,
          egressClient,
          roomClient,
          roomName,
          wsIds
        )

        await wsClient.createPendingRecording({
          meeting: meetingId,
          format: 'video',
          roomName,
          name,
          egressId
        })
        // Update meeting document to reflect recording started
        await wsClient.updateMeetingRecordingState(meetingDoc, RecordingState.Recording)
      } finally {
        await wsClient.close()
      }

      ctx.info('Start recording', { workspace: wsLoginInfo.workspace, roomName, meetingId })
      res.send()
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/stopRecord', async (req, res) => {
    const { meetingId, workspaceId } = decodeMeetingToken(req, res)
    if (meetingId == null || workspaceId == null) {
      return
    }

    const roomName = getRoomName(workspaceId, meetingId)

    try {
      // Check if LiveKit room exists before stopping recording
      const existingRooms = await roomClient.listRooms([roomName])
      if (existingRooms !== undefined && existingRooms.length > 0) {
        await updateMetadata(roomClient, roomName, { recording: false })
      }
      void stopEgress(egressClient, roomName)
      res.send()
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/transcription', async (req, res) => {
    const { meetingId, workspaceId } = decodeMeetingToken(req, res)
    if (meetingId == null || workspaceId == null) {
      return
    }

    const roomName = getRoomName(workspaceId, meetingId)

    const language = req.body.language
    const transcription = req.body.transcription as TranscriptionStatus

    if (typeof roomName !== 'string') {
      res.status(400).send()
      return
    }

    try {
      // Check if LiveKit room exists before updating transcription
      const existingRooms = await roomClient.listRooms([roomName])
      if (existingRooms === undefined || existingRooms.length === 0) {
        ctx.error('Cannot update transcription: LiveKit room does not exist', { roomName })
        res.status(404).send({ error: 'Room does not exist. Please ensure participants have joined the meeting.' })
        return
      }

      const metadata = language != null ? { transcription, language } : { transcription }
      await updateMetadata(roomClient, roomName, metadata)
      res.status(200).send()
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/language', async (req, res) => {
    const { meetingId, workspaceId } = decodeMeetingToken(req, res)
    if (meetingId == null || workspaceId == null) {
      return
    }

    const roomName = getRoomName(workspaceId, meetingId)

    const language = req.body.language

    try {
      await updateMetadata(roomClient, roomName, { language })
      res.send()
    } catch (e) {
      console.error(e)
      res.status(500).send()
    }
  })

  // Initialize polling service if enabled
  const pollingService = new LiveKitPollingService(ctx, roomClient, {
    intervalMs: config.PollingIntervalMs,
    projectKey: config.LiveKitProject
  })
  pollingService.start()

  const workspaceConsumer = queue.createConsumer(ctx, QueueTopic.Workspace, 'love-client', async (ctx, msg, queue) => {
    pollingService.addWorkspaceToCheck(msg.workspace)
  })

  const workspaceTxConsumer = queue.createBatchConsumer(ctx, QueueTopic.Tx, 'love-client', async (ctx, msgs, queue) => {
    const workspaces = new Set<WorkspaceUuid>()
    for (const msg of msgs) {
      workspaces.add(msg.workspace)
    }
    for (const ws of workspaces) {
      pollingService.addWorkspaceToCheck(ws)
    }
  })

  ctx.info('LiveKit polling service started', {
    intervalMs: config.PollingIntervalMs,
    projectKey: config.LiveKitProject
  })

  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`)
  })

  const shutdown = (): void => {
    void workspaceConsumer.close()
    void workspaceTxConsumer.close()
    void queue.shutdown()
    pollingService.stop()
    server.close(() => process.exit())
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.on('uncaughtException', (e) => {
    console.error(e)
  })
  process.on('unhandledRejection', (e) => {
    console.error(e)
  })

  if (config.BillingUrl !== '' && config.UseGlobalLiveKit) {
    setInterval(
      () => {
        void updateLiveKitSessions(ctx).catch((error) => {
          ctx.error('failed to update livekit sessions', { error })
        })
      },
      config.BillingPollInterval * 60 * 1000
    )
    try {
      void updateLiveKitSessions(ctx)
    } catch {}
  }
}

const stopEgress = async (egressClient: EgressClient, roomName: string): Promise<void> => {
  const egresses = await egressClient.listEgress({ active: true, roomName })
  for (const egress of egresses) {
    await egressClient.stopEgress(egress.egressId)
  }
}

const createToken = async (roomName: string, _id: string, participantName: string): Promise<string> => {
  const at = new AccessToken(config.ApiKey, config.ApiSecret, {
    identity: _id,
    name: participantName,
    // token to expire after 10 minutes
    ttl: '10m'
  })
  at.addGrant({ roomJoin: true, room: roomName })

  return await at.toJwt()
}

const checkRecordAvailable = async (
  ctx: MeasureContext,
  storageConfig: StorageConfig | undefined,
  s3storageConfig: StorageConfig | undefined
): Promise<boolean> => {
  if (storageConfig !== undefined && storageConfig.kind === 's3') return true
  if (storageConfig !== undefined && storageConfig.kind === 'datalake' && s3storageConfig !== undefined) return true
  ctx.error('NO S3 storage config storage:', {
    storageConfig: storageConfig?.kind,
    s3storageConfig: s3storageConfig?.kind
  })
  return false
}

const startRecord = async (
  ctx: MeasureContext,
  storageConfig: StorageConfig | undefined,
  s3StorageConfig: StorageConfig | undefined,
  egressClient: EgressClient,
  roomClient: RoomServiceClient,
  roomName: string,
  wsIds: WorkspaceIds
): Promise<{ filepath: string, egressId: string }> => {
  if (storageConfig === undefined) {
    console.error('please provide storage configuration')
    throw new Error('please provide storage configuration')
  }
  const uploadParams = await getS3UploadParams(ctx, wsIds, storageConfig, s3StorageConfig)

  const { filepath, endpoint, accessKey, secret, region, bucket } = uploadParams

  ctx.info('staring recording on', { filepath, endpoint, region, bucket })
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    disableManifest: true,
    output: {
      case: 's3',
      value: new S3Upload({
        endpoint,
        accessKey,
        region,
        secret,
        bucket,
        forcePathStyle: true
      })
    }
  })
  const { preset } = getRecordingPreset(config.RecordingPreset)
  await updateMetadata(roomClient, roomName, { recording: true })
  const { egressId } = await egressClient.startRoomCompositeEgress(
    roomName,
    { file: output },
    {
      layout: 'grid',
      encodingOptions: preset,
      webhooks:
        config.WebHookUrl !== ''
          ? [
              new WebhookConfig({
                url: config.WebHookUrl,
                signingKey: config.ApiKey
              })
            ]
          : []
    }
  )
  return { filepath, egressId }
}

function getWorkspaceId (req: Request): WorkspaceUuid | undefined {
  const token = extractToken(req.headers)
  if (token === undefined) {
    return undefined
  }

  let decodedToken: Token | undefined
  try {
    decodedToken = decodeToken(token)
  } catch (e) {
    return undefined
  }

  if (decodedToken === undefined || decodedToken.extra?.readonly === 'true' || decodedToken.extra?.guest === 'true') {
    return undefined
  }
  return decodedToken.workspace
}

function parseMetadata (metadata?: string | null): RoomMetadata {
  if (metadata === '' || metadata == null) return {}

  try {
    return JSON.parse(metadata) as RoomMetadata
  } catch (e) {
    return {}
  }
}

async function updateMetadata (
  roomClient: RoomServiceClient,
  roomName: string,
  metadata: Partial<RoomMetadata>
): Promise<void> {
  const room = (await roomClient.listRooms([roomName]))[0]
  if (room === undefined) {
    throw new Error(`Cannot update metadata: room "${roomName}" does not exist`)
  }
  const currentMetadata = parseMetadata(room.metadata)

  await roomClient.updateRoomMetadata(roomName, JSON.stringify({ ...currentMetadata, ...metadata }))
}
