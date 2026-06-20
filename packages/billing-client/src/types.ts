import { WorkspaceUuid } from '@hcengineering/core'

export interface BillingStats {
  liveKitStats: LiveKitStats
  datalakeStats: DatalakeStats
  aiStats: AiStats
  participantDailyStats: ParticipantDailyStats[]
  transcriptDailyStats: TranscriptDailyStats[]
}

export interface ParticipantDailyStats {
  day: string
  totalMinutes: number
  maxParticipants: number
  avgMeetingDurationMinutes: number
  maxMeetingDurationMinutes: number
}

export interface TranscriptDailyStats {
  day: string
  totalDurationSeconds: number
}

export interface DatalakeStats {
  count: number
  size: number
  byType: DatalakeStatsByType[]
}

export interface DatalakeStatsByType {
  type: string
  count: number
  size: number
}

export interface LiveKitStats {
  sessions: LiveKitSessionsStats[]
  egress: LiveKitEgressStats[]
}

export interface LiveKitSessionsStats {
  day: string
  bandwidth: number
  minutes: number
}

export interface LiveKitEgressStats {
  day: string
  minutes: number
}

export interface LiveKitSessionData {
  workspace: string
  room: string
  sessionId: string
  sessionStart: string
  sessionEnd: string
  bandwidth: number
  minutes: number
}

export interface LiveKitEgressData {
  workspace: string
  room: string
  egressId: string
  egressStart: string
  egressEnd: string
  duration: number
}

export interface LiveKitParticipantSessionData {
  workspace: string
  participantId: string
  sessionId: string
  room: string
  joinedAt: string
  leftAt: string
  durationSeconds: number
}

export interface AiTranscriptStats {
  totalDurationSeconds: number
}

export interface AiTokensStats {
  reason: string
  totalTokens: number
  providerId?: string
  model?: string
  level?: string
}

export interface AiStats {
  transcript: AiTranscriptStats
  tokens: AiTokensStats[]
}

export interface AiTranscriptData {
  workspace: WorkspaceUuid
  day: string
  lastRequestId: string
  lastStartTime: string
  durationSeconds: number
  usd: number
}

export interface AiTokensData {
  workspace: WorkspaceUuid
  reason: string
  tokens: number
  date: string
  // AI usage dimensions for per-provider/model/level reporting and provider pools.
  providerId?: string
  model?: string
  level?: string
}

export interface LargestSpaceInfo {
  spaceId: string
  size: number
}

export type ProviderPoolKind = 'purchased' | 'local'
export type ProviderPoolPeriod = 'monthly' | 'daily' | 'none'

export interface ProviderPool {
  providerId: string
  kind: ProviderPoolKind
  purchasedTokens: number
  period: ProviderPoolPeriod
  periodStart: string
  usedTokens: number
  exhausted: boolean
  notified80: boolean
  notified100: boolean
}

export interface ProviderPoolConfig {
  providerId: string
  kind: ProviderPoolKind
  purchasedTokens: number
  period: ProviderPoolPeriod
  periodStart?: string
}

export interface TokenWindowUsage {
  used: number
  windowHours: number
}

export interface WorkspaceTokenWindows {
  workspace: WorkspaceUuid
  window5h: TokenWindowUsage
  week: TokenWindowUsage
}

export type AiTokensGroupBy = 'model' | 'level' | 'provider' | 'workspace'

export interface AiTokensBreakdown {
  providerId?: string
  model?: string
  level?: string
  workspace?: WorkspaceUuid
  totalTokens: number
}
