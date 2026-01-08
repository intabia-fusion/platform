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
  AIEventRequest,
  ConnectMeetingRequest,
  DisconnectMeetingRequest,
  IdentityResponse
} from '@hcengineering/ai-bot'
import attachment, { Attachment } from '@hcengineering/attachment'
import chunter, { ChatMessage, ThreadMessage } from '@hcengineering/chunter'
import contact, {
  AvatarType,
  combineName,
  ensureEmployee,
  getFirstName,
  getLastName,
  Person
} from '@hcengineering/contact'
import {
  AccountRole,
  AccountUuid,
  Blob,
  Class,
  Doc,
  MeasureContext,
  PersonId,
  PersonUuid,
  pickPrimarySocialId,
  RateLimiter,
  Ref,
  SocialId,
  SortingOrder,
  Space,
  Timestamp,
  toIdMap,
  TxCUD,
  withContext,
  type Account,
  type WorkspaceIds
} from '@hcengineering/core'
import love, { type MeetingMinutes, MeetingStatus, Room } from '@hcengineering/love'
import fs from 'fs'
import type { LLMProvider, ChatMessage as LLMChatMessage } from '../llms'
import { getTools } from '../utils/tools'

// Token counting and other LLM operations are delegated to the injected LLM provider
import { getAccountClient } from '@hcengineering/server-client'
import { ConsumerControl, StorageAdapter } from '@hcengineering/server-core'
import { jsonToMarkup, markupToText } from '@hcengineering/text'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import tracker, { Issue } from '@hcengineering/tracker'
import config from '../config'
import { HistoryRecord } from '../types'
import { getGlobalPerson } from '../utils/account'
import { connectPlatform } from '../utils/platform'
import { LoveController } from './love'
import { RestClient } from '@hcengineering/api-client'

interface LLMHistoryRecord {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface PersonHistoryRecord {
  assistantMemory: string // Info about assistant: name, behavior style, how to address user
  userMemory: string // Info about user: preferences, context, personal info
  sharedContext: string // Shared context: language, timezone, non-personal preferences
  history: HistoryRecord[]
}

export class WorkspaceClient {
  client: RestClient

  rate = new RateLimiter(1)

  primarySocialId: SocialId
  aiPerson: Person | undefined
  personUuidBySocialId = new Map<PersonId, PersonUuid>()

  love: LoveController | undefined
  historyMap = new Map<PersonUuid, PersonHistoryRecord>()

  constructor (
    readonly storage: StorageAdapter,
    readonly transactorUrl: string,
    readonly token: string,
    readonly wsIds: WorkspaceIds,
    readonly personUuid: AccountUuid,
    readonly socialIds: SocialId[],
    readonly ctx: MeasureContext,
    readonly llm: LLMProvider | undefined
  ) {
    this.client = connectPlatform(this.token, this.wsIds.uuid, this.transactorUrl)
    this.primarySocialId = pickPrimarySocialId(this.socialIds)
    void this.initClient()
  }

  private async ensureEmployee (client: RestClient): Promise<void> {
    const me: Account = {
      uuid: this.personUuid,
      role: AccountRole.User,
      primarySocialId: this.primarySocialId._id,
      socialIds: this.socialIds.map((it) => it._id),
      fullSocialIds: this.socialIds
    }
    await ensureEmployee(this.ctx, me, client, this.socialIds, async () => await getGlobalPerson(this.token))
  }

  private async initClient (): Promise<void> {
    await this.ensureEmployee(this.client)
    await this.checkEmployeeInfo(this.client)

    if (this.aiPerson !== undefined && config.LoveEndpoint !== '') {
      this.love = new LoveController(
        this.wsIds.uuid,
        this.ctx.newChild('love', {}, { span: false }),
        this.token,
        this.client,
        this.aiPerson
      )
    }
    this.ctx.info('Initialized workspace', { workspace: this.wsIds })
  }

  private async checkEmployeeInfo (client: RestClient): Promise<void> {
    this.ctx.info('Upload avatar file', { workspace: this.wsIds })

    try {
      const stat = fs.statSync(config.AvatarPath)
      const lastModified = stat.mtime.getTime()

      const uploadInfo = await this.storage.stat(this.ctx, this.wsIds, config.AvatarName)

      const isAlreadyUploaded = uploadInfo !== undefined && uploadInfo.modifiedOn !== lastModified
      if (!isAlreadyUploaded) {
        const data = fs.readFileSync(config.AvatarPath)

        await this.storage.put(this.ctx, this.wsIds, config.AvatarName, data, config.AvatarContentType, data.length)
        this.ctx.info('Avatar file uploaded successfully', { workspace: this.wsIds, path: config.AvatarPath })
      }
    } catch (e) {
      this.ctx.error('Failed to upload avatar file', { e })
    }

    await this.checkPersonData(client)
  }

