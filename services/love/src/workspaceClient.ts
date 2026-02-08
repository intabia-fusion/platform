//
// Copyright © 2024 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion
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

import activity, { ActivityInfoMessage } from '@hcengineering/activity'
import { RestClient } from '@hcengineering/api-client'
import attachment, { Attachment } from '@hcengineering/attachment'
import contact, { Person, AvatarType } from '@hcengineering/contact'
import core, {
  Data,
  MeasureContext,
  Ref,
  generateId,
  TxFactory,
  systemAccountUuid,
  type AccountUuid,
  type Blob,
  type PersonId,
  type WorkspaceUuid,
  DocumentUpdate,
  AccountRole,
  TxApplyResult,
  SocialIdType
} from '@hcengineering/core'
import drive, { createFile } from '@hcengineering/drive'
import love, {
  MeetingMinutes,
  MeetingStatus,
  ParticipantInfo,
  PendingRecording,
  RecordingFormat,
  RecordingState,
  Room,
  TranscriptionState,
  getFreeRoomPlace
} from '@hcengineering/love'
import { Asset, IntlString } from '@hcengineering/platform'
import { generateToken } from '@hcengineering/server-token'
import { getClient } from './client'
import { RecordingPreset } from './preset'

export class WorkspaceClient {
  private client!: RestClient

  private constructor (
    private readonly workspace: WorkspaceUuid,
    private readonly ctx: MeasureContext
  ) {}

  static async create (workspace: WorkspaceUuid, ctx: MeasureContext): Promise<WorkspaceClient> {
    const instance = new WorkspaceClient(workspace, ctx)
    await instance.initClient(workspace)
    return instance
  }

  async close (): Promise<void> {}

  private async initClient (workspace: WorkspaceUuid): Promise<RestClient> {
    const token = generateToken(systemAccountUuid, workspace, { service: 'love' })
    this.client = await getClient(token, workspace)
    return this.client
  }

  async saveFile (
    uuid: string,
    name: string,
    blob: Blob,
    preset: RecordingPreset,
    meetingMinutes?: Ref<MeetingMinutes>
  ): Promise<void> {
    this.ctx.info('Save recording', { workspace: this.workspace, meetingMinutes })
    const current = await this.client.findOne(drive.class.Drive, { _id: love.space.Drive })
    if (current === undefined) {
      await this.client.createDoc(
        drive.class.Drive,
        core.space.Space,
        {
          private: false,
          archived: false,
          members: [],
          name: 'Records',
          description: 'Office records',
          type: drive.spaceType.DefaultDrive,
          autoJoin: true
        },
        love.space.Drive
      )
    }
    const data = {
      file: uuid as Ref<Blob>,
      size: blob.size,
      type: blob.contentType,
      lastModified: blob.modifiedOn,
      // hardcoded values from preset we use
      // https://docs.livekit.io/realtime/egress/overview/#EncodingOptionsPreset
      metadata: {
        originalHeight: preset.height,
        originalWidth: preset.width
      }
    }
    await createFile(this.client, love.space.Drive, drive.ids.Root, { ...data, title: name })
    await this.attachToMeetingMinutes({ ...data, name }, meetingMinutes)
  }

  async attachToMeetingMinutes (
    data: Omit<Data<Attachment>, 'attachedToClass' | 'attachedTo' | 'collection'>,
    ref?: Ref<MeetingMinutes>
  ): Promise<void> {
    if (ref === undefined) return

    const meeting = await this.client.findOne(love.class.MeetingMinutes, { _id: ref })
    if (meeting === undefined) {
      this.ctx.error('Meeting not found', { _id: ref })
      return
    }

    await this.client.addCollection(
      attachment.class.Attachment,
      meeting.space,
      meeting._id,
      meeting._class,
      'attachments',
      data
    )
  }

