import { Event, Schedule } from '@hcengineering/calendar'
import { Person } from '@hcengineering/contact'
import { AccountUuid, AttachedDoc, Doc, MarkupBlobRef, Ref, Timestamp } from '@hcengineering/core'
import { Preference } from '@hcengineering/preference'

export enum RoomAccess {
  Open,
  Knock,
  DND
}

export enum RoomType {
  Video,
  Audio,
  Reception
}

export interface Floor extends Doc {
  name: string
}

export enum TranscriptionStatus {
  Idle = 'idle',
  InProgress = 'inProgress',
  Completed = 'completed'
}

/**
 * Transcription state for MeetingMinutes - stored in DB as activity status
 */
export enum TranscriptionState {
  NotStarted = 0,
  Transcribing = 1,
  Finished = 2
}

/**
 * Recording state for MeetingMinutes - stored in DB as activity status
 */
export enum RecordingState {
  NotStarted = 0,
  Recording = 1,
  Finished = 2
}

export type RoomLanguage =
  | 'bg'
  | 'ca'
  | 'zh'
  | 'zh-TW'
  | 'zh-HK'
  | 'cs'
  | 'da'
  | 'nl'
  | 'en'
  | 'en-US'
  | 'en-AU'
  | 'en-GB'
  | 'en-NZ'
  | 'en-IN'
  | 'et'
  | 'fi'
  | 'nl-BE'
  | 'fr'
  | 'fr-CA'
  | 'de'
  | 'de-CH'
  | 'el'
  | 'hi'
  | 'hu'
  | 'id'
  | 'it'
  | 'ja'
  | 'ko'
  | 'lv'
  | 'lt'
  | 'ms'
  | 'no'
  | 'pl'
  | 'pt'
  | 'pt-br'
  | 'pt-PT'
  | 'ro'
  | 'ru'
  | 'sk'
  | 'es'
  | 'es-419'
  | 'sv'
  | 'th'
  | 'tr'
  | 'uk'
  | 'vi'

export interface RoomMetadata {
  projectKey?: string
  recording?: boolean
  transcription?: TranscriptionStatus
  language?: RoomLanguage
}

export interface Room extends Doc {
  name: string
  type: RoomType
  access: RoomAccess
  floor: Ref<Floor>
  width: number
  height: number
  x: number
  y: number
  language: RoomLanguage
  startWithTranscription: boolean
  startWithRecording: boolean
  description: MarkupBlobRef | null
  attachments?: number
  meetings?: number
  messages?: number
}

export interface Office extends Room {
  person: Ref<Person> | null
}

// transient data for status
export interface ParticipantInfo extends Doc {
  kind: 'user' | 'agent'
  // isActive: boolean (disabled until server connection to check it for all active meetings)
  person: Ref<Person>
  name: string
  meeting: Ref<MeetingMinutes>
  room?: Ref<Room>
  x: number
  y: number
  sessionId: string | null
  account: AccountUuid | null
}

export interface RoomInfo extends Doc {
  persons: Ref<Person>[]
  room: Ref<Room>
  isOffice: boolean
}

export interface MeetingEventLink extends Event {
  room: Ref<Room>
}

export interface MeetingSchedule extends Schedule {
  room: Ref<Room>
}

export interface DevicesPreference extends Preference {
  micEnabled: boolean
  noiseCancellation: boolean
  blurRadius: number
  camEnabled: boolean
}

export enum MeetingStatus {
  Active = 0,
  Finished = 1,
  Pending = 2
}

export const transcriptionStateLabel = {
  [TranscriptionState.NotStarted]: 'NotStarted',
  [TranscriptionState.Transcribing]: 'Transcribing',
  [TranscriptionState.Finished]: 'Finished'
}

export const recordingStateLabel = {
  [RecordingState.NotStarted]: 'NotStarted',
  [RecordingState.Recording]: 'Recording',
  [RecordingState.Finished]: 'Finished'
}

// Meeting minutes
export interface MeetingMinutes extends AttachedDoc {
  title: string
  description: MarkupBlobRef | null

  status: MeetingStatus
  transcriptionState: TranscriptionState
  recordingState: RecordingState
  meetingEnd?: Timestamp

  transcription?: number
  messages?: number
  attachments?: number
  /** Number of active recordings (PendingRecording collection) */
  recordings?: number

  access: RoomAccess
  language: RoomLanguage
}

/**
 * Recording format type for PendingRecording
 */
export type RecordingFormat = 'video' | 'audio'

/**
 * Pending recording document created when recording starts.
 * Used to track in-progress recordings until they complete (egress_ended).
 * Attached to MeetingMinutes as a collection to show recording progress in UI.
 */
export interface PendingRecording extends AttachedDoc {
  /** LiveKit egress ID for this recording (set when egress_started webhook arrives) */
  egressId?: string
  /** Recording format: video (room composite) or audio (track) */
  format: RecordingFormat
  /** When the recording started (Unix timestamp in milliseconds) */
  startedAt: Timestamp
  /** Room name from LiveKit (contains workspace and meetingId) */
  roomName: string
  /** Display name for the recording file (e.g., "Room_2024-01-15_12-30-00.mp4") */
  name: string
  /** Current size in bytes (updated via egress_updated webhooks) */
  size?: number
}
