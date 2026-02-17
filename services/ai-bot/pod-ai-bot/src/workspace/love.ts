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
import { ConnectMeetingRequest } from '@hcengineering/ai-bot'

import chunter, { ChatMessage } from '@hcengineering/chunter'
import contact, { Person } from '@hcengineering/contact'
import core, {
  concatLink,
  generateId,
  Markup,
  MeasureContext,
  PersonId,
  Ref,
  Timestamp,
  TxFactory,
  WorkspaceUuid,
  pickPrimarySocialId,
  AccountUuid
} from '@hcengineering/core'
import love, {
  getFreeRoomPlace,
  MeetingMinutes,
  ParticipantInfo,
  Room,
  RoomLanguage,
  TranscriptionState
} from '@hcengineering/love'
import { jsonToMarkup, MarkupNodeType } from '@hcengineering/text'

import config from '../config'
import { RestClient } from '@hcengineering/api-client'

export class LoveController {
  private readonly connectedMeetings = new Set<Ref<MeetingMinutes>>()

  private readonly socialIdByPerson = new Map<Ref<Person>, PersonId>()
  private initComplete = false

  constructor (
    private readonly workspace: WorkspaceUuid,
    private readonly ctx: MeasureContext,
    private readonly token: string,
    private readonly client: RestClient,
    private readonly currentPerson: Person
  ) {
    void this.initData()
  }

  getIdentity (): { identity: Ref<Person>, name: string } {
    return {
      identity: this.currentPerson._id,
      name: this.currentPerson.name
    }
  }

  async initData (): Promise<void> {
    const pp = await this.client.findAll(love.class.ParticipantInfo, { person: this.currentPerson._id })

    for (const p of pp) {
      await this.client.remove(p)
    }
    this.initComplete = true
  }

  async connect (request: ConnectMeetingRequest): Promise<void> {
    const mm = await this.getMeeting(request.meetingId)

    if (mm === undefined) {
      this.ctx.error('Room not found', request)
      this.connectedMeetings.delete(request.meetingId)
      return
    }

    // Check if already connected
    if (this.connectedMeetings.has(request.meetingId)) {
      this.ctx.info('Already connected to meeting, skipping', { meeting: request.meetingId })
      return
    }

    if (request.transcription) {
      this.ctx.info('Connecting', { room: mm.title, meeting: mm._id, transcription: request.transcription })
      this.connectedMeetings.add(request.meetingId)
      await this.requestTranscription(mm, request.language)
      await this.updateTranscriptionState(mm._id, TranscriptionState.Transcribing)
      const participantId = await this.createAiParticipant(mm)
      this.ctx.info('AI participant created/found', { meeting: mm._id, participantId })
    }
  }

  async requestTranscription (meeting: MeetingMinutes, language: RoomLanguage): Promise<void> {
    await startTranscription(this.token, meeting._id, language)
  }

  async disconnect (meetingId: Ref<MeetingMinutes>): Promise<void> {
    this.ctx.info('Disconnecting', { meeting: meetingId })

    const participant = await this.getRoomParticipant(meetingId, this.currentPerson._id)
    if (participant !== undefined) {
      this.ctx.info('Removing AI participant', { meeting: meetingId, participantId: participant._id })
      await this.client.remove(participant)
    }

    // Prefer MeetingMinutes id when stopping transcription so token names match started sessions.
    this.ctx.info('Stopping transcription', { meeting: meetingId })
    await stopTranscription(this.token, meetingId)

    // Update transcription state to Finished
    await this.updateTranscriptionState(meetingId, TranscriptionState.Finished)

    this.connectedMeetings.delete(meetingId)
  }

  async updateTranscriptionState (meetingId: Ref<MeetingMinutes>, state: TranscriptionState): Promise<void> {
    try {
      const mm = await this.getMeeting(meetingId)
      if (mm !== undefined && mm.transcriptionState !== state) {
        await this.client.update(mm, { transcriptionState: state })
        this.ctx.info('Updated transcription state', { meeting: meetingId, state })
      }
    } catch (err: any) {
      this.ctx.error('Failed to update transcription state', { meeting: meetingId, error: err?.message })
    }
  }

  async getSocialId (person: Ref<Person>): Promise<PersonId | undefined> {
    if (!this.socialIdByPerson.has(person)) {
      const identities = await this.client.findAll(contact.class.SocialIdentity, {
        attachedTo: person,
        attachedToClass: contact.class.Person
      })
      if (identities.length > 0) {
        const id = pickPrimarySocialId(identities)._id
        this.socialIdByPerson.set(person, id)
      }
    }

    const socialId = this.socialIdByPerson.get(person)
    if (socialId === undefined) {
      return
    }

    this.socialIdByPerson.set(person, socialId)

    return socialId
  }

