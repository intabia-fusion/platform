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

import type { Request, Response } from 'express'
import { MeasureContext, Ref, Space, systemAccountUuid, WorkspaceUuid } from '@hcengineering/core'
import attachment from '@hcengineering/attachment'
import {
  LiveKitSessionData,
  BillingDB,
  LiveKitEgressData,
  LiveKitParticipantSessionData,
  AiUsageData,
  AiTranscriptData,
  AiTokensData
} from './types'
import { generateToken } from '@hcengineering/server-token'
import { StorageConfig } from '@hcengineering/server-core'
import { createDatalakeClient, DatalakeConfig, WorkspaceStats, WorkspaceStatsByType } from '@hcengineering/datalake'
import { validate as uuidValidate } from 'uuid'
import { getClient } from './client'

export async function handleListLiveKitSessions (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const workspace = getWorkspaceUuid(req)
  res.status(200).json(await db.listLiveKitSessions(ctx, workspace))
}

export async function handleListLiveKitEgress (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const workspace = getWorkspaceUuid(req)
  res.status(200).json(await db.listLiveKitEgress(ctx, workspace))
}

export async function handleSetLiveKitSessions (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const data = (await req.body) as LiveKitSessionData[]
  await db.setLiveKitSessions(ctx, data)
  res.status(204).send()
}

export async function handleSetLiveKitEgress (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const data = (await req.body) as LiveKitEgressData[]
  await db.setLiveKitEgress(ctx, data)
  res.status(204).send()
}

export async function handleGetStats (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const workspace = getWorkspaceUuid(req)
  const { fromDate, toDate } = parseDateParameters(req)
  const liveKitStats = await db.getLiveKitStats(ctx, workspace, fromDate, toDate)
  const datalakeStats = await collectDatalakeStats(ctx, workspace, storageConfigs)

  const aiStats: AiUsageData = {
    transcript: await db.getAiTranscriptStats(ctx, workspace, fromDate, toDate),
    tokens: await db.getAiTokensStats(ctx, workspace, fromDate, toDate)
  }
  const participantDailyStats = await db.getParticipantDailyStats(ctx, workspace, fromDate, toDate)
  const transcriptDailyStats = await db.getAiTranscriptDailyStats(ctx, workspace, fromDate, toDate)
  res.status(200).json({ liveKitStats, datalakeStats, aiStats, participantDailyStats, transcriptDailyStats })
}

export async function handleGetLiveKitStats (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const workspace = getWorkspaceUuid(req)
  const { fromDate, toDate } = parseDateParameters(req)
  res.status(200).json(await db.getLiveKitStats(ctx, workspace, fromDate, toDate))
}

export async function handleGetDatalakeStats (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const workspace = getWorkspaceUuid(req)
  res.status(200).json(await collectDatalakeStats(ctx, workspace, storageConfigs))
}

export async function handleGetAiStats (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const workspace = getWorkspaceUuid(req)
  const { fromDate, toDate } = parseDateParameters(req)

  const usage: AiUsageData = {
    transcript: await db.getAiTranscriptStats(ctx, workspace, fromDate, toDate),
    tokens: await db.getAiTokensStats(ctx, workspace, fromDate, toDate)
  }

  res.status(200).json(usage)
}

export async function handleGetAiTranscriptLastData (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const last = await db.getAiTranscriptLastData(ctx)
  if (last === undefined) {
    res.status(404).send()
    return
  }
  res.status(200).json(last)
}

export async function handlePushAiTranscriptData (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const data = (await req.body) as AiTranscriptData[]
  await db.pushAiTranscriptData(ctx, data)
  res.status(204).send()
}

export async function handlePushParticipantSessions (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const data = (await req.body) as LiveKitParticipantSessionData[]
  await db.pushParticipantSessions(ctx, data)
  res.status(204).send()
}

export async function handlePushAiTokensData (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const data = (await req.body) as AiTokensData[]
  await db.pushAiTokensData(ctx, data)
  res.status(204).send()
}

export interface LargestSpaceResult {
  spaceId: Ref<Space>
  size: number
}

export async function handleGetLargestSpaces (
  ctx: MeasureContext,
  db: BillingDB,
  storageConfigs: StorageConfig[],
  req: Request,
  res: Response
): Promise<void> {
  const workspace = getWorkspaceUuid(req)
  const token = generateToken(systemAccountUuid, workspace, { service: 'billing', admin: 'true' })

  const client = await getClient(token, workspace)

  const attachments = await client.findAll(attachment.class.Attachment, {}, { projection: { space: 1, size: 1 } })

  const spaceSizes = new Map<Ref<Space>, number>()

  for (const att of attachments) {
    if (att.space != null && att.size != null) {
      const currentSize = spaceSizes.get(att.space) ?? 0
      spaceSizes.set(att.space, currentSize + att.size)
    }
  }

  const limit = 10
  const sortedSpaces: LargestSpaceResult[] = Array.from(spaceSizes.entries())
    .map(([spaceId, size]) => ({ spaceId, size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, limit)

  res.status(200).json(sortedSpaces)
}

export async function collectDatalakeStats (
  ctx: MeasureContext,
  workspace: WorkspaceUuid,
  storageConfigs: StorageConfig[]
): Promise<WorkspaceStats & { byType: WorkspaceStatsByType[] }> {
  const result: WorkspaceStats & { byType: WorkspaceStatsByType[] } = {
    count: 0,
    size: 0,
    byType: []
  }

  const token = generateToken(systemAccountUuid, undefined, { service: 'billing' })

  const byTypeMap = new Map<string, { count: number, size: number }>()

  for (const storageConfig of storageConfigs) {
    if (storageConfig.kind !== 'datalake') {
      continue
    }
    const client = createDatalakeClient(storageConfig as DatalakeConfig, token)

    const [storageStats, statsByType] = await Promise.all([
      client.getWorkspaceStats(ctx, workspace),
      client.getWorkspaceStatsByType(ctx, workspace)
    ])

    result.count += storageStats.count
    result.size += storageStats.size

    for (const entry of statsByType) {
      const existing = byTypeMap.get(entry.type)
      if (existing !== undefined) {
        existing.count += entry.count
        existing.size += entry.size
      } else {
        byTypeMap.set(entry.type, { count: entry.count, size: entry.size })
      }
    }
  }

  result.byType = Array.from(byTypeMap.entries()).map(([type, stats]) => ({
    type,
    count: stats.count,
    size: stats.size
  }))

  return result
}

function getWorkspaceUuid (req: Request): WorkspaceUuid {
  const { workspace } = req.params
  if (uuidValidate(workspace)) {
    return workspace as WorkspaceUuid
  }
  throw new Error('Unknown workspace')
}

function parseDateParameters (req: Request): { fromDate: Date, toDate: Date } {
  let fromDate: Date
  if (typeof req.query.fromDate === 'string') {
    fromDate = new Date(Date.parse(req.query.fromDate))
  } else {
    fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  }

  let toDate: Date
  if (typeof req.query.toDate === 'string') {
    toDate = new Date(Date.parse(req.query.toDate))
  } else {
    toDate = new Date(Date.now())
  }

  return { fromDate, toDate }
}