  private async checkPersonData (client: RestClient): Promise<void> {
    this.aiPerson = this.aiPerson ?? (await client.findOne(contact.class.Person, { personUuid: this.personUuid }))

    if (this.aiPerson === undefined) {
      this.ctx.error('Cannot find AI Person ', { personUuid: this.personUuid })
      return
    }

    const firstName = getFirstName(this.aiPerson.name)
    const lastName = getLastName(this.aiPerson.name)

    if (lastName !== config.LastName || firstName !== config.FirstName) {
      await this.client.update(this.aiPerson, {
        name: combineName(config.FirstName, config.LastName)
      })
    }

    if (this.aiPerson.avatar === config.AvatarName) {
      return
    }

    const exist = await this.storage.stat(this.ctx, this.wsIds, config.AvatarName)

    if (exist === undefined) {
      this.ctx.error('Cannot find file', { file: config.AvatarName, workspace: this.wsIds })
      return
    }
    const pData = await client.findOne(this.aiPerson._class, { _id: this.aiPerson._id })
    if (pData?.avatar !== config.AvatarName || pData.avatarType !== AvatarType.IMAGE) {
      await client.update(this.aiPerson, {
        avatar: config.AvatarName as Ref<Blob>,
        avatarType: AvatarType.IMAGE
      })
    }
  }

  private toLlmHistory (history: PersonHistoryRecord, promptTokens: number): Array<LLMHistoryRecord> {
    const result: Array<{ role: 'user' | 'assistant' | 'system', content: string }> = []
    let totalTokens = promptTokens
    const maxRecentMessages = 20 // Keep last 20 messages in full detail

    // Only use recent messages for context
    const recentMessages = history.history.slice(-maxRecentMessages)

    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const record = recentMessages[i]
      const tokens = record.tokens

      if (totalTokens + tokens > config.MaxContentTokens) break

      result.unshift({ content: record.message, role: record.role as 'user' | 'assistant' | 'system' })
      totalTokens += tokens
    }

    return result
  }

  private async getHistory (personUuid: PersonUuid): Promise<PersonHistoryRecord> {
    if (this.historyMap.has(personUuid)) {
      return (
        this.historyMap.get(personUuid) ?? {
          assistantMemory: '',
          userMemory: '',
          sharedContext: '',
          history: []
        }
      )
    }

    // Try to read a person summary and history.
    try {
      const personHistory: PersonHistoryRecord = JSON.parse(
        Buffer.concat(await this.storage.read(this.ctx, this.wsIds, 'ai-bot-phr-' + personUuid)).toString()
      )

      // Migration: add sharedContext if missing
      if (personHistory.sharedContext === undefined) {
        personHistory.sharedContext = ''
      }

      this.historyMap.set(personUuid, personHistory)
      return personHistory
    } catch (err: any) {
      // Ignore, no history available
    }

    // We need to load person info

    const personData = await this.client?.findOne(contact.mixin.Employee, { personUuid: personUuid as AccountUuid })

    const v = {
      assistantMemory: '',
      userMemory: personData !== undefined ? `User name: ${personData.name}` : '',
      sharedContext: '',
      history: []
    }
    this.historyMap.set(personUuid, v)
    return v
  }

  async updateAssistantMemory (user: PersonUuid | undefined, args: Record<string, any>): Promise<void> {
    if (user === undefined) return

    const currentHistory = await this.getHistory(user)
    currentHistory.assistantMemory = args.memory ?? currentHistory.assistantMemory

    await this.saveHistory(user, currentHistory)
  }

  async updateUserMemory (user: PersonUuid | undefined, args: Record<string, any>): Promise<void> {
    if (user === undefined) return

    const currentHistory = await this.getHistory(user)
    currentHistory.userMemory = args.memory ?? currentHistory.userMemory

    await this.saveHistory(user, currentHistory)
  }

  async updateSharedContext (user: PersonUuid | undefined, args: Record<string, any>): Promise<void> {
    if (user === undefined) return

    const currentHistory = await this.getHistory(user)
    currentHistory.sharedContext = args.context ?? currentHistory.sharedContext

    await this.saveHistory(user, currentHistory)
  }