  /**
   * Create a placeholder message for pending transcription
   * Shows a spinning indicator while transcription is in progress
   * Returns the message ID for later update/deletion
   */
  async createTranscriptionPlaceholder (
    person: Ref<Person>,
    meetingId: Ref<MeetingMinutes>,
    startTimeSec: number,
    endTimeSec: number,
    blobId: string
  ): Promise<Ref<ChatMessage> | undefined> {
    this.ctx.info('Creating transcription placeholder', { person, roomId: meetingId, startTimeSec, endTimeSec, blobId })

    const socialId = await this.getSocialId(person)
    if (socialId === undefined) {
      this.ctx.warn('SocialId not found for placeholder', { person })
      return undefined
    }

    // Format time as mm:ss
    const formatTime = (sec: number): string => {
      const minutes = Math.floor(sec / 60)
      const seconds = Math.floor(sec % 60)
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }

    const timeRange = `${formatTime(startTimeSec)} - ${formatTime(endTimeSec)}`

    // Create placeholder with spinning indicator emoji and audio link
    // 🎙️ indicates recording, ⏳ indicates processing
    const placeholderText = `🎙️ ⏳ ... (${timeRange})`

    const messageId = generateId<ChatMessage>()

    await this.client.addCollection(
      chunter.class.ChatMessage,
      core.space.Workspace,
      meetingId,
      love.class.MeetingMinutes,
      'transcription',
      {
        message: this.transcriptToMarkup(placeholderText)
      },
      messageId,
      undefined,
      socialId
    )

    return messageId
  }

  /**
   * Update placeholder message with actual transcription text
   * Or delete it if transcription is empty
   * @returns true if message was found and updated/deleted, false if not found
   */
  async updateTranscriptionMessage (messageId: Ref<ChatMessage>, text: string | null): Promise<boolean> {
    const message = await this.client.findOne(chunter.class.ChatMessage, { _id: messageId })

    if (message === undefined) {
      this.ctx.warn('Transcription placeholder message not found', { messageId })
      return false
    }

    if (text === null || text.trim() === '') {
      // Delete message if no transcription
      await this.client.remove(message)
      this.ctx.info('Deleted empty transcription placeholder', { messageId })
    } else {
      // Update with actual transcription
      await this.client.update(message, {
        message: this.transcriptToMarkup(text)
      })
      this.ctx.info('Updated transcription message', { messageId, textLength: text.length })
    }
    return true
  }

  /**
   * Create a transcription message with specific timestamp (for fallback when placeholder not found)
   * Works even if meeting is already finished
   */
  async createTranscriptionMessageWithTimestamp (
    text: string,
    person: Ref<Person>,
    meetingId: Ref<MeetingMinutes>,
    timestamp: Timestamp
  ): Promise<boolean> {
    const meeting = await this.getMeeting(meetingId)
    if (meeting === undefined) {
      this.ctx.warn('Room not found for fallback transcription', { meetingId })
      return false
    }

    const socialId = await this.getSocialId(person)
    if (socialId === undefined) {
      this.ctx.warn('Social ID not found for fallback transcription', { person })
      return false
    }

    await this.client.addCollection(
      chunter.class.ChatMessage,
      core.space.Workspace,
      meeting._id,
      meeting._class,
      'transcription',
      {
        message: this.transcriptToMarkup(text)
      },
      undefined,
      timestamp,
      socialId
    )

    this.ctx.info('Created fallback transcription message with timestamp', {
      person,
      textLength: text.length,
      timestamp
    })
    return true
  }

  async processTranscript (text: string, person: Ref<Person>, meetingMinutesId: Ref<MeetingMinutes>): Promise<void> {
    const meeting = await this.getMeeting(meetingMinutesId)
    const participant = await this.getRoomParticipant(meetingMinutesId, person)

    if (meeting === undefined || participant === undefined) {
      return
    }

    const socialId = await this.getSocialId(person)
    if (socialId === undefined) return

    await this.client.addCollection(
      chunter.class.ChatMessage,
      core.space.Workspace,
      meeting._id,
      meeting._class,
      'transcription',
      {
        message: this.transcriptToMarkup(text)
      },
      undefined,
      undefined,
      socialId
    )
    this.ctx.info('Added transcription message to meeting minutes', {
      meetingMinutes: meeting._id,
      textLength: text.length
    })
  }

  hasActiveConnections (): boolean {
    return this.connectedMeetings.size > 0
  }

  async getMeeting (ref: Ref<MeetingMinutes>): Promise<MeetingMinutes | undefined> {
    return await this.client.findOne(love.class.MeetingMinutes, { _id: ref })
  }

  async getRoomParticipant (meetingId: Ref<MeetingMinutes>, person: Ref<Person>): Promise<ParticipantInfo | undefined> {
    // Prefer meeting-bound participant (if there is an active/pending meeting in the room)
    try {
      const remote = await this.client.findOne(love.class.ParticipantInfo, { meeting: meetingId, person })
      if (remote !== undefined) return remote
    } catch (err: any) {
      this.ctx?.info?.('[LoveController.getRoomParticipant] failed to resolve meeting for room', { error: String(err) })
      return undefined
    }
  }

