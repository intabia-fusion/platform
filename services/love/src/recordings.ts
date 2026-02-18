import { WorkspaceLoginInfo } from '@hcengineering/account-client'
import { MeasureContext, Ref, WorkspaceIds, WorkspaceUuid } from '@hcengineering/core'
import { MeetingMinutes, queueEvents, QueueMeetingMessage, RecordingState } from '@hcengineering/love'
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  WebhookConfig
} from 'livekit-server-sdk'
import { WorkspaceClient } from './workspaceClient'
import { PlatformQueueProducer, StorageConfig } from '@hcengineering/server-core'
import { getS3UploadParams } from './storage'
import { getRecordingPreset } from './preset'
import config from './config'

export class RecordingProcessor {
  constructor (
    readonly ctx: MeasureContext,
    readonly roomClient: RoomServiceClient,
    readonly eventProducer: PlatformQueueProducer<QueueMeetingMessage>,
    readonly egressClient: EgressClient,
    readonly storageConfig: StorageConfig | undefined,
    readonly s3storageConfig: StorageConfig | undefined
  ) {}

  async startRecording (
    roomName: string,
    workspaceId: WorkspaceUuid,
    meetingId: Ref<MeetingMinutes>,
    wsLoginInfo: WorkspaceLoginInfo,
    meetingTitle: string
  ): Promise<void> {
    // Check if LiveKit room exists before starting recording
    const existingRooms = await this.roomClient.listRooms([roomName])
    if (existingRooms === undefined || existingRooms.length === 0) {
      this.ctx.warn('Cannot start recording: LiveKit room does not exist', { roomName })
      return
    }

    const dateStr = new Date().toISOString().replace('T', '_').slice(0, 19)
    // Use MeetingMinutes title for recording filename

    const wsClient = await WorkspaceClient.create(wsLoginInfo.workspace, this.ctx)
    try {
      const meetingDoc = await wsClient.findMeetingById(meetingId)
      if (meetingDoc === undefined) {
        this.ctx.error('Meeting document not found when starting recording', { meetingId })
        throw new Error('Meeting not found')
      }
      meetingTitle = meetingTitle.replace(/[^a-zA-Z0-9_-]/g, '_')

      const name = `${meetingTitle}_${dateStr}.mp4`
      const wsIds = {
        uuid: wsLoginInfo.workspace,
        dataId: wsLoginInfo.workspaceDataId,
        url: wsLoginInfo.workspaceUrl
      }
      const { egressId } = await this.startRecord(this.ctx, roomName, wsIds, meetingId)

      await wsClient.createPendingRecording({
        meeting: meetingId,
        format: 'video',
        roomName,
        name,
        egressId
      })
      // Update meeting document to reflect recording started
      await wsClient.updateMeetingRecordingState(meetingDoc, RecordingState.Recording)
    } catch (err: any) {
      this.ctx.error('Failed to start recording', { error: err?.message ?? String(err), meetingId, roomName })
      throw err
    }

    this.ctx.info('Start recording', { workspace: wsLoginInfo.workspace, roomName, meetingId })
  }

  async stopRecording (roomName: string, workspaceId: WorkspaceUuid, meetingId: Ref<MeetingMinutes>): Promise<void> {
    // Check if LiveKit room exists before stopping recording
    const existingRooms = await this.roomClient.listRooms([roomName])
    if (existingRooms === undefined || existingRooms.length === 0) {
      return
    }
    const egresses = await this.egressClient.listEgress({ active: true, roomName })
    for (const egress of egresses) {
      await this.egressClient.stopEgress(egress.egressId)
    }
    await this.eventProducer.send(this.ctx, workspaceId, [
      queueEvents.updateMetadata(meetingId, roomName, { recording: false })
    ])
  }

  private async startRecord (
    ctx: MeasureContext,
    roomName: string,
    wsIds: WorkspaceIds,
    meetingId: Ref<MeetingMinutes>
  ): Promise<{ filepath: string, egressId: string }> {
    if (this.storageConfig === undefined) {
      console.error('please provide storage configuration')
      throw new Error('please provide storage configuration')
    }
    const uploadParams = await getS3UploadParams(ctx, wsIds, this.storageConfig, this.s3storageConfig)

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

    const { egressId } = await this.egressClient.startRoomCompositeEgress(
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
    await this.eventProducer.send(this.ctx, wsIds.uuid, [
      queueEvents.updateMetadata(meetingId, roomName, { recording: true })
    ])
    return { filepath, egressId }
  }
}