  async getHistoryForUser (user: PersonUuid): Promise<PersonHistoryRecord> {
    return await this.getHistory(user)
  }

  async clearHistory (user: PersonUuid | undefined): Promise<void> {
    if (user === undefined) return

    const currentHistory = await this.getHistory(user)
    currentHistory.history = []

    await this.saveHistory(user, currentHistory)
  }

  async getHistorySummary (user: PersonUuid | undefined): Promise<string> {
    if (user === undefined) return 'No user context available'
    if (this.llm === undefined) return 'Summary service not available'

    const currentHistory = await this.getHistory(user)

    if (currentHistory.history.length === 0) {
      return 'No conversation history available yet.'
    }

    const { summary } = await this.llm.requestSummary(
      this.ctx,
      this.wsIds.uuid,
      currentHistory.assistantMemory + '\n' + currentHistory.userMemory,
      currentHistory.history
    )

    return summary ?? 'Failed to generate summary'
  }

  async saveHistory (personUuid: PersonUuid, history: PersonHistoryRecord): Promise<void> {
    await this.storage.put(
      this.ctx,
      this.wsIds,
      'ai-bot-phr-' + personUuid,
      JSON.stringify(history),
      'application/json'
    )
  }

  private async pushHistory (
    personUuid: PersonUuid,
    message: string,
    role: 'user' | 'assistant',
    tokens: number,
    user: PersonUuid,
    objectId: Ref<Doc>,
    objectClass: Ref<Class<Doc>>
  ): Promise<void> {
    const currentHistory = (await this.getHistory(personUuid)) ?? []
    const newRecord: HistoryRecord = {
      workspace: this.wsIds.uuid,
      message,
      objectId,
      objectClass,
      role,
      user,
      tokens,
      timestamp: Date.now()
    }
    currentHistory.history.push({ ...newRecord })
    this.historyMap.set(personUuid, currentHistory)
  }

  private async getAttachments (client: RestClient, objectId: Ref<Doc>): Promise<Attachment[]> {
    return await client.findAll(attachment.class.Attachment, { attachedTo: objectId })
  }