  async createAiParticipant (meeting: MeetingMinutes): Promise<Ref<ParticipantInfo>> {
    const participants = await this.client.findAll(love.class.ParticipantInfo, { meeting: meeting._id })
    const currentInfo = participants.find((p) => p.person === this.currentPerson._id)

    if (currentInfo !== undefined) {
      this.ctx.info('AI participant already exists', { meeting: meeting._id, participantId: currentInfo._id })
      return currentInfo._id
    }

    const room =
      meeting.attachedTo !== undefined
        ? await this.client.findOne(love.class.Room, { _id: meeting.attachedTo as Ref<Room> })
        : undefined

    // Try to allocate unique cell atomically using TxApplyIf (apply + notMatch)
    const maxAttempts = 5
    const socialId = (await this.getSocialId(this.currentPerson._id)) ?? core.account.System
    const tf = new TxFactory(socialId)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const currentParticipants = await this.client.findAll(love.class.ParticipantInfo, { meeting: meeting._id })
      const placeNow =
        room !== undefined ? getFreeRoomPlace(room, currentParticipants, this.currentPerson._id) : { x: 0, y: 0 }
      const xNow: number = placeNow.x
      const yNow: number = placeNow.y

      const oid: Ref<ParticipantInfo> = generateId()
      const createTx = tf.createTxCreateDoc(
        love.class.ParticipantInfo,
        core.space.Workspace,
        {
          x: xNow,
          y: yNow,
          meeting: meeting._id,
          room: room?._id,
          person: this.currentPerson._id,
          name: this.currentPerson.name,
          account: (this.currentPerson.personUuid as AccountUuid) ?? null,
          sessionId: null
        } as any,
        oid
      )

      const applyTx = tf.createTxApplyIf(
        core.space.Workspace,
        `${meeting._id}`,
        [],
        [
          { _class: love.class.ParticipantInfo, query: { meeting: meeting._id, person: this.currentPerson._id } },
          { _class: love.class.ParticipantInfo, query: { meeting: meeting._id, x: xNow, y: yNow } }
        ],
        [createTx],
        'createAiParticipant',
        true
      )

      try {
        const res = (await this.client.tx(applyTx)) as unknown
        let applied = false
        if (Array.isArray(res)) {
          const r = (res as unknown[]).find((it: unknown) => {
            if (it == null || typeof it !== 'object') return false
            const s = (it as { success?: unknown }).success
            return typeof s === 'boolean'
          })
          applied = r != null && (r as { success: boolean }).success
        } else if (res != null && typeof res === 'object') {
          const s = (res as { success?: unknown }).success
          applied = typeof s === 'boolean' && s
        }

        if (applied) {
          this.ctx.info('AI participant create applied', { meeting: meeting._id, oid, x: xNow, y: yNow })
          return oid
        } else {
          this.ctx.info('createAiParticipant apply failed, retrying', {
            meeting: meeting._id,
            attempt,
            x: xNow,
            y: yNow
          })
          // small backoff before retry
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        this.ctx.error('createAiParticipant apply error', { meeting: meeting._id, attempt, error: msg })
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }

    // Fallback: best-effort create if apply failed after retries
    const fallbackOid: Ref<ParticipantInfo> = generateId()
    await this.client.createDoc(
      love.class.ParticipantInfo,
      core.space.Workspace,
      {
        kind: 'agent',
        x: 0,
        y: 0,
        meeting: meeting._id,
        room: room?._id,
        person: this.currentPerson._id,
        name: this.currentPerson.name,
        account: (this.currentPerson.personUuid as AccountUuid) ?? null,
        sessionId: null
      } as any,
      fallbackOid
    )
    this.ctx.info('AI participant create fallback', { meeting: meeting._id, fallbackOid })
    return fallbackOid
  }

  transcriptToMarkup (transcript: string): Markup {
    return jsonToMarkup({
      type: MarkupNodeType.doc,
      content: [
        {
          type: MarkupNodeType.paragraph,
          content: [
            {
              type: MarkupNodeType.text,
              text: transcript
            }
          ]
        }
      ]
    })
  }
}

async function startTranscription (
  token: string,
  meetingId: Ref<MeetingMinutes>,
  language: RoomLanguage
): Promise<boolean> {
  try {
    const endpoint = config.LoveEndpoint
    const res = await fetch(concatLink(endpoint, '/transcription'), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meetingId,
        language,
        transcription: true
      })
    })
    return res.ok
  } catch (err: any) {
    console.error('Failed to request start transcription', err)
    return false
  }
}

async function stopTranscription (token: string, meetingId: Ref<MeetingMinutes>): Promise<boolean> {
  try {
    const endpoint = config.LoveEndpoint
    const res = await fetch(concatLink(endpoint, '/transcription'), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ meetingId, transcription: false })
    })
    return res.ok
  } catch (err: any) {
    console.error('Failed to request stop transcription', err)
    return false
  }
}
