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
import aiBot, {
  AIEventRequest,
  type AIPersonalData,
  type AIRequest,
  aiBotEmailSocialKey,
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
  Person,
  SocialIdentity
} from '@hcengineering/contact'
import core, {
  AccountRole,
  AccountUuid,
  Blob,
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
  withContext,
  systemAccountUuid,
  type Account,
  type WorkspaceIds
} from '@hcengineering/core'
import love, { type MeetingMinutes } from '@hcengineering/love'
import fs from 'fs'
import type { LLMProvider, ChatMessage as LLMChatMessage } from '../llms'
import type { AILevel } from '../config'
import { getTools } from '../utils/tools'
import { resolveMemory, type AIMemory } from './memory'
import { donePatch, failedPatch, queuedRequest } from './aiRequest'
import { resolveModel } from '../llms/modelRegistry'
import { buildThreadContext, type ContextMessage } from './threadContext'

// Token counting and other LLM operations are delegated to the injected LLM provider
import { getAccountClient } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'
import { ConsumerControl, StorageAdapter } from '@hcengineering/server-core'
import { jsonToMarkup, markupToText } from '@hcengineering/text'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import tracker, { Issue } from '@hcengineering/tracker'
import config from '../config'
import { getGlobalPerson } from '../utils/account'
import { connectPlatform } from '../utils/platform'
import { LoveController } from './love'
import { RestClient } from '@hcengineering/api-client'
import { CollaboratorClient, getClient as getCollaboratorClient } from '@hcengineering/collaborator-client'

interface LLMHistoryRecord {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export class WorkspaceClient {
  client: RestClient

  rate = new RateLimiter(1)

  primarySocialId: SocialId
  aiPerson: Person | undefined
  personUuidBySocialId = new Map<PersonId, PersonUuid>()

  love: LoveController | undefined
  memoryMap = new Map<PersonUuid, AIMemory>()
  userSocialIdByPersonUuid = new Map<PersonUuid, PersonId>()
  initPromise: Promise<void> | undefined

  collaborator: CollaboratorClient | undefined