  /**
   * Add an ActivityInfoMessage to a MeetingMinutes document.
   * `message` may be a simple string (will be converted to { en: string }) or an Intl-like object.
   * `modifiedBy` allows specifying the person who performed the action (for participant join/leave).
   */
  async addActivityToMeeting (
    message: IntlString,
    ref: Ref<MeetingMinutes>,
    props?: Record<string, any>,
    icon?: string,
    modifiedBy?: PersonId
  ): Promise<void> {
    if (ref === undefined) return

    const meeting = await this.client.findOne(love.class.MeetingMinutes, { _id: ref })
    if (meeting === undefined) {
      this.ctx.error('Meeting not found', { _id: ref })
      return
    }

    await this.client.addCollection<MeetingMinutes, ActivityInfoMessage>(
      activity.class.ActivityInfoMessage,
      meeting.space,
      meeting._id,
      meeting._class,
      'activity',
      {
        message,
        props: props ?? {},
        icon: icon as Asset
      },
      undefined, // id
      undefined, // modifiedOn
      modifiedBy // modifiedBy - use participant's PersonId
    )
    this.ctx.info('[WorkspaceClient.addActivityToMeeting] Added activity message', { meeting: meeting._id, message })
  }

  /**
   * Activate meeting (set status to Active).
   * No activity message is added - status change is reflected in meeting document.
   */
  async activateMeeting (ref: Ref<MeetingMinutes>): Promise<void> {
    if (ref === undefined) return

    const meeting = await this.client.findOne(love.class.MeetingMinutes, { _id: ref })
    if (meeting === undefined) {
      this.ctx.error('Meeting not found', { _id: ref })
      return
    }

    await this.client.update(meeting, { status: MeetingStatus.Active })
    this.ctx.info('Activated meeting', { meeting: meeting._id })
  }

  /**
   * Mark meeting as finished.
   * No activity message is added - status change is reflected in meeting document.
   */
  async finishMeeting (ref: Ref<MeetingMinutes>, meetingEnd?: number): Promise<void> {
    if (ref === undefined) return

    const meeting = await this.client.findOne(love.class.MeetingMinutes, { _id: ref })
    if (meeting === undefined) {
      this.ctx.error('Meeting not found', { _id: ref })
      return
    }

    const endTs = meetingEnd ?? Date.now()
    const upd: DocumentUpdate<MeetingMinutes> = { status: MeetingStatus.Finished, meetingEnd: endTs }
    if (meeting.transcriptionState === TranscriptionState.Transcribing) {
      upd.transcriptionState = TranscriptionState.Finished
    }
    if (meeting.recordingState === RecordingState.Recording) {
      meeting.recordingState = RecordingState.Finished
    }
    await this.client.update(meeting, upd)
    this.ctx.info('Marked meeting as finished', { meeting: meeting._id, meetingEnd: endTs })
  }

