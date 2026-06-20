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
import {
  AiTokensBreakdown,
  AiTokensData,
  AiTokensGroupBy,
  AiTokensUsage,
  AiTranscriptData,
  AiTranscriptDailyUsage,
  AiTranscriptUsage,
  BillingDB,
  LiveKitEgressData,
  LiveKitParticipantSessionData,
  LiveKitSessionData,
  LiveKitUsageData,
  ParticipantDailyUsage,
  ParticipantMinutesUsage,
  ProviderPool,
  ProviderPoolConfig,
  ProviderTokenTotal
} from '../types'

export class LoggedDB implements BillingDB {
  constructor (
    private readonly ctx: MeasureContext,
    private readonly db: BillingDB
  ) {}

  async getLiveKitStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<LiveKitUsageData> {
    return await ctx.with('db.getLiveKitUsage', {}, () => this.db.getLiveKitStats(this.ctx, workspace, start, end))
  }

  async listLiveKitSessions (ctx: MeasureContext, workspace: WorkspaceUuid): Promise<LiveKitSessionData[] | null> {
    return await ctx.with('db.listLiveKitSessions', {}, () => this.db.listLiveKitSessions(this.ctx, workspace))
  }

  async listLiveKitEgress (ctx: MeasureContext, workspace: WorkspaceUuid): Promise<LiveKitEgressData[] | null> {
    return await ctx.with('db.listLiveKitEgress', {}, () => this.db.listLiveKitEgress(this.ctx, workspace))
  }

  async setLiveKitSessions (ctx: MeasureContext, data: LiveKitSessionData[]): Promise<void> {
    await ctx.with('db.setLiveKitSessions', {}, () => this.db.setLiveKitSessions(this.ctx, data))
  }

  async setLiveKitEgress (ctx: MeasureContext, data: LiveKitEgressData[]): Promise<void> {
    await ctx.with('db.setLiveKitEgress', {}, () => this.db.setLiveKitEgress(this.ctx, data))
  }

  async pushParticipantSessions (ctx: MeasureContext, data: LiveKitParticipantSessionData[]): Promise<void> {
    await ctx.with('db.pushParticipantSessions', {}, () => this.db.pushParticipantSessions(this.ctx, data))
  }

  async getParticipantMinutes (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<ParticipantMinutesUsage> {
    return await ctx.with('db.getParticipantMinutes', {}, () =>
      this.db.getParticipantMinutes(this.ctx, workspace, start, end)
    )
  }

  async getParticipantDailyStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<ParticipantDailyUsage[]> {
    return await ctx.with('db.getParticipantDailyStats', {}, () =>
      this.db.getParticipantDailyStats(this.ctx, workspace, start, end)
    )
  }

  async pushAiTranscriptData (ctx: MeasureContext, data: AiTranscriptData[]): Promise<void> {
    await ctx.with('db.pushAiTranscriptData', {}, () => this.db.pushAiTranscriptData(this.ctx, data))
  }

  async getAiTranscriptLastData (ctx: MeasureContext): Promise<AiTranscriptData | undefined> {
    return await ctx.with('db.getAiTranscriptLastData', {}, () => this.db.getAiTranscriptLastData(this.ctx))
  }

  async getAiTranscriptStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start?: Date,
    end?: Date
  ): Promise<AiTranscriptUsage> {
    return await ctx.with('db.getAiTranscriptStats', {}, () =>
      this.db.getAiTranscriptStats(this.ctx, workspace, start, end)
    )
  }

  async getAiTranscriptDailyStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<AiTranscriptDailyUsage[]> {
    return await ctx.with('db.getAiTranscriptDailyStats', {}, () =>
      this.db.getAiTranscriptDailyStats(this.ctx, workspace, start, end)
    )
  }

  async pushAiTokensData (ctx: MeasureContext, data: AiTokensData[]): Promise<void> {
    await ctx.with('db.pushAiTokensData', {}, () => this.db.pushAiTokensData(ctx, data))
  }

  async getAiTokensStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start?: Date,
    end?: Date
  ): Promise<AiTokensUsage[]> {
    return await ctx.with('db.getAiTokensStats', {}, () => this.db.getAiTokensStats(ctx, workspace, start, end))
  }

  async getAiTokensBreakdown (
    ctx: MeasureContext,
    groupBy: AiTokensGroupBy,
    providerId?: string,
    start?: Date,
    end?: Date
  ): Promise<AiTokensBreakdown[]> {
    return await ctx.with('db.getAiTokensBreakdown', {}, () =>
      this.db.getAiTokensBreakdown(ctx, groupBy, providerId, start, end)
    )
  }

  async getAiTokensByWorkspace (ctx: MeasureContext, start?: Date, end?: Date): Promise<AiTokensBreakdown[]> {
    return await ctx.with('db.getAiTokensByWorkspace', {}, () => this.db.getAiTokensByWorkspace(ctx, start, end))
  }

  async getWorkspaceTokensInWindow (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    windowHours: number
  ): Promise<number> {
    return await ctx.with('db.getWorkspaceTokensInWindow', {}, () =>
      this.db.getWorkspaceTokensInWindow(ctx, workspace, windowHours)
    )
  }

  async getProviderTokenTotals (ctx: MeasureContext, start?: Date, end?: Date): Promise<ProviderTokenTotal[]> {
    return await ctx.with('db.getProviderTokenTotals', {}, () => this.db.getProviderTokenTotals(ctx, start, end))
  }

  async listProviderPools (ctx: MeasureContext): Promise<ProviderPool[]> {
    return await ctx.with('db.listProviderPools', {}, () => this.db.listProviderPools(ctx))
  }

  async getProviderPool (ctx: MeasureContext, providerId: string): Promise<ProviderPool | undefined> {
    return await ctx.with('db.getProviderPool', {}, () => this.db.getProviderPool(ctx, providerId))
  }

  async upsertProviderPool (ctx: MeasureContext, config: ProviderPoolConfig): Promise<void> {
    await ctx.with('db.upsertProviderPool', {}, () => this.db.upsertProviderPool(ctx, config))
  }

  async updateProviderPoolState (
    ctx: MeasureContext,
    providerId: string,
    usedTokens: number
  ): Promise<{ pool: ProviderPool, crossed80: boolean, crossed100: boolean }> {
    return await ctx.with('db.updateProviderPoolState', {}, () =>
      this.db.updateProviderPoolState(ctx, providerId, usedTokens)
    )
  }
}