  constructor (
    readonly storage: StorageAdapter,
    readonly transactorUrl: string,
    readonly token: string,
    readonly wsIds: WorkspaceIds,
    readonly personUuid: AccountUuid,
    readonly socialIds: SocialId[],
    readonly ctx: MeasureContext,
    readonly collaboratorEndpoint: string | undefined,
    readonly llm?: LLMProvider
  ) {
    this.client = connectPlatform(this.token, this.wsIds.uuid, this.transactorUrl)
    this.primarySocialId = pickPrimarySocialId(this.socialIds)
    if (this.collaboratorEndpoint !== undefined && this.collaboratorEndpoint !== '') {
      this.ctx.info('create collaborator client', { endpoint: this.collaboratorEndpoint })
      this.collaborator = getCollaboratorClient(this.wsIds.uuid, this.token, this.collaboratorEndpoint)
    }
    this.initPromise = this.initClient()
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

  /**
   * Remove duplicate AI bot Person records that were left after workspace backup/restore.
   * Finds all SocialIdentity with aiBotEmailSocialKey, keeps only the Person matching
   * current personUuid, and removes the rest along with their SocialIdentities.
   */
  private async cleanupDuplicatePersons (client: RestClient): Promise<void> {
    try {
      const aiSocialIdentities = await client.findAll<SocialIdentity>(contact.class.SocialIdentity, {
        key: aiBotEmailSocialKey
      })

      if (aiSocialIdentities.length <= 1) {
        return
      }

      const personIds = new Set(aiSocialIdentities.map((si) => si.attachedTo))
      const persons = await client.findAll(contact.class.Person, {
        _id: { $in: Array.from(personIds) }
      })

      const duplicatePersons = persons.filter((p) => p.personUuid !== this.personUuid)

      if (duplicatePersons.length === 0) {
        return
      }

      this.ctx.info('Cleaning up duplicate AI bot persons', {
        workspace: this.wsIds.uuid,
        duplicates: duplicatePersons.length,
        keepPersonUuid: this.personUuid
      })

      const duplicatePersonIds = new Set(duplicatePersons.map((p) => p._id))

      // Remove SocialIdentities attached to duplicate persons
      for (const si of aiSocialIdentities) {
        if (duplicatePersonIds.has(si.attachedTo)) {
          await client.remove(si)
        }
      }

      // Remove all SocialIdentities for duplicate persons (not just email ones)
      for (const personId of duplicatePersonIds) {
        const allSocialIds = await client.findAll<SocialIdentity>(contact.class.SocialIdentity, {
          attachedTo: personId
        })
        for (const si of allSocialIds) {
          await client.remove(si)
        }
      }

      // Remove duplicate Person documents
      for (const person of duplicatePersons) {
        await client.remove(person)
        this.ctx.info('Removed duplicate AI bot person', {
          personId: person._id,
          personUuid: person.personUuid,
          name: person.name
        })
      }
    } catch (err: any) {
      this.ctx.error('Failed to cleanup duplicate AI bot persons', { err })
    }
  }

  private async initClient (): Promise<void> {
    await this.cleanupDuplicatePersons(this.client)
    await this.ensureEmployee(this.client)
    await this.checkEmployeeInfo(this.client)

    if (this.aiPerson !== undefined && config.LoveEndpoint !== '') {
      const systemToken = generateToken(systemAccountUuid, this.wsIds.uuid, { service: 'aibot' })
      const systemClient = connectPlatform(systemToken, this.wsIds.uuid, this.transactorUrl)
      this.love = new LoveController(
        this.wsIds.uuid,
        this.ctx.newChild('love', {}, { span: false }),
        this.token,
        systemClient,
        this.aiPerson
      )
    }
    this.ctx.info('Initialized workspace', { workspace: this.wsIds })
  }

  private async checkEmployeeInfo (client: RestClient): Promise<void> {
    this.ctx.info('Upload avatar file', { workspace: this.wsIds })

    try {
      const uploadInfo = await this.storage.stat(this.ctx, this.wsIds, config.AvatarName)

      if (uploadInfo === undefined) {
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

  // Resolve the user's primary social id (PersonId) so the bot can write the
  // user's memory Preference on their behalf (createdBy = user, not the bot).
  private async getUserSocialId (personUuid: PersonUuid): Promise<PersonId | undefined> {
    const cached = this.userSocialIdByPersonUuid.get(personUuid)
    if (cached !== undefined) return cached
    const ids = await this.client?.findAll<SocialIdentity>(contact.class.SocialIdentity, {
      attachedTo: personUuid as unknown as Ref<Person>
    })
    if (ids === undefined || ids.length === 0) return undefined
    const primary = pickPrimarySocialId(ids)._id
    this.userSocialIdByPersonUuid.set(personUuid, primary)
    return primary
  }

  // Read the user's AI memory from the Preference document (created on their behalf).
  private async readMemoryPreference (personUuid: PersonUuid): Promise<AIPersonalData | undefined> {
    return await this.client?.findOne<AIPersonalData>(aiBot.class.AIPersonalData, {
      attachedTo: personUuid as AccountUuid
    })
  }

  // Persist memory to the Preference, on the user's behalf. Creates on first write.
  private async writeMemoryPreference (
    personUuid: PersonUuid,
    memory: { assistantMemory: string, userMemory: string, sharedContext: string }
  ): Promise<void> {
    const modifiedBy = await this.getUserSocialId(personUuid)
    const existing = await this.readMemoryPreference(personUuid)
    if (existing !== undefined) {
      await this.client.update(
        existing,
        { assistantMemory: memory.assistantMemory, userMemory: memory.userMemory, sharedContext: memory.sharedContext },
        false,
        undefined,
        modifiedBy
      )
      return
    }
    await this.client.createDoc<AIPersonalData>(
      aiBot.class.AIPersonalData,
      core.space.Workspace,
      { attachedTo: personUuid as AccountUuid, ...memory },
      undefined,
      undefined,
      modifiedBy
    )
  }

  /** The user's PersonSpace (where their AIRequest status docs live). */
  private async getUserPersonSpace (personUuid: PersonUuid): Promise<Ref<Space> | undefined> {
    const space = await this.client?.findOne(contact.class.PersonSpace, { account: personUuid as AccountUuid })
    return space?._id
  }

  /**
   * Create an AIRequest status doc (processing) in the user's PersonSpace, on the
   * user's behalf. Returns its id so the caller can mark it done/failed. Best-effort:
   * returns undefined if the space can't be resolved (status tracking is non-critical).
   */
  async createAIRequest (
    personUuid: PersonUuid,
    seed: { level: AILevel, modelId: string, kind: string }
  ): Promise<Ref<AIRequest> | undefined> {
    const space = await this.getUserPersonSpace(personUuid)
    if (space === undefined) return undefined
    const modifiedBy = await this.getUserSocialId(personUuid)
    return await this.client.createDoc<AIRequest>(
      aiBot.class.AIRequest,
      space,
      { ...queuedRequest(seed.level, seed.modelId, seed.kind), status: 'processing' },
      undefined,
      undefined,
      modifiedBy
    )
  }

  /** Apply a status patch (done/failed) to an AIRequest, on the user's behalf. */
  async updateAIRequest (
    personUuid: PersonUuid,
    id: Ref<AIRequest>,
    space: Ref<Space>,
    patch: Partial<AIRequest>
  ): Promise<void> {
    const modifiedBy = await this.getUserSocialId(personUuid)
    await this.client.updateDoc(aiBot.class.AIRequest, space, id, patch, false, undefined, modifiedBy)
  }

  // Read the user's AI memory (assistant/user/shared). Source of truth is the
  // Preference; legacy blob memory is migrated on first read. History is no longer
  // kept here — conversation context comes from chunter threads.
  private async getMemory (personUuid: PersonUuid): Promise<AIMemory> {
    const cached = this.memoryMap.get(personUuid)
    if (cached !== undefined) return cached

    const pref = await this.readMemoryPreference(personUuid)

    // One-time migration: pull memory out of the legacy blob if a Preference is absent.
    let blobMemory: AIMemory | undefined
    if (pref === undefined) {
      try {
        const blob = JSON.parse(
          Buffer.concat(await this.storage.read(this.ctx, this.wsIds, 'ai-bot-phr-' + personUuid)).toString()
        )
        blobMemory = {
          assistantMemory: blob.assistantMemory ?? '',
          userMemory: blob.userMemory ?? '',
          sharedContext: blob.sharedContext ?? ''
        }
      } catch (err: any) {
        // No blob: fine.
      }
    }

    const personData =
      pref === undefined && blobMemory === undefined
        ? await this.client?.findOne(contact.mixin.Employee, { personUuid: personUuid as AccountUuid })
        : undefined

    const { memory, migrate } = resolveMemory(pref, blobMemory, personData?.name)
    if (migrate) {
      await this.writeMemoryPreference(personUuid, memory)
    }

    this.memoryMap.set(personUuid, memory)
    return memory
  }

  private async patchMemory (user: PersonUuid | undefined, patch: Partial<AIMemory>): Promise<void> {
    if (user === undefined) return
    const current = await this.getMemory(user)
    const next: AIMemory = { ...current, ...patch }
    this.memoryMap.set(user, next)
    await this.writeMemoryPreference(user, next)
  }

  async updateAssistantMemory (user: PersonUuid | undefined, args: Record<string, any>): Promise<void> {
    await this.patchMemory(user, { assistantMemory: args.memory })
  }

  async updateUserMemory (user: PersonUuid | undefined, args: Record<string, any>): Promise<void> {
    await this.patchMemory(user, { userMemory: args.memory })
  }

  async updateSharedContext (user: PersonUuid | undefined, args: Record<string, any>): Promise<void> {
    await this.patchMemory(user, { sharedContext: args.context })
  }

  async getMemoryForUser (user: PersonUuid): Promise<AIMemory> {
    return await this.getMemory(user)
  }

  private async getAttachments (client: RestClient, objectId: Ref<Doc>): Promise<Attachment[]> {
    return await client.findAll(attachment.class.Attachment, { attachedTo: objectId })
  }

  async processMessageEvent (
    event: AIEventRequest,
    control?: ConsumerControl,
    provider?: LLMProvider,
    level?: AILevel
  ): Promise<void> {
    // Per-provider pipeline passes the resolved provider+level; fall back to the default.
    const llm = provider ?? this.llm
    if (llm === undefined) {
      throw new Error('LLM provider is not configured')
    }

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
    const promptTokens = llm.countTokens([prompt]) ?? 0

    const space = (event as any).objectIdIsSpace != null ? (objectId as Ref<Space>) : event.objectSpace

    // Memory (assistant/user/shared) lives in a Preference; conversation context
    // now comes from the chunter thread, not from a blob history.
    const memory = await this.getMemory(personUuid)

    const useHistory: LLMHistoryRecord[] = []

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

      const contextMessages: ContextMessage[] = []
      for (const msg of lastMessages) {
        let emp: Person | undefined
        const sid = socialIds.get(msg.modifiedBy as any)
        if (sid !== undefined) {
          emp = empAsMap.get(sid.attachedTo)
        }
        const msgRole: 'assistant' | 'user' = this.aiPerson?.personUuid === emp?.personUuid ? 'assistant' : 'user'
        const content = markupToText(msg.message)
        contextMessages.push({
          role: msgRole,
          content,
          tokens: llm.countTokens([{ role: msgRole, content }]) ?? 0
        })
      }

      // Truncate the thread context to fit the model window (oldest dropped first).
      useHistory.push(...buildThreadContext(contextMessages, promptTokens, config.MaxContentTokens))
    }

    // Resolve model + billing multiplier for the request status doc.
    const effectiveLevel = level ?? config.DefaultLevel
    const resolved = resolveModel(effectiveLevel, config.AIProviders)
    const aiRequestSpace = await this.getUserPersonSpace(personUuid)
    const aiRequestId = await this.createAIRequest(personUuid, {
      level: resolved.level,
      modelId: resolved.model.model,
      kind: 'chat'
    })

    const tools = getTools(this, contextMode, personUuid as AccountUuid)
    let chatCompletion
    try {
      chatCompletion = await llm.createChatCompletionWithTools(
        tools,
        prompt,
        contextMode,
        memory.assistantMemory,
        memory.userMemory,
        memory.sharedContext,
        personUuid as AccountUuid,
        this.ctx,
        this.wsIds.uuid,
        [...systemPrompts, ...useHistory],
        true,
        'chat',
        level
      )
    } catch (err: any) {
      if (aiRequestId !== undefined && aiRequestSpace !== undefined) {
        await this.updateAIRequest(personUuid, aiRequestId, aiRequestSpace, failedPatch(err?.message ?? 'error'))
      }
      throw err
    }
    const response = chatCompletion?.completion

    if (response == null) {
      if (aiRequestId !== undefined && aiRequestSpace !== undefined) {
        await this.updateAIRequest(personUuid, aiRequestId, aiRequestSpace, failedPatch('empty response'))
      }
      return
    }

    if (aiRequestId !== undefined && aiRequestSpace !== undefined) {
      await this.updateAIRequest(
        personUuid,
        aiRequestId,
        aiRequestSpace,
        donePatch(chatCompletion?.usage, resolved.model.tokenMultiplier)
      )
    }
    // The reply is persisted as a chunter message below; no separate history blob.
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

  async meetingStarted (meetingId: Ref<MeetingMinutes>): Promise<void> {
    await this.initPromise
    if (this.love !== undefined) {
      const mm = await this.love.getMeeting(meetingId)
      if (mm !== undefined) {
        this.ctx.info('Meeting started, connecting to Love', {
          meetingId,
          autoTranscribe: mm.startWithTranscription ?? false
        })
        await this.love?.connect({
          language: mm.language,
          meetingId: mm._id,
          transcription: mm.startWithTranscription ?? false
        })
      }
    }
  }

  async meetingFinished (meetingId: Ref<MeetingMinutes>): Promise<void> {
    await this.initPromise
    await this.love?.disconnect(meetingId)
  }

  async close (): Promise<void> {
    this.ctx.info('Closed workspace client: ', { workspace: this.wsIds })
  }

  async loveConnect (request: ConnectMeetingRequest): Promise<void> {
    await this.initPromise
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return
    }
    await this.love.connect(request)
  }

  async loveDisconnect (request: DisconnectMeetingRequest): Promise<void> {
    await this.initPromise
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return
    }

    await this.love.disconnect(request.meetingId)
  }

  @withContext('processLoveTranscript')
  async processLoveTranscript (
    ctx: MeasureContext,
    text: string,
    participant: Ref<Person>,
    meeting: Ref<MeetingMinutes>
  ): Promise<void> {
    await this.initPromise
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return
    }

    // Diagnostics: log incoming love transcript for easier tracing
    ctx.info('workspaceClient.processLoveTranscript', {
      room: meeting,
      participant,
      textLength: text.length
    })

    await this.love.processTranscript(text, participant, meeting)
  }

  /**
   * Create a placeholder message for pending transcription
   */
  @withContext('createTranscriptionPlaceholder')
  async createTranscriptionPlaceholder (
    ctx: MeasureContext,
    participant: Ref<Person>,
    meetingId: Ref<MeetingMinutes>,
    startTimeSec: number,
    endTimeSec: number,
    blobId: string
  ): Promise<Ref<ChatMessage> | undefined> {
    await this.initPromise
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return undefined
    }

    return await this.love.createTranscriptionPlaceholder(participant, meetingId, startTimeSec, endTimeSec, blobId)
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
    await this.initPromise
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
    meeting: Ref<MeetingMinutes>,
    timestamp: Timestamp
  ): Promise<boolean> {
    await this.initPromise
    if (this.love === undefined) {
      this.ctx.error('Love controller is not initialized')
      return false
    }

    return await this.love.createTranscriptionMessageWithTimestamp(text, participant, meeting, timestamp)
  }

  async getLoveIdentity (): Promise<IdentityResponse | undefined> {
    await this.initPromise
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
    meetingMinutesId: Ref<MeetingMinutes>,
    blobId: string,
    participant: string,
    startTimeSec: number,
    endTimeSec: number,
    size: number,
    sessionNumber: number
  ): Promise<void> {
    const meetingMinutes = await this.client.findOne<MeetingMinutes>(love.class.MeetingMinutes, {
      _id: meetingMinutesId
    })

    if (meetingMinutes === undefined) {
      this.ctx.warn('No meeting minutes found for room', { participant })
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
