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

import {
  AiTokensData,
  AiTokensUsage,
  AiTokensGroupBy,
  AiTokensBreakdown,
  ProviderTokenTotal,
  ProviderPool,
  ProviderPoolConfig,
  AiTranscriptData,
  AiTranscriptDailyUsage,
  AiTranscriptUsage,
  BillingDB,
  LiveKitEgressData,
  LiveKitEgressUsageData,
  LiveKitParticipantSessionData,
  LiveKitSessionData,
  LiveKitSessionsUsageData,
  LiveKitUsageData,
  ParticipantDailyUsage,
  ParticipantMinutesUsage
} from '../types'
import postgres, { type Row, Sql } from 'postgres'
import { MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import { LoggedDB } from './logged'
import { RetryDB } from './retry'
import { DBFlavor, getMigrations } from './migrations'
import { computePoolTransition } from '../pool'

const BATCH_SIZE = 100

export async function getDbFlavor (sql: Sql<any>): Promise<DBFlavor> {
  const [{ version }] = await sql`SELECT version()`

  if (/cockroach/i.test(version)) {
    return 'cockroach'
  }

  if (/postgresql/i.test(version)) {
    return 'postgres'
  }

  return 'unknown'
}

export async function createDb (ctx: MeasureContext, connectionString: string): Promise<BillingDB> {
  const sql = postgres(connectionString, {
    max: 5,
    connection: {
      application_name: 'billing'
    },
    fetch_types: false,
    prepare: false,
    types: {
      // https://jdbc.postgresql.org/documentation/publicapi/constant-values.html
      int8: {
        to: 0,
        from: [20],
        serialize: (value: string) => value.toString(),
        parse: (value: number) => Number(value)
      }
    }
  })

  const db = await PostgresDB.create(ctx, sql)
  return new LoggedDB(ctx, new RetryDB(db, { retries: 5 }))
}

class PostgresDB implements BillingDB {
  private constructor (
    private readonly sql: Sql,
    private readonly flavor: DBFlavor
  ) {}

  static async create (ctx: MeasureContext, sql: Sql): Promise<PostgresDB> {
    const flavor = await getDbFlavor(sql)
    ctx.info('detected database flavor', { flavor })

    if (flavor === 'unknown') {
      throw new Error('Unknown database flavor. Only PostgreSQL and CockroachDB are supported.')
    }

    const db = new PostgresDB(sql, flavor)
    await db.initSchema(ctx)
    return db
  }

  async execute<T extends any[] = (Row & Iterable<Row>)[]>(query: string, params?: any[]): Promise<T> {
    query = params !== undefined && params.length > 0 ? injectVars(query, params) : query
    return await this.sql.unsafe<T>(query)
  }

  async initSchema (ctx: MeasureContext): Promise<void> {
    await this.execute('CREATE SCHEMA IF NOT EXISTS billing')
    await this.execute(`
        CREATE TABLE IF NOT EXISTS billing.migrations (
          name       VARCHAR(255) NOT NULL,
          created_on TIMESTAMP    NOT NULL DEFAULT now()
        )
    `)

    const appliedMigrations = (await this.execute<Row[]>('SELECT name FROM billing.migrations')).map((row) => row.name)
    ctx.info('applied migrations', { migrations: appliedMigrations })

    for (const [name, sql] of getMigrations(this.flavor)) {
      if (appliedMigrations.includes(name)) {
        continue
      }

      try {
        ctx.warn('applying migration', { migration: name })
        await this.execute(sql)
        await this.execute('INSERT INTO billing.migrations (name) VALUES ($1)', [name])
      } catch (err: any) {
        ctx.error('failed to apply migration', { migration: name, error: err })
        throw err
      }
    }
  }

  async getLiveKitStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<LiveKitUsageData> {
    return {
      sessions: await this.getDailySessionTotals(ctx, workspace, start, end),
      egress: await this.getDailyEgressTotals(ctx, workspace, start, end)
    }
  }

  async getDailySessionTotals (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<LiveKitSessionsUsageData[]> {
    const query = `
      SELECT
          DATE_TRUNC('day', session_start) AS day,
          COALESCE(SUM(bandwidth), 0) AS bandwidth,
          COALESCE(SUM(minutes), 0) AS minutes
      FROM billing.livekit_session
      WHERE
          workspace = $1
          AND session_start >= $2
          AND session_start <= $3
      GROUP BY DATE_TRUNC('day', session_start)
      ORDER BY day;
    `

    const params = [workspace, start, end]

    const sessionTotals = await this.execute<{ day: string, bandwidth: string, minutes: string }[]>(query, params)
    return sessionTotals.map((s) => {
      return { day: s.day, bandwidth: parseInt(s.bandwidth), minutes: parseInt(s.minutes) }
    })
  }

  async getDailyEgressTotals (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<LiveKitEgressUsageData[]> {
    const query = `
      SELECT
          DATE_TRUNC('day', egress_start) AS day,
          COALESCE(SUM(duration) / 60.0, 0) AS minutes
      FROM billing.livekit_egress
      WHERE
          workspace = $1
          AND egress_start >= $2
          AND egress_start <= $3
      GROUP BY DATE_TRUNC('day', egress_start)
      ORDER BY day;
    `

    const params = [workspace, start, end]

    const egressTotals = await this.execute<{ day: string, minutes: string }[]>(query, params)

    return egressTotals.map((e) => {
      return { day: e.day, minutes: parseInt(e.minutes) }
    })
  }

  async listLiveKitSessions (ctx: MeasureContext, workspace: WorkspaceUuid): Promise<LiveKitSessionData[] | null> {
    const query = `
        SELECT workspace, session_id, session_start, session_end, room, bandwidth, minutes
        FROM billing.livekit_session
        WHERE workspace = $1
      `
    const rows = await this.execute<any[]>(query, [workspace])

    return rows.map((row) => ({
      workspace: row.workspace,
      room: row.room,
      sessionId: row.session_id,
      sessionStart: row.session_start,
      sessionEnd: row.session_end,
      bandwidth: Number(row.bandwidth),
      minutes: Number(row.minutes)
    }))
  }

  async listLiveKitEgress (ctx: MeasureContext, workspace: WorkspaceUuid): Promise<LiveKitEgressData[] | null> {
    const query = `
        SELECT workspace, egress_id, egress_start, egress_end, room, duration
        FROM billing.livekit_egress
        WHERE workspace = $1
      `
    const rows = await this.execute<any[]>(query, [workspace])
    return rows.map((row) => ({
      workspace: row.workspace,
      room: row.room,
      egressId: row.egress_id,
      egressStart: row.egress_start,
      egressEnd: row.egress_end,
      duration: Number(row.duration)
    }))
  }

  async setLiveKitSessions (ctx: MeasureContext, data: LiveKitSessionData[]): Promise<void> {
    const uniqueSessions = new Map<string, LiveKitSessionData>()
    for (const item of data) {
      uniqueSessions.set(`${item.workspace}::${item.sessionId}`, item)
    }
    const uniqueSessionsValues = uniqueSessions.values()
    for (let i = 0; i < uniqueSessions.size; i += BATCH_SIZE) {
      const batch = uniqueSessionsValues.take(BATCH_SIZE)
      const values = []
      const params = []
      let paramIndex = 1

      for (const item of batch) {
        const { workspace, sessionId, sessionStart, sessionEnd, room, bandwidth, minutes } = item
        values.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        )
        params.push(workspace, sessionId, sessionStart, sessionEnd, room, bandwidth ?? 0, minutes)
      }

      if (values.length === 0) continue

      const query =
        this.flavor === 'cockroach'
          ? `
          UPSERT INTO billing.livekit_session (workspace, session_id, session_start, session_end, room, bandwidth, minutes)
          VALUES ${values.join(',')}
        `
          : `
          INSERT INTO billing.livekit_session (workspace, session_id, session_start, session_end, room, bandwidth, minutes)
          VALUES ${values.join(',')}
          ON CONFLICT (workspace, session_id)
          DO UPDATE SET
            session_start = EXCLUDED.session_start,
            session_end = EXCLUDED.session_end,
            room = EXCLUDED.room,
            bandwidth = EXCLUDED.bandwidth,
            minutes = EXCLUDED.minutes
        `
      await this.execute(query, params)
    }
  }

  async setLiveKitEgress (ctx: MeasureContext, data: LiveKitEgressData[]): Promise<void> {
    const uniqueSessions = new Map<string, LiveKitEgressData>()
    for (const item of data) {
      uniqueSessions.set(`${item.workspace}::${item.egressId}`, item)
    }
    const uniqueSessionsValues = uniqueSessions.values()
    for (let i = 0; i < uniqueSessions.size; i += BATCH_SIZE) {
      const batch = uniqueSessionsValues.take(BATCH_SIZE)
      const values = []
      const params = []
      let paramIndex = 1

      for (const item of batch) {
        const { workspace, egressId, egressStart, egressEnd, room, duration } = item
        values.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        )
        params.push(workspace, egressId, egressStart, egressEnd, room, duration)
      }

      if (values.length === 0) continue

      const query =
        this.flavor === 'cockroach'
          ? `
          UPSERT INTO billing.livekit_egress (workspace, egress_id, egress_start, egress_end, room, duration)
          VALUES ${values.join(',')}
        `
          : `
          INSERT INTO billing.livekit_egress (workspace, egress_id, egress_start, egress_end, room, duration)
          VALUES ${values.join(',')}
          ON CONFLICT (workspace, egress_id)
          DO UPDATE SET
            egress_start = EXCLUDED.egress_start,
            egress_end = EXCLUDED.egress_end,
            room = EXCLUDED.room,
            duration = EXCLUDED.duration
        `
      await this.execute(query, params)
    }
  }

  async pushParticipantSessions (ctx: MeasureContext, data: LiveKitParticipantSessionData[]): Promise<void> {
    const uniqueSessions = new Map<string, LiveKitParticipantSessionData>()
    for (const item of data) {
      uniqueSessions.set(`${item.workspace}::${item.participantId}::${item.sessionId}`, item)
    }
    const uniqueValues = uniqueSessions.values()
    for (let i = 0; i < uniqueSessions.size; i += BATCH_SIZE) {
      const batch = uniqueValues.take(BATCH_SIZE)
      const values = []
      const params = []
      let paramIndex = 1

      for (const item of batch) {
        values.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        )
        params.push(
          item.workspace,
          item.participantId,
          item.sessionId,
          item.room,
          item.joinedAt,
          item.leftAt,
          item.durationSeconds
        )
      }

      if (values.length === 0) continue

      const query =
        this.flavor === 'cockroach'
          ? `
          UPSERT INTO billing.livekit_participant_session (workspace, participant_id, session_id, room, joined_at, left_at, duration_seconds)
          VALUES ${values.join(',')}
        `
          : `
          INSERT INTO billing.livekit_participant_session (workspace, participant_id, session_id, room, joined_at, left_at, duration_seconds)
          VALUES ${values.join(',')}
          ON CONFLICT (workspace, participant_id, session_id)
          DO UPDATE SET
            left_at = EXCLUDED.left_at,
            duration_seconds = EXCLUDED.duration_seconds
        `
      await this.execute(query, params)
    }
  }

  async getParticipantMinutes (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<ParticipantMinutesUsage> {
    const query = `
      SELECT
        COALESCE(SUM(duration_seconds), 0) / 60.0 AS total_minutes
      FROM billing.livekit_participant_session
      WHERE
        workspace = $1
        AND joined_at >= $2
        AND joined_at <= $3
        AND duration_seconds > 0
    `
    const params = [workspace, start, end]
    const result = await this.execute<{ total_minutes: string }[]>(query, params)
    return {
      totalMinutes: Math.round(Number(result[0]?.total_minutes ?? 0))
    }
  }

  async getParticipantDailyStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<ParticipantDailyUsage[]> {
    const query = `
      WITH room_stats AS (
        SELECT 
          workspace,
          room,
          COUNT(*) AS participant_count,
          EXTRACT(EPOCH FROM (MAX(left_at) - MIN(joined_at))) / 60.0 AS meeting_duration_minutes
        FROM billing.livekit_participant_session
        WHERE workspace = $1 AND joined_at >= $2 AND joined_at <= $3 AND duration_seconds > 0
        GROUP BY workspace, room
      )
      SELECT
        DATE_TRUNC('day', ps.joined_at) AS day,
        COALESCE(SUM(ps.duration_seconds), 0) / 60.0 AS total_minutes,
        MAX(rs.participant_count) AS max_participants,
        COALESCE(AVG(rs.meeting_duration_minutes), 0) AS avg_meeting_duration_minutes,
        COALESCE(MAX(rs.meeting_duration_minutes), 0) AS max_meeting_duration_minutes
      FROM billing.livekit_participant_session ps
      JOIN room_stats rs ON ps.workspace = rs.workspace AND ps.room = rs.room
      WHERE
        ps.workspace = $1
        AND ps.joined_at >= $2
        AND ps.joined_at <= $3
        AND ps.duration_seconds > 0
      GROUP BY DATE_TRUNC('day', ps.joined_at)
      ORDER BY day;
    `
    const result = await this.execute<
    {
      day: string
      total_minutes: string
      max_participants: string
      avg_meeting_duration_minutes: string
      max_meeting_duration_minutes: string
    }[]
    >(query, [workspace, start, end])

    return result.map((row) => ({
      day: row.day,
      totalMinutes: Math.round(Number(row.total_minutes ?? 0)),
      maxParticipants: Number(row.max_participants ?? 0),
      avgMeetingDurationMinutes: Math.round(Number(row.avg_meeting_duration_minutes ?? 0)),
      maxMeetingDurationMinutes: Math.round(Number(row.max_meeting_duration_minutes ?? 0))
    }))
  }

  async pushAiTranscriptData (ctx: MeasureContext, data: AiTranscriptData[]): Promise<void> {
    const aggregated = new Map<string, AiTranscriptData>()
    for (const item of data) {
      const key = `${item.workspace}::${item.day}`
      const existing = aggregated.get(key)
      if (existing !== undefined) {
        existing.durationSeconds += item.durationSeconds
        existing.usd += item.usd
      } else {
        aggregated.set(key, { ...item })
      }
    }
    const deduped = Array.from(aggregated.values())
    const stringType = this.flavor === 'cockroach' ? 'string' : 'text'

    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
      const batch = deduped.slice(i, i + BATCH_SIZE)
      if (batch.length === 0) continue

      const values: string[] = []
      const params: any[] = []
      let paramIndex = 1

      for (const item of batch) {
        const { workspace, lastRequestId, lastStartTime, durationSeconds, usd, day } = item
        values.push(
          `($${paramIndex++}::uuid, DATE($${paramIndex++}::timestamp), $${paramIndex++}::${stringType}, $${paramIndex++}::timestamp, $${paramIndex++}::float, $${paramIndex++}::decimal)`
        )
        params.push(workspace, day, lastRequestId, lastStartTime, durationSeconds, usd)
      }

      const query = `
      INSERT INTO billing.ai_transcript_usage
        (workspace, day, last_request_id, last_start_time, total_duration_seconds, total_usd)
      VALUES ${values.join(',')}
      ON CONFLICT (workspace, day)
      DO UPDATE SET
        total_duration_seconds = billing.ai_transcript_usage.total_duration_seconds + EXCLUDED.total_duration_seconds,
        total_usd = billing.ai_transcript_usage.total_usd + EXCLUDED.total_usd,
        last_request_id = CASE
          WHEN EXCLUDED.last_start_time > billing.ai_transcript_usage.last_start_time
          THEN EXCLUDED.last_request_id
          ELSE billing.ai_transcript_usage.last_request_id
        END,
        last_start_time = GREATEST(billing.ai_transcript_usage.last_start_time, EXCLUDED.last_start_time);
    `

      await this.execute(query, params)
    }
  }

  async getAiTranscriptStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start?: Date,
    end?: Date
  ): Promise<AiTranscriptUsage> {
    const baseSql = `
    SELECT
      SUM(total_duration_seconds) AS total_duration_seconds
    FROM billing.ai_transcript_usage
  `

    let where = 'WHERE workspace = $1::uuid'
    const params: any[] = [workspace]
    let paramIndex = params.length + 1

    if (start != null) {
      const s = new Date(start)
      s.setHours(0, 0, 0, 0)

      where += ` AND day >= $${paramIndex++}::date`
      params.push(s)
    }

    if (end != null) {
      const e = new Date(end)
      e.setHours(23, 59, 59, 999)

      where += ` AND day <= $${paramIndex++}::date`
      params.push(e)
    }

    const sql = [baseSql, where].join(' ')
    const result = await this.execute(sql, params)

    return {
      totalDurationSeconds: Number(result[0]?.total_duration_seconds ?? 0)
    }
  }

  async getAiTranscriptDailyStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start: Date,
    end: Date
  ): Promise<AiTranscriptDailyUsage[]> {
    const query = `
      SELECT
        day,
        total_duration_seconds
      FROM billing.ai_transcript_usage
      WHERE
        workspace = $1::uuid
        AND day >= $2::date
        AND day <= $3::date
      ORDER BY day;
    `
    const params = [workspace, start, end]
    const result = await this.execute<{ day: string, total_duration_seconds: string }[]>(query, params)
    return result.map((row) => ({
      day: row.day,
      totalDurationSeconds: Number(row.total_duration_seconds ?? 0)
    }))
  }

  async getAiTranscriptLastData (ctx: MeasureContext): Promise<AiTranscriptData | undefined> {
    const sql = `
    SELECT *
    FROM billing.ai_transcript_usage
    ORDER BY day DESC
    LIMIT 1`

    const result = await this.execute(sql)
    const last = result[0]

    if (last == null) return undefined

    return {
      workspace: last.workspace,
      day: last.day,
      lastRequestId: last.last_request_id,
      lastStartTime: last.last_start_time,
      durationSeconds: Number(last?.total_duration_seconds ?? 0),
      usd: Number(last.usd)
    }
  }

  async pushAiTokensData (ctx: MeasureContext, data: AiTokensData[]): Promise<void> {
    // Bucket by the hour the usage happened in, so rolling windows (5h / week) are exact.
    const aggregated = new Map<string, AiTokensData & { hour: string }>()
    for (const item of data) {
      const providerId = item.providerId ?? ''
      const model = item.model ?? ''
      const level = item.level ?? ''
      const hour = truncToHour(item.date)
      const key = `${item.workspace}::${hour}::${item.reason}::${providerId}::${model}::${level}`
      const existing = aggregated.get(key)
      if (existing !== undefined) {
        existing.tokens += item.tokens
      } else {
        aggregated.set(key, { ...item, providerId, model, level, hour })
      }
    }
    const deduped = Array.from(aggregated.values())
    const stringType = this.flavor === 'cockroach' ? 'string' : 'text'
    const int8Type = this.flavor === 'cockroach' ? 'int8' : 'bigint'

    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
      const batch = deduped.slice(i, i + BATCH_SIZE)
      if (batch.length === 0) continue

      const values: string[] = []
      const params: any[] = []
      let paramIndex = 1

      for (const item of batch) {
        const { workspace, reason, tokens, hour } = item

        values.push(
          `($${paramIndex++}::uuid, $${paramIndex++}::timestamp, $${paramIndex++}::${stringType}, $${paramIndex++}::${int8Type}, $${paramIndex++}::${stringType}, $${paramIndex++}::${stringType}, $${paramIndex++}::${stringType})`
        )

        params.push(workspace, hour, reason, tokens, item.providerId ?? '', item.model ?? '', item.level ?? '')
      }

      const sql = `
      INSERT INTO billing.ai_tokens_usage (workspace, hour, reason, total_tokens, provider_id, model, level)
      VALUES ${values.join(',')}
      ON CONFLICT (workspace, hour, reason, provider_id, model, level)
      DO UPDATE SET
        total_tokens = billing.ai_tokens_usage.total_tokens + EXCLUDED.total_tokens;
    `

      await this.execute(sql, params)
    }
  }

  // Build a "AND hour >= / <= " clause from optional start/end, appending to params.
  private hourRange (params: any[], startIndex: number, start?: Date, end?: Date): string {
    let where = ''
    let paramIndex = startIndex
    if (start != null) {
      where += ` AND hour >= $${paramIndex++}::timestamp`
      params.push(new Date(start))
    }
    if (end != null) {
      where += ` AND hour <= $${paramIndex++}::timestamp`
      params.push(new Date(end))
    }
    return where
  }

  async getAiTokensStats (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    start?: Date,
    end?: Date
  ): Promise<AiTokensUsage[]> {
    const params: any[] = [workspace]
    const where = 'WHERE workspace = $1::uuid' + this.hourRange(params, 2, start, end)

    const sql = `
    SELECT reason, SUM(total_tokens) AS total_tokens
    FROM billing.ai_tokens_usage
    ${where}
    GROUP BY reason
    ORDER BY reason ASC`
    const result = await this.execute(sql, params)

    return result.map((row: any) => ({
      reason: row.reason,
      totalTokens: Number(row.total_tokens ?? 0)
    }))
  }

  async getAiTokensBreakdown (
    ctx: MeasureContext,
    groupBy: AiTokensGroupBy,
    providerId?: string,
    start?: Date,
    end?: Date
  ): Promise<AiTokensBreakdown[]> {
    const column = { model: 'model', level: 'level', provider: 'provider_id', workspace: 'workspace' }[groupBy]
    const params: any[] = []
    let where = ''
    let paramIndex = 1
    if (providerId != null && providerId !== '') {
      where = `WHERE provider_id = $${paramIndex++}::${this.flavor === 'cockroach' ? 'string' : 'text'}`
      params.push(providerId)
    } else {
      where = 'WHERE 1 = 1'
    }
    where += this.hourRange(params, paramIndex, start, end)

    const sql = `
    SELECT ${column} AS grp, SUM(total_tokens) AS total_tokens
    FROM billing.ai_tokens_usage
    ${where}
    GROUP BY ${column}
    ORDER BY total_tokens DESC`
    const result = await this.execute(sql, params)

    return result.map((row: any) => {
      const total = Number(row.total_tokens ?? 0)
      const grp = row.grp
      switch (groupBy) {
        case 'model':
          return { model: grp, totalTokens: total }
        case 'level':
          return { level: grp, totalTokens: total }
        case 'provider':
          return { providerId: grp, totalTokens: total }
        default:
          return { workspace: grp, totalTokens: total }
      }
    })
  }

  async getAiTokensByWorkspace (ctx: MeasureContext, start?: Date, end?: Date): Promise<AiTokensBreakdown[]> {
    return await this.getAiTokensBreakdown(ctx, 'workspace', undefined, start, end)
  }

  async getWorkspaceTokensInWindow (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    windowHours: number
  ): Promise<number> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)
    const sql = `
    SELECT COALESCE(SUM(total_tokens), 0) AS total_tokens
    FROM billing.ai_tokens_usage
    WHERE workspace = $1::uuid AND hour >= $2::timestamp`
    const result = await this.execute(sql, [workspace, since])
    return Number(result[0]?.total_tokens ?? 0)
  }

  // Per-hour token totals within the rolling window (ascending hour), used to compute
  // when usage will drop below the limit as the oldest hours age out (reset ETA).
  async getWindowHourlyBuckets (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    windowHours: number
  ): Promise<Array<{ hour: string, tokens: number }>> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)
    const sql = `
    SELECT hour, SUM(total_tokens) AS tokens
    FROM billing.ai_tokens_usage
    WHERE workspace = $1::uuid AND hour >= $2::timestamp
    GROUP BY hour
    ORDER BY hour ASC`
    const result = await this.execute(sql, [workspace, since])
    return result.map((row: any) => ({ hour: new Date(row.hour).toISOString(), tokens: Number(row.tokens ?? 0) }))
  }

  async getProviderTokenTotals (ctx: MeasureContext, start?: Date, end?: Date): Promise<ProviderTokenTotal[]> {
    const params: any[] = []
    const where = "WHERE provider_id <> ''" + this.hourRange(params, 1, start, end)

    const sql = `
    SELECT provider_id, SUM(total_tokens) AS total_tokens
    FROM billing.ai_tokens_usage
    ${where}
    GROUP BY provider_id`
    const result = await this.execute(sql, params)

    return result.map((row: any) => ({
      providerId: row.provider_id,
      totalTokens: Number(row.total_tokens ?? 0)
    }))
  }

  private mapPool (row: any): ProviderPool {
    return {
      providerId: row.provider_id,
      kind: row.kind,
      purchasedTokens: Number(row.purchased_tokens ?? 0),
      period: row.period,
      periodStart: new Date(row.period_start).toISOString(),
      usedTokens: Number(row.used_tokens ?? 0),
      exhausted: row.exhausted === true,
      notified80: row.notified80 === true,
      notified100: row.notified100 === true
    }
  }

  async listProviderPools (ctx: MeasureContext): Promise<ProviderPool[]> {
    const result = await this.execute('SELECT * FROM billing.provider_pool ORDER BY provider_id ASC', [])
    return result.map((row: any) => this.mapPool(row))
  }

  async getProviderPool (ctx: MeasureContext, providerId: string): Promise<ProviderPool | undefined> {
    const stringType = this.flavor === 'cockroach' ? 'string' : 'text'
    const result = await this.execute(`SELECT * FROM billing.provider_pool WHERE provider_id = $1::${stringType}`, [
      providerId
    ])
    return result.length > 0 ? this.mapPool(result[0]) : undefined
  }

  async upsertProviderPool (ctx: MeasureContext, config: ProviderPoolConfig): Promise<void> {
    const stringType = this.flavor === 'cockroach' ? 'string' : 'text'
    const int8Type = this.flavor === 'cockroach' ? 'int8' : 'bigint'
    const periodStart = config.periodStart ?? new Date().toISOString()

    // A new config / new period resets used + notify flags (recompute repopulates used).
    const sql = `
    INSERT INTO billing.provider_pool
      (provider_id, kind, purchased_tokens, period, period_start, used_tokens, exhausted, notified80, notified100)
    VALUES ($1::${stringType}, $2::${stringType}, $3::${int8Type}, $4::${stringType}, $5::timestamp, 0, false, false, false)
    ON CONFLICT (provider_id) DO UPDATE SET
      kind = EXCLUDED.kind,
      purchased_tokens = EXCLUDED.purchased_tokens,
      period = EXCLUDED.period,
      period_start = EXCLUDED.period_start,
      used_tokens = 0,
      exhausted = false,
      notified80 = false,
      notified100 = false`
    await this.execute(sql, [config.providerId, config.kind, config.purchasedTokens, config.period, periodStart])
  }

  async addPurchasedTokens (ctx: MeasureContext, providerId: string, delta: number): Promise<void> {
    const stringType = this.flavor === 'cockroach' ? 'string' : 'text'
    const int8Type = this.flavor === 'cockroach' ? 'int8' : 'bigint'
    // Top-up: increment the purchased budget and clear exhausted/notify flags so the
    // pool reopens and 80%/100% can fire again against the new total.
    const sql = `
    UPDATE billing.provider_pool SET
      purchased_tokens = purchased_tokens + $2::${int8Type},
      exhausted = false,
      notified80 = false,
      notified100 = false
    WHERE provider_id = $1::${stringType}`
    await this.execute(sql, [providerId, delta])
  }

  async updateProviderPoolState (
    ctx: MeasureContext,
    providerId: string,
    usedTokens: number
  ): Promise<{ pool: ProviderPool, crossed80: boolean, crossed100: boolean }> {
    const existing = await this.getProviderPool(ctx, providerId)
    if (existing === undefined) {
      throw new Error(`provider pool not found: ${providerId}`)
    }

    const { exhausted, reach80, reach100, crossed80, crossed100 } = computePoolTransition(existing, usedTokens)

    const stringType = this.flavor === 'cockroach' ? 'string' : 'text'
    const int8Type = this.flavor === 'cockroach' ? 'int8' : 'bigint'
    const sql = `
    UPDATE billing.provider_pool SET
      used_tokens = $2::${int8Type},
      exhausted = $3,
      notified80 = notified80 OR $4,
      notified100 = notified100 OR $5
    WHERE provider_id = $1::${stringType}`
    await this.execute(sql, [providerId, usedTokens, exhausted, reach80, reach100])

    return {
      pool: {
        ...existing,
        usedTokens,
        exhausted,
        notified80: existing.notified80 || reach80,
        notified100: existing.notified100 || reach100
      },
      crossed80,
      crossed100
    }
  }
}

export default PostgresDB

// Truncate an ISO date string to the start of its hour (UTC), for hourly bucketing.
function truncToHour (date: string): string {
  const d = new Date(date)
  d.setUTCMinutes(0, 0, 0)
  return d.toISOString()
}

function injectVars (sql: string, values: any[]): string {
  return sql.replaceAll(/(\$\d+)/g, (_, idx) => {
    return escape(values[parseInt(idx.substring(1)) - 1])
  })
}

function escape (value: any): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (Array.isArray(value)) {
    return 'ARRAY[' + value.map(escape).join(',') + ']'
  }

  switch (typeof value) {
    case 'number':
      if (isNaN(value) || !isFinite(value)) {
        throw new Error('Invalid number value')
      }
      return value.toString()
    case 'boolean':
      return value ? 'TRUE' : 'FALSE'
    case 'string':
      return `'${value.replace(/'/g, "''")}'`
    case 'object':
      if (value instanceof Date) {
        return `'${value.toISOString()}'`
      } else {
        return `'${JSON.stringify(value)}'`
      }
    default:
      throw new Error(`Unsupported value type: ${typeof value}`)
  }
}
