//
// Copyright © 2026 Intabia Fusion.
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
  type AccountUuid,
  type Branding,
  type MeasureContext,
  type StorageCleanupCommand,
  type StorageCleanupJob,
  type StorageCleanupRequest,
  type StorageCleanupResult,
  type WorkspaceUuid
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { isHumanAdmin, generateToken } from '@hcengineering/server-token'
import { type PlatformQueueProducer } from '@hcengineering/server-core'
import { requireAdminOp, requireAdminSession } from './adminOp'
import { type AccountDB } from './types'
import { logAdminAction } from './utils'

let producer: PlatformQueueProducer<StorageCleanupCommand> | undefined

export function setStorageCleanupProducer (value: PlatformQueueProducer<StorageCleanupCommand>): void {
  producer = value
}

export async function adminGetStorageCleanup (
  ctx: MeasureContext,
  db: AccountDB,
  _branding: Branding | null,
  token: string,
  params: { jobId?: string } = {}
): Promise<StorageCleanupJob | undefined> {
  requireAdminSession(ctx, token)
  if (params.jobId !== undefined) {
    if (typeof params.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(params.jobId)) {
      throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {}))
    }
    return (await db.storageCleanup.findOne({ id: params.jobId })) ?? undefined
  }
  return (await db.storageCleanup.find({}, { createdOn: 'descending' }, 1))[0]
}

export async function publishStorageCleanupJob (
  ctx: MeasureContext,
  db: AccountDB,
  job: StorageCleanupJob
): Promise<void> {
  if (producer === undefined) throw new Error('Storage cleanup queue is unavailable')
  await producer.send(ctx, '00000000-0000-0000-0000-000000000000' as WorkspaceUuid, [
    {
      jobId: job.id,
      action: job.action,
      scanId: job.scanId,
      requestedAt: job.createdOn
    }
  ])
  // The queued row is an outbox: a failed publish or a process restart leaves it available for retry.
  await db.storageCleanup.update({ id: job.id, status: 'queued' }, { status: 'running', updatedOn: Date.now() })
}

export async function adminRequestStorageCleanup (
  ctx: MeasureContext,
  db: AccountDB,
  _branding: Branding | null,
  token: string,
  params: StorageCleanupRequest
): Promise<StorageCleanupJob> {
  const decoded = requireAdminSession(ctx, token)
  const { action, scanId, requestId, otpCode } = params
  if (
    (action !== 'scan' && action !== 'delete') ||
    typeof requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId) ||
    (action === 'scan' && scanId !== undefined) ||
    (action === 'delete' && (typeof scanId !== 'string' || scanId === ''))
  ) {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {}))
  }
  if (action === 'delete' && !isHumanAdmin(decoded)) {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
  }
  const existing = await db.storageCleanup.findOne({ id: requestId })
  if (existing !== null) {
    if (existing.actor !== decoded.account || existing.action !== action || existing.scanId !== scanId) {
      throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {}))
    }
    return existing
  }
  if (action === 'delete') {
    const scan = await db.storageCleanup.findOne({ id: scanId, action: 'scan', status: 'ready' })
    if (scan === null || (await db.storageCleanup.findOne({ action: 'delete', scanId })) !== null) {
      throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {}))
    }
    await requireAdminOp(ctx, db, token, 'storage_cleanup_delete', otpCode ?? '', scanId)
  }
  const now = Date.now()
  const job: StorageCleanupJob = {
    id: requestId,
    action,
    ...(action === 'delete' ? { scanId } : {}),
    status: 'queued',
    createdOn: now,
    updatedOn: now,
    actor: decoded.account
  }
  try {
    await db.storageCleanup.insertOne(job)
  } catch (error) {
    const duplicate = await db.storageCleanup.findOne({ id: requestId })
    if (duplicate?.actor === job.actor && duplicate.action === job.action && duplicate.scanId === job.scanId) {
      return duplicate
    }
    throw error
  }
  await logAdminAction(ctx, db, token, 'storage_cleanup_requested', job.id, undefined, { action, scanId })
  try {
    await publishStorageCleanupJob(ctx, db, job)
  } catch (error) {
    ctx.warn('Storage cleanup publish deferred to outbox retry', { jobId: job.id, error })
  }
  return (await db.storageCleanup.findOne({ id: job.id })) ?? job
}

export async function persistStorageCleanupResult (
  ctx: MeasureContext,
  db: AccountDB,
  result: StorageCleanupResult
): Promise<void> {
  if (typeof result.jobId !== 'string' || !['ready', 'completed', 'failed'].includes(result.status)) {
    throw new Error('Invalid storage cleanup result')
  }
  const job = await db.storageCleanup.findOne({ id: result.jobId })
  if (job === null || ['ready', 'completed', 'failed'].includes(job.status)) return
  if (
    (result.status === 'ready' && job.action !== 'scan') ||
    (result.status === 'completed' && job.action !== 'delete')
  ) {
    throw new Error('Storage cleanup result does not match job action')
  }
  await logAdminAction(
    ctx,
    db,
    generateToken(job.actor as AccountUuid),
    result.status === 'failed' ? 'storage_cleanup_failed' : 'storage_cleanup_completed',
    job.id,
    undefined,
    { action: job.action, status: result.status }
  )
  await db.storageCleanup.update({ id: job.id }, { status: result.status, result, updatedOn: Date.now() })
}

export async function retryStorageCleanupOutbox (ctx: MeasureContext, db: AccountDB): Promise<void> {
  for (const job of await db.storageCleanup.find({ status: 'queued' }, { createdOn: 'ascending' }, 100)) {
    await publishStorageCleanupJob(ctx, db, job)
  }
}