  async processMessageEvent (event: AIEventRequest, control?: ConsumerControl): Promise<void> {
    if (this.llm === undefined) return

    const { user, objectId, objectClass, messageClass } = event
    const accountClient = getAccountClient(this.token)
    const personUuid = this.personUuidBySocialId.get(user) ?? (await accountClient.findPersonBySocialId(user))

    const contextMode = objectClass === chunter.class.DirectMessage ? 'direct' : 'thread'

    if (personUuid === undefined) {
      return
    }

    this.personUuidBySocialId.set(user, personUuid)

    let promptText = markupToText(event.message)
    const files = await this.getAttachments(this.client, event.messageId)
    if (files.length > 0) {
      promptText += '\n\nAttachments:'
      for (const file of files) {
        promptText += `\nName:${file.name} FileId:${file.file} Type:${file.type}`
      }
    }
    const prompt: LLMChatMessage = { content: promptText, role: 'user' as const }
    const promptTokens = this.llm?.countTokens([prompt]) ?? 0

    const space = event.objectIdIsSpace ? (objectId as Ref<Space>) : event.objectSpace

    const rawHistory = await this.getHistory(personUuid)
    const history = this.toLlmHistory(rawHistory, promptTokens)

    await this.pushHistory(personUuid, promptText, 'user', promptTokens, personUuid, objectId, objectClass)

    const useHistory = history.filter((it) => it.role !== 'system')

    const systemPrompts: LLMHistoryRecord[] = []

    if (contextMode !== 'direct') {
      // Load a message itself
      const msg = await this.client?.findOne<Doc>(objectClass, { _id: objectId })
      if (msg !== undefined) {
        systemPrompts.push({
          role: 'system' as const,
          content: 'Document type:' + msg?._class
        })
        if (msg._class === chunter.class.ThreadMessage || msg._class === chunter.class.ChatMessage) {
          systemPrompts.push({
            role: 'system' as const,
            content: 'Content: ' + markupToText((msg as ChatMessage).message)
          })
        }
        if (msg._class === tracker.class.Issue) {
          let _msg = ''
          const is: Issue = msg as Issue

          _msg += 'Issue title: ' + is.title + '\n'

          if (is.description != null && is.description !== '') {
            try {
              const readable = await this.storage.read(this.ctx, this.wsIds, is.description)
              const markup = Buffer.concat(readable as any).toString()
              let textContent = markupToText(markup)
              textContent = textContent
                .split(/ +|\t+|\f+/)
                .filter((it) => it)
                .join(' ')
                .split(/\n\n+/)
                .join('\n')

              _msg += 'Content:``` \n' + textContent + '\n ```'
            } catch (err: any) {
              this.ctx.error('failed to handle description', { _id: is.description, workspace: this.wsIds.uuid })
            }

            systemPrompts.push({
              role: 'system' as const,
              content: _msg
            })
          }
        }
      }

      const lastMessages =
        (await this.client?.findAll(
          chunter.class.ChatMessage,
          { attachedTo: objectId, attachedToClass: objectClass },
          { limit: 500, sort: { modifiedOn: SortingOrder.Descending } }
        )) ?? []

      lastMessages.sort((a, b) => a.modifiedOn - b.modifiedOn)

      const personIds = new Set(lastMessages.map((it) => it.modifiedBy))

      const socialIds = toIdMap(
        (await this.client?.findAll(contact.class.SocialIdentity, { _id: { $in: Array.from(personIds) as any } })) ?? []
      )

      const employeesInChannel =
        (await this.client?.findAll(contact.class.Person, {
          _id: { $in: Array.from(socialIds.values()).map((it) => it.attachedTo) }
        })) ?? []
      const empAsMap = toIdMap(employeesInChannel.filter((it) => it.personUuid !== undefined))

      for (const msg of lastMessages) {
        let emp: Person | undefined
        const sid = socialIds.get(msg.modifiedBy as any)
        if (sid !== undefined) {
          emp = empAsMap.get(sid.attachedTo)
        }
        const msgRole: 'assistant' | 'user' = this.aiPerson?.personUuid === emp?.personUuid ? 'assistant' : 'user'
        useHistory.push({
          role: msgRole,
          content: markupToText(msg.message)
        })
      }
    }

    const tools = getTools(this, contextMode, personUuid as AccountUuid)
    const chatCompletion = await this.llm?.createChatCompletionWithTools(
      tools,
      prompt,
      contextMode,
      rawHistory.assistantMemory,
      rawHistory.userMemory,
      rawHistory.sharedContext,
      personUuid as AccountUuid,
      this.ctx,
      this.wsIds.uuid,
      [...systemPrompts, ...useHistory]
    )
    const response = chatCompletion?.completion

    if (response == null) {
      return
    }
    const responseTokens =
      chatCompletion?.usage ?? this.llm?.countTokens([{ role: 'assistant', content: response }]) ?? 0

    await this.pushHistory(personUuid, response, 'assistant', responseTokens, personUuid, objectId, objectClass)

    const parseResponse = jsonToMarkup(markdownToMarkup(response, { refUrl: '', imageUrl: '' }))

    if (messageClass === chunter.class.ChatMessage) {
      await this.client.addCollection<Doc, ChatMessage>(
        chunter.class.ChatMessage,
        space,
        objectId,
        objectClass,
        event.collection,
        { message: parseResponse }
      )
    } else if (messageClass === chunter.class.ThreadMessage) {
      const parent = await this.client.findOne<ChatMessage>(chunter.class.ChatMessage, {
        _id: objectId as Ref<ChatMessage>
      })

      if (parent !== undefined) {
        await this.client.addCollection<Doc, ThreadMessage>(
          chunter.class.ThreadMessage,
          space,
          objectId,
          objectClass,
          event.collection,
          { message: parseResponse, objectId: parent.attachedTo, objectClass: parent.attachedToClass }
        )
      }
    }
  }

  async close (): Promise<void> {
    this.ctx.info('Closed workspace client: ', { workspace: this.wsIds })
  }

  async txHandler (txes: TxCUD<Doc>[]): Promise<void> {
    if (this.love !== undefined) {
      this.love.txHandler(txes)
    }
  }

