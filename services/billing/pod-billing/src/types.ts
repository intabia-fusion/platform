//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { MeasureContext, type WorkspaceUuid } from '@hcengineering/core'

export interface LiveKitSessionsUsageData {
  day: string
  bandwidth: number
  minutes: number
}

export interface LiveKitEgressUsageData {
  day: string
  minutes: number
}

export interface LiveKitUsageData {
  sessions: LiveKitSessionsUsageData[]
  egress: LiveKitEgressUsageData[]
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

export interface ParticipantMinutesUsage {
  totalMinutes: number
}

export interface ParticipantDailyUsage {
  day: string
  totalMinutes: number
  maxParticipants: number
  avgMeetingDurationMinutes: number
  maxMeetingDurationMinutes: number
}

export interface AiTranscriptUsage {
  totalDurationSeconds: number
}

export interface AiTokensUsage {
  reason: string
  totalTokens: number
}

export interface AiUsageData {
  transcript: AiTranscriptUsage
  tokens: AiTokensUsage[]
}

export interface AiTranscriptDailyUsage {
  day: string
  totalDurationSeconds: number
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
}

export interface BillingDB {
  getLiveKitStats: (ctx: MeasureContext, workspace: WorkspaceUuid, start: Date, end: Date) => Promise<LiveKitUsageData>
  listLiveKitSessions: (ctx: MeasureContext, workspace: WorkspaceUuid) => Promise<LiveKitSessionData[] | null>
  listLiveKitEgress: (ctx: MeasureContext, workspace: WorkspaceUuid) => Promise<LiveKitEgressData[] | null>
  setLiveKitSessions: (ctx: MeasureContext, data: LiveKitSessionData[]) => Promise<void>
  setLiveKitEgress: (ctx: MeasureContext, data: LiveKitEgressData[]) => Promise<void>

  pushParticipantSessions: (ctx: MeasureContext, data: LiveKitParticipantSessionData[]) => Promise<void>
  getParticipantMinutes: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ) => Promise<ParticipantMinutesUsage>
  getParticipantDailyStats: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ) => Promise<ParticipantDailyUsage[]>

  pushAiTranscriptData: (ctx: MeasureContext, data: AiTranscriptData[]) => Promise<void>
  getAiTranscriptLastData: (ctx: MeasureContext) => Promise<AiTranscriptData | undefined>
  getAiTranscriptStats: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start?: Date,
    end?: Date
  ) => Promise<AiTranscriptUsage>
  getAiTranscriptDailyStats: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ) => Promise<AiTranscriptDailyUsage[]>

  pushAiTokensData: (ctx: MeasureContext, data: AiTokensData[]) => Promise<void>
  getAiTokensStats: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start?: Date,
    end?: Date
  ) => Promise<AiTokensUsage[]>

  // usage-delta accumulation (idempotent by ref); returns true if delta was new
  accumulateUsageDelta: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    metric: UsageMetric,
    amount: number,
    ref: string
  ) => Promise<boolean>
  cleanupUsageDeltaDedup: (ctx: MeasureContext, retentionDays: number) => Promise<void>

  // per-workspace per-category limit state
  getLimitState: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    category: LimitCategory
  ) => Promise<WorkspaceLimitState | undefined>
  upsertLimitState: (ctx: MeasureContext, state: WorkspaceLimitState) => Promise<void>
  getAllExhaustedStates: (ctx: MeasureContext) => Promise<WorkspaceLimitState[]>
}

// --- billing-usage queue ---
// Single topic (QueueTopic.BillingUsage) carries every billing event as a discriminated union on `kind`.

export type UsageMetric = 'tokens' | 'transcript' | 'storage' | 'meetingMinutes'
export type LimitCategory = 'disk' | 'tokens' | 'transcript' | 'meetingMinutes'

/** Numeric usage delta (idempotent by ref). */
export interface BillingUsageMessage {
  kind: 'usage'
  workspace: WorkspaceUuid
  metric: UsageMetric
  amount: number
  /** Idempotency key — duplicate ref for same workspace+metric is ignored. */
  ref: string
}

/** Structured LiveKit records pushed by love (session/egress/participant). */
export type LiveKitRecordMessage =
  | { kind: 'session', data: LiveKitSessionData[] }
  | { kind: 'egress', data: LiveKitEgressData[] }
  | { kind: 'participant', data: LiveKitParticipantSessionData[] }

/** Everything on the billing-usage topic. */
export type BillingMessage = BillingUsageMessage | LiveKitRecordMessage

/** Per-workspace per-category limit state stored in billing DB. */
export interface WorkspaceLimitState {
  workspace: WorkspaceUuid
  category: LimitCategory
  used: number
  limitValue: number // 0 = unlimited
  exhausted: boolean
}
