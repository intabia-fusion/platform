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
  providerId?: string
  model?: string
  level?: string
}

export type AiTokensGroupBy = 'model' | 'level' | 'provider' | 'workspace'

export interface AiTokensBreakdown {
  providerId?: string
  model?: string
  level?: string
  workspace?: WorkspaceUuid
  totalTokens: number
}

export interface ProviderTokenTotal {
  providerId: string
  totalTokens: number
}

// Token usage for a single rolling window (used vs limit). limit 0 = unlimited.
// resetAt: ISO time when used will drop to/below limit as oldest hours age out
// (null when not over the limit).
export interface TokenWindowUsage {
  used: number
  limit: number
  windowHours: number
  resetAt: string | null
}

// Both rolling windows aibot enforces per-workspace.
export interface WorkspaceTokenWindows {
  workspace: WorkspaceUuid
  window5h: TokenWindowUsage
  week: TokenWindowUsage
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

// Admin-set fields when configuring a purchased pool (used left to recompute).
export interface ProviderPoolConfig {
  providerId: string
  kind: ProviderPoolKind
  purchasedTokens: number
  period: ProviderPoolPeriod
  periodStart?: string
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
  providerId?: string
  model?: string
  level?: string
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
  // Admin-wide token breakdown across all workspaces, grouped by a dimension.
  getAiTokensBreakdown: (
    ctx: MeasureContext,
    groupBy: AiTokensGroupBy,
    providerId?: string,
    start?: Date,
    end?: Date
  ) => Promise<AiTokensBreakdown[]>
  // Per-workspace token totals across all workspaces (for the admin workspaces list).
  getAiTokensByWorkspace: (ctx: MeasureContext, start?: Date, end?: Date) => Promise<AiTokensBreakdown[]>
  // Tokens used by a workspace within the last `windowHours` (rolling, from the hourly bucket).
  getWorkspaceTokensInWindow: (ctx: MeasureContext, workspace: WorkspaceUuid, windowHours: number) => Promise<number>
  // Per-hour token totals within the rolling window (ascending), for reset-ETA computation.
  getWindowHourlyBuckets: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    windowHours: number
  ) => Promise<Array<{ hour: string, tokens: number }>>
  // Total tokens spent per provider in a period (for provider-pool used).
  getProviderTokenTotals: (ctx: MeasureContext, start?: Date, end?: Date) => Promise<ProviderTokenTotal[]>

  // Provider token pools (purchased upstream, shared across all workspaces).
  listProviderPools: (ctx: MeasureContext) => Promise<ProviderPool[]>
  getProviderPool: (ctx: MeasureContext, providerId: string) => Promise<ProviderPool | undefined>
  // Admin upsert of pool config; resets notify flags + used when period restarts.
  upsertProviderPool: (ctx: MeasureContext, config: ProviderPoolConfig) => Promise<void>
  // Top-up: add `delta` purchased tokens to a pool and reopen it (clear exhausted/notify).
  addPurchasedTokens: (ctx: MeasureContext, providerId: string, delta: number) => Promise<void>
  // Recompute used/exhausted/notify-flags from getProviderTokenTotals; returns the
  // updated pool plus whether a threshold (80/100) was newly crossed this pass.
  updateProviderPoolState: (
    ctx: MeasureContext,
    providerId: string,
    usedTokens: number
  ) => Promise<{ pool: ProviderPool, crossed80: boolean, crossed100: boolean }>
}