  async loveConnect (request: ConnectMeetingRequest): Promise<void> {
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return
    }
    await this.love.connect(request)
  }

  async loveDisconnect (request: DisconnectMeetingRequest): Promise<void> {
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return
    }

    await this.love.disconnect(request.roomId)
  }

  @withContext('processLoveTranscript')
  async processLoveTranscript (
    ctx: MeasureContext,
    text: string,
    participant: Ref<Person>,
    room: Ref<Room>
  ): Promise<void> {
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return
    }

    // Diagnostics: log incoming love transcript for easier tracing
    ctx.info('workspaceClient.processLoveTranscript', {
      room,
      participant,
      textLength: text.length
    })

    await this.love.processTranscript(text, participant, room)
  }

  /**
   * Create a placeholder message for pending transcription
   */
  @withContext('createTranscriptionPlaceholder')
  async createTranscriptionPlaceholder (
    ctx: MeasureContext,
    participant: Ref<Person>,
    room: Ref<Room>,
    startTimeSec: number,
    endTimeSec: number,
    blobId: string
  ): Promise<Ref<ChatMessage> | undefined> {
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return undefined
    }

    return await this.love.createTranscriptionPlaceholder(participant, room, startTimeSec, endTimeSec, blobId)
  }

  /**
   * Update or delete a transcription placeholder message
   * @returns true if message was found and updated/deleted, false if not found
   */
  @withContext('updateTranscriptionMessage')
  async updateTranscriptionMessage (
    ctx: MeasureContext,
    messageId: Ref<ChatMessage>,
    text: string | null
  ): Promise<boolean> {
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return false
    }

    return await this.love.updateTranscriptionMessage(messageId, text)
  }

  /**
   * Create a transcription message with specific timestamp (fallback when placeholder not found)
   */
  @withContext('createTranscriptionMessageWithTimestamp')
  async createTranscriptionMessageWithTimestamp (
    ctx: MeasureContext,
    text: string,
    participant: Ref<Person>,
    roomId: Ref<Room>,
    timestamp: Timestamp
  ): Promise<boolean> {
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return false
    }

    return await this.love.createTranscriptionMessageWithTimestamp(text, participant, roomId, timestamp)
  }

  /**
   * Get MeetingMinutes by room ID (any status, most recent)
   */
  @withContext('getMeetingMinutesByRoom')
  async getMeetingMinutesByRoom (ctx: MeasureContext, roomId: Ref<Room>): Promise<MeetingMinutes | undefined> {
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return undefined
    }

    const room = await this.love.getRoom(roomId)
    if (room === undefined) {
      return undefined
    }

    return await this.love.getMeetingMinutesAny(room)
  }

  async getLoveIdentity (): Promise<IdentityResponse | undefined> {
    if (this.love === undefined) {
      this.ctx.error('Love is not initialized')
      return
    }

    return this.love.getIdentity()
  }

  canClose (): boolean {
    if (this.love === undefined) return true

    return !this.love.hasActiveConnections()
  }

  /**
   * Add session recording as attachment to meeting minutes
   */
  async addSessionAttachment (
    roomId: Ref<Room>,
    blobId: string,
    participant: string,
    startTimeSec: number,
    endTimeSec: number,
    size: number,
    sessionNumber: number
  ): Promise<void> {
    // Find active meeting minutes for this room
    const meetingMinutes = await this.client.findOne<MeetingMinutes>(love.class.MeetingMinutes, {
      attachedTo: roomId,
      status: MeetingStatus.Active
    })

    if (meetingMinutes === undefined) {
      this.ctx.warn('No active meeting minutes found for room', { roomId, participant })
      return
    }

    // participant is now the display name from LiveKit (participant.name), not Ref<Person>
    // Just sanitize it for use in filename
    let participantName = participant.trim()
    if (participantName === '') {
      participantName = 'Unknown'
    }
    // Replace spaces and special characters for filename safety
    participantName = participantName.replace(/\s+/g, '_').replace(/[<>:"/\\|?*]/g, '_')

    // Format start and end times as mm:ss
    const formatTime = (sec: number): string => {
      const minutes = Math.floor(sec / 60)
      const seconds = Math.floor(sec % 60)
      return `${minutes}:${seconds.toString().padStart(2, '0')}`
    }
    const startTimeStr = formatTime(startTimeSec)
    const endTimeStr = formatTime(endTimeSec)

    // Create attachment with participant name, session number and time range
    // Using OGG container with Opus codec for browser compatibility
    const attachmentName = `${participantName}_${sessionNumber}_${startTimeStr}-${endTimeStr}.ogg`

    await this.client.addCollection(
      attachment.class.Attachment,
      meetingMinutes.space,
      meetingMinutes._id,
      meetingMinutes._class,
      'attachments',
      {
        name: attachmentName,
        file: blobId as Ref<Blob>,
        type: 'audio/ogg',
        size,
        lastModified: Date.now()
      }
    )

    this.ctx.info('Added session attachment to meeting minutes', {
      meetingMinutes: meetingMinutes._id,
      roomId,
      participant,
      participantName,
      sessionNumber,
      attachmentName,
      size,
      startTimeSec,
      endTimeSec
    })
  }
}