  async checkUnfinishedMeetings (meetingMinutes: Ref<MeetingMinutes>[]): Promise<void> {
    try {
      // Find all active or pending meetings in this workspace
      const meetings = await this.client.findAll(love.class.MeetingMinutes, {
        _id: { $nin: meetingMinutes },
        status: { $ne: MeetingStatus.Finished }
      })

      for (const meeting of meetings) {
        await this.finishMeeting(meeting._id, Date.now())
      }
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.checkUnfinishedMeetings] Failed', { error: err?.message ?? String(err) })
    }
  }

  /**
   * Called from webhook when LiveKit reports a participant joined.
   * Ensures there is a ParticipantInfo for the given person and meeting.
   */
  async upsertParticipantFromLiveKit (
    person: Ref<Person>,
    name: string | null,
    account: AccountUuid | null,
    meeting: Ref<MeetingMinutes>,
    sessionId: string
  ): Promise<void> {
    try {
      this.ctx.info('[WorkspaceClient.upsertParticipantFromLiveKit] Starting', { meeting, person, name, sessionId })

      const meetingDoc = await this.client.findOne(love.class.MeetingMinutes, { _id: meeting })
      this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] Resolved meeting', {
        meeting,
        meetingDocFound: meetingDoc !== undefined
      })

      if (meetingDoc === undefined) {
        this.ctx.warn('[WorkspaceClient.upsertParticipantFromLivekit] Meeting document not found, cannot proceed', {
          meeting
        })
        return
      }
      const attachedRoom: Ref<Room> | undefined = meetingDoc.attachedTo as Ref<Room>

      const infos = await this.client.findAll(love.class.ParticipantInfo, {
        person,
        meeting,
        sessionId
      })

      if (infos.length > 1) {
        // Remove duplicates, keep the first one
        this.ctx.warn('[WorkspaceClient.upsertParticipantFromLivekit] Duplicate ParticipantInfo entries found', {
          person,
          meeting,
          duplicateCount: infos.length - 1
        })
        for (let i = 1; i < infos.length; i++) {
          const infoToRemove = infos[i]
          await this.client.remove(infoToRemove)
          this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] Removed duplicate ParticipantInfo', {
            infoId: infoToRemove._id,
            person,
            meeting
          })
        }
        // Keep only the first one for further processing
        infos.splice(1)
      }

      if (infos.length > 0) {
        // ParticipantInfo already exists - update it with new meeting/session info
        for (const info of infos) {
          this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] Updating existing ParticipantInfo', {
            infoId: info._id,
            person,
            meeting
          })
          // Ensure the `meeting` field is set so clients can reliably discover current meeting
          // for this participant (fixes missing subscribe to join requests / knock notifications).
          await this.client.update(info, {
            meeting,
            room: attachedRoom ?? info.room,
            name: name ?? info.name,
            sessionId,
            account: account ?? info.account
          })
          this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] Updated ParticipantInfo', {
            infoId: info._id,
            person,
            meeting
          })

          // Ensure cell uniqueness - if collision detected, reassign to a free place atomically
          try {
            const updatedInfo = await this.client.findOne(love.class.ParticipantInfo, { _id: info._id })
            if (updatedInfo !== undefined) {
              const colliders = await this.client.findAll(love.class.ParticipantInfo, {
                meeting,
                x: updatedInfo.x,
                y: updatedInfo.y
              })
              const other = colliders.find((p) => p._id !== updatedInfo._id)
              if (other !== undefined) {
                // collision - pick a free place and try to update via apply
                const roomDoc =
                  attachedRoom !== null ? await this.client.findOne(love.class.Room, { _id: attachedRoom }) : undefined
                if (roomDoc !== undefined) {
                  const participants = await this.client.findAll(love.class.ParticipantInfo, { meeting })
                  const place = getFreeRoomPlace(roomDoc, participants, person)
                  const tf = new TxFactory(core.account.System)
                  const updateTx = tf.createTxUpdateDoc(
                    love.class.ParticipantInfo,
                    core.space.Workspace,
                    updatedInfo._id,
                    { x: place.x, y: place.y }
                  )
                  const applyTx = tf.createTxApplyIf(
                    core.space.Workspace,
                    `${meeting}_${updatedInfo._id}_place`,
                    [],
                    [{ _class: love.class.ParticipantInfo, query: { meeting, x: place.x, y: place.y } }],
                    [updateTx],
                    'reassignParticipantPlace',
                    true
                  )
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
                    this.ctx.info(
                      '[WorkspaceClient.upsertParticipantFromLivekit] Reassigned participant to free place',
                      {
                        infoId: updatedInfo._id,
                        place
                      }
                    )
                  } else {
                    this.ctx.warn(
                      '[WorkspaceClient.upsertParticipantFromLivekit] Failed to reassign participant place',
                      {
                        infoId: updatedInfo._id,
                        place
                      }
                    )
                  }
                }
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            this.ctx.error('[WorkspaceClient.upsertParticipantFromLivekit] Collision handling failed', {
              error: msg,
              meeting,
              person
            })
          }
        }
      } else {
        // Create new ParticipantInfo - place will be allocated atomically to avoid collisions
        this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] Creating new ParticipantInfo', {
          person,
          meeting,
          attachedRoom
        })
        const txFactory = new TxFactory(core.account.System)
        const maxAttempts = 5
        let created = false
        let newId: Ref<ParticipantInfo> | undefined
        const roomDoc =
          attachedRoom !== null ? await this.client.findOne(love.class.Room, { _id: attachedRoom }) : undefined
        for (let attempt = 0; attempt < maxAttempts && !created; attempt++) {
          const participants = await this.client.findAll(love.class.ParticipantInfo, { meeting })
          const place = roomDoc !== undefined ? getFreeRoomPlace(roomDoc, participants, person) : { x: 0, y: 0 }
          const oid = generateId<ParticipantInfo>()
          const createTx = txFactory.createTxCreateDoc(
            love.class.ParticipantInfo,
            core.space.Workspace,
            {
              person,
              name: name ?? '',
              meeting,
              room: attachedRoom ?? null,
              x: place.x,
              y: place.y,
              sessionId: sessionId ?? null,
              account: account ?? null
            } as any,
            oid
          )
          const applyTx = txFactory.createTxApplyIf(
            core.space.Workspace,
            `${meeting}`,
            [],
            [
              { _class: love.class.ParticipantInfo, query: { meeting, person } },
              { _class: love.class.ParticipantInfo, query: { meeting, x: place.x, y: place.y } }
            ],
            [createTx],
            'createParticipant',
            true
          )
          try {
            const res = (await this.client.tx(applyTx)) as TxApplyResult
            if (res.success) {
              created = true
              newId = oid
              this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] Created ParticipantInfo (apply)', {
                newId,
                person,
                meeting,
                place
              })
              break
            } else {
              this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] create apply failed, retrying', {
                attempt,
                meeting,
                place
              })
              await new Promise((resolve) => setTimeout(resolve, 50))
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            this.ctx.error('[WorkspaceClient.upsertParticipantFromLivekit] create apply error', { error: msg })
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
        }
        if (!created) {
          // Fallback
          const fallbackId = await this.client.createDoc(love.class.ParticipantInfo, core.space.Workspace, {
            person,
            name: name ?? '',
            kind: 'user',
            meeting,
            room: attachedRoom ?? null,
            x: -1, // -1 will show a person on random free place
            y: -1,
            sessionId: sessionId ?? null,
            account: account ?? null
          } as any)
          this.ctx.info('[WorkspaceClient.upsertParticipantFromLivekit] Created ParticipantInfo (fallback)', {
            newId: fallbackId,
            person,
            meeting
          })
        }
      }
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.upsertParticipantFromLivekit] Failed', {
        error: err?.message ?? String(err),
        meeting,
        person
      })
    }
  }

  /**
   * Called from webhook when LiveKit reports a participant left.
   * Removes any ParticipantInfo records associated with the person.
   */
  async removeParticipantFromLiveKit (
    meeting: Ref<MeetingMinutes>,
    person: Ref<Person>,
    sessionId: string
  ): Promise<void> {
    try {
      const allInfos = await this.client.findAll(love.class.ParticipantInfo, { meeting, sessionId, person })
      const infos = allInfos.filter((it) => it.person === person)
      for (const info of infos) {
        await this.client.remove(info)
      }
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.removeParticipantFromLivekit] Failed', {
        error: err?.message ?? String(err),
        person
      })
    }
  }

  /**
   * Find a Person ref by its id (returns undefined when not found).
   */
  async findPersonRefById (personId: Ref<Person>): Promise<Ref<Person> | undefined> {
    try {
      const persons = await this.client.findAll(contact.class.Person, { _id: personId })
      if (persons.length > 0) return persons[0]._id
      return undefined
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.findPersonRefById] Failed', { error: err?.message ?? String(err), personId })
      return undefined
    }
  }

  /**
   * Find a person by name (attempts a few strategies: exact first/last match, full name match, case-insensitive regex).
   * Returns the first matching Person ref or undefined if not found.
   */
  async findPersonByName (firstName?: string, lastName?: string): Promise<Ref<Person> | undefined> {
    try {
      // Build an exact match query first
      const q: any = {}
      if (firstName !== undefined && firstName !== '') q.firstName = firstName
      if (lastName !== undefined && lastName !== '') q.lastName = lastName

      let persons: Person[] = []
      if (Object.keys(q).length > 0) {
        persons = (await this.client.findAll(contact.class.Person, q, { limit: 10 })) as unknown as Person[]
      }

      // Fallback: try full `name` exact match
      if (persons.length === 0 && firstName != null && lastName != null) {
        const full = `${firstName} ${lastName}`
        persons = (await this.client.findAll(
          contact.class.Person,
          { name: full },
          { limit: 10 }
        )) as unknown as Person[]
      }

      // Fallback: case-insensitive regex match if nothing found so far
      if (persons.length === 0 && firstName != null) {
        const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regexQ: any = {}
        if (firstName !== undefined) regexQ.firstName = { $regex: `^${escapeRegExp(firstName)}$`, $options: 'i' }
        if (lastName !== undefined) regexQ.lastName = { $regex: `^${escapeRegExp(lastName ?? '')}$`, $options: 'i' }
        persons = (await this.client.findAll(contact.class.Person, regexQ, { limit: 10 })) as unknown as Person[]
      }

      if (persons.length > 0) return persons[0]._id
      return undefined
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.findPersonByName] Failed', {
        error: err?.message ?? String(err),
        firstName,
        lastName
      })
      return undefined
    }
  }

  /**
   * Create a guest Person record with provided name parts.
   * Uses a simple payload (name, firstName, lastName, avatarType) and returns created Person ref.
   */
  async createGuestPerson (firstName: string, lastName?: string): Promise<Ref<Person> | undefined> {
    try {
      const name = lastName != null ? `${firstName} ${lastName}` : firstName
      const payload: any = {
        name,
        firstName: firstName ?? '',
        lastName: lastName ?? '',
        avatarType: AvatarType.COLOR
      }

      const personId = await this.client.createDoc(contact.class.Person, contact.space.Contacts, payload)
      this.ctx.info('[WorkspaceClient.createGuestPerson] Created person', { personId, name })

      // Ensure Employee mixin for this Person (retry on transient failure)
      try {
        await this.ensureEmployeeMixin(personId)
        this.ctx.info('[WorkspaceClient.createGuestPerson] Ensured Employee mixin for person', { personId })
      } catch (err: any) {
        this.ctx.error('[WorkspaceClient.createGuestPerson] Unexpected error ensuring Employee mixin', {
          error: err?.message ?? String(err),
          personId
        })
      }
      await this.createLoveSocialIdentity(personId, name)

      return personId
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.createGuestPerson] Failed', {
        error: err?.message ?? String(err),
        firstName,
        lastName
      })
      return undefined
    }
  }

  // TODO: Pending remove
  async ensureEmployeeMixin (personId: Ref<Person>): Promise<boolean> {
    await this.ctx.with('create-employee', {}, async () => {
      await this.client.createMixin(personId, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
        active: true,
        role: AccountRole.Guest
      })
    })
    return true
  }

  async createLoveSocialIdentity (personRef: Ref<Person>, name: string): Promise<PersonId> {
    // Ok we do not have one, let's create a new one with the same name as the Person
    return (await this.client.addCollection(
      contact.class.SocialIdentity,
      contact.space.Contacts,
      personRef,
      contact.class.Person,
      'socialIds',
      {
        type: SocialIdType.LOVE,
        key: personRef, // Using personRef as key for simplicity
        value: personRef
      }
    )) as unknown as PersonId
  }

  async getCreatePersonIdByPersonRef (personRef: Ref<Person>, name: string): Promise<PersonId | undefined> {
    try {
      const socialIds = await this.client.findAll(contact.class.SocialIdentity, { attachedTo: personRef }, { limit: 1 })
      if (socialIds.length > 0) {
        return socialIds[0]._id as PersonId
      }

      // Ok we do not have one, let's create a new one with the same name as the Person
      return await this.createLoveSocialIdentity(personRef, name)
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.getPersonIdByPersonRef] Failed', {
        error: err?.message ?? String(err),
        personRef
      })
      return undefined
    }
  }

  /**
   * Find MeetingMinutes document by id.
   */
  async findMeetingById (meetingId: Ref<MeetingMinutes>): Promise<MeetingMinutes | undefined> {
    try {
      return await this.client.findOne(love.class.MeetingMinutes, { _id: meetingId })
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.findMeetingById] Failed', { error: err?.message ?? String(err), meetingId })
      return undefined
    }
  }

  /**
   * Find all ParticipantInfo entries for a given meeting.
   */
  async findParticipantInfosByMeeting (meeting: Ref<MeetingMinutes>): Promise<ParticipantInfo[]> {
    try {
      return await this.client.findAll(love.class.ParticipantInfo, { meeting })
    } catch (err: any) {
      return []
    }
  }

  /**
   * Remove a ParticipantInfo entry by its document ID.
   */
  async removeParticipantInfoById (participantInfoId: Ref<ParticipantInfo>): Promise<void> {
    try {
      const info = await this.client.findOne(love.class.ParticipantInfo, { _id: participantInfoId })
      if (info !== undefined) {
        await this.client.remove(info)
      }
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.removeParticipantInfoById] Failed', {
        error: err?.message ?? String(err),
        participantInfoId
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PendingRecording management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a PendingRecording document when recording starts (from /startRecord endpoint).
   * This tracks in-progress recordings until they complete (egress_ended webhook).
   * Uses addCollection to attach to MeetingMinutes.
   */
  async createPendingRecording (params: {
    meeting: Ref<MeetingMinutes>
    format: RecordingFormat
    roomName: string
    name: string
    egressId?: string
  }): Promise<Ref<PendingRecording> | undefined> {
    try {
      const meetingDoc = await this.client.findOne(love.class.MeetingMinutes, { _id: params.meeting })
      if (meetingDoc === undefined) {
        this.ctx.error('[WorkspaceClient.createPendingRecording] Meeting not found', { meeting: params.meeting })
        return undefined
      }

      const docId = await this.client.addCollection(
        love.class.PendingRecording,
        meetingDoc.space,
        meetingDoc._id,
        meetingDoc._class,
        'recordings',
        {
          format: params.format,
          startedAt: Date.now(),
          roomName: params.roomName,
          name: params.name,
          egressId: params.egressId
        }
      )
      this.ctx.info('[WorkspaceClient.createPendingRecording] Created', {
        docId,
        meeting: params.meeting,
        format: params.format,
        roomName: params.roomName,
        name: params.name
      })
      return docId
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.createPendingRecording] Failed', {
        error: err?.message ?? String(err),
        meeting: params.meeting,
        name: params.name
      })
      return undefined
    }
  }

  /**
   * Find a PendingRecording by its egress ID.
   */
  async findPendingRecordingByEgressId (egressId: string): Promise<PendingRecording | undefined> {
    try {
      return await this.client.findOne(love.class.PendingRecording, { egressId })
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.findPendingRecordingByEgressId] Failed', {
        error: err?.message ?? String(err),
        egressId
      })
      return undefined
    }
  }

  /**
   * Find all PendingRecording entries for a given meeting.
   */
  async findPendingRecordingsByMeeting (meeting: Ref<MeetingMinutes>): Promise<PendingRecording[]> {
    try {
      return await this.client.findAll(love.class.PendingRecording, { attachedTo: meeting })
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.findPendingRecordingsByMeeting] Failed', {
        error: err?.message ?? String(err),
        meeting
      })
      return []
    }
  }

  /**
   * Remove a PendingRecording document by its egress ID and return the removed document.
   * Called when egress (recording) ends.
   */
  async removePendingRecording (pendingRecording: PendingRecording): Promise<void> {
    try {
      await this.client.remove(pendingRecording)
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.removePendingRecordingByEgressId] Failed', {
        error: err?.message ?? String(err)
      })
      return undefined
    }
  }

  /**
   * Update a PendingRecording's size (called during egress_updated webhooks).
   */
  async updatePendingRecordingSize (egressId: string, size: number): Promise<void> {
    try {
      const pending = await this.client.findOne(love.class.PendingRecording, { egressId })
      if (pending !== undefined) {
        await this.client.update(pending, { size })
        this.ctx.info('[WorkspaceClient.updatePendingRecordingSize] Updated', {
          docId: pending._id,
          egressId,
          size
        })
      }
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.updatePendingRecordingSize] Failed', {
        error: err?.message ?? String(err),
        egressId,
        size
      })
    }
  }

  /**
   * Update MeetingMinutes recording state.
   */
  async updateMeetingRecordingState (meetingDoc: MeetingMinutes, state: RecordingState): Promise<void> {
    try {
      await this.client.update(meetingDoc, { recordingState: state })
      this.ctx.info('[WorkspaceClient.updateMeetingRecordingState] Updated', { meeting: meetingDoc._id, state })
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.updateMeetingRecordingState] Failed', {
        error: err?.message ?? String(err),
        meeting: meetingDoc._id,
        state
      })
    }
  }

  /**
   * Remove a PendingRecording document by its document ID.
   */
  async removePendingRecordingById (pendingId: Ref<PendingRecording>): Promise<void> {
    try {
      const pending = await this.client.findOne(love.class.PendingRecording, { _id: pendingId })
      if (pending !== undefined) {
        await this.client.remove(pending)
      }
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.removePendingRecordingById] Failed', {
        error: err?.message ?? String(err),
        pendingId
      })
    }
  }

  /**
   * Find the first active PendingRecording for a meeting.
   */
  async findActivePendingRecording (meeting: Ref<MeetingMinutes>): Promise<PendingRecording | undefined> {
    try {
      return await this.client.findOne(love.class.PendingRecording, { attachedTo: meeting })
    } catch (err: any) {
      this.ctx.error('[WorkspaceClient.findActivePendingRecording] Failed', {
        error: err?.message ?? String(err),
        meeting
      })
      return undefined
    }
  }
}
