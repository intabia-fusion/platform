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
  AccountRole,
  generateId,
  type MeasureContext,
  type PersonId,
  type Ref,
  type WorkspaceUuid
} from '@hcengineering/core'
import { getClient as getAccountClient, type AccountClient, type ApiKeyCheck } from '@hcengineering/account-client'
import { SlidingWindowRateLimitter, type RateLimitInfo } from '@hcengineering/rpc'
import type { PlatformQueueProducer } from '@hcengineering/server-core'
import { PlatformError } from '@hcengineering/platform'
import { decodeToken } from '@hcengineering/server-token'
import setting, {
  evaluateWebhookRule,
  WEBHOOK_RULE_MAX_JOBS,
  type WebhookEndpoint,
  type WebhookIncomingRule
} from '@hcengineering/setting'
import cors from 'cors'
import { createHash } from 'crypto'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'

import type { Config } from './config'
import { recordDeliveryOutcome } from './delivery'
import { sendError } from './errors'
import { isKnownOperation } from './operations'
import { loadRules, safeRegexTest } from './rules'
import { buildDeliveryHeaders } from './signature'
import { safeFetch } from './ssrf'
import { WebhookStore } from './store'
import { lookupTarget, targetField, type TargetLookup } from './targets'
import type { WebhookEvent, WebhookJobMessage } from './types'
import { getSystemTransactorTarget, type TransactorTarget } from './workspaceClient'

const BODY_LIMIT = '1mb'

export function createServer (
  ctx: MeasureContext,
  config: Config,
  accountClient: AccountClient,
  producer: PlatformQueueProducer<WebhookJobMessage>,
  store: WebhookStore = new WebhookStore()
): { app: Express, close: () => void } {
  const app = express()
  const perKeyHeaderLimiter = new SlidingWindowRateLimitter(config.RateLimitMax, config.RateLimitWindowMs)
  // A key in the path leaks whole into logs and is meant for narrow-scoped use - stricter than the header form.
  const perKeyPathLimiter = new SlidingWindowRateLimitter(config.RateLimitPathMax, config.RateLimitWindowMs)
  const perIpLimiter = new SlidingWindowRateLimitter(config.RateLimitMax, config.RateLimitWindowMs)

  app.set('trust proxy', 1) // client IP for the per-source rate limit comes from X-Forwarded-For
  app.use(cors())
  app.use(express.json({ limit: BODY_LIMIT }))

  const headerDeps: IngestDeps = {
    ctx,
    config,
    accountClient,
    producer,
    store,
    perKeyLimiter: perKeyHeaderLimiter,
    perIpLimiter,
    keySource: 'header'
  }
  const pathDeps: IngestDeps = {
    ctx,
    config,
    accountClient,
    producer,
    store,
    perKeyLimiter: perKeyPathLimiter,
    perIpLimiter,
    keySource: 'path'
  }

  app.post(
    '/api/v1/webhook/action',
    wrap(async (req, res) => {
      await handleIngest(headerDeps, req, res)
    })
  )

  app.post(
    '/api/v1/webhook/k/:key',
    wrap(async (req, res) => {
      await handleIngest(pathDeps, req, res)
    })
  )

  // Third-party systems (Alertmanager, GitLab...) POST their own body; WebhookIncomingRule maps it
  // to one or more of our operations. Registered before /k/:key so express doesn't need it to differ.
  app.post(
    '/api/v1/webhook/in',
    wrap(async (req, res) => {
      await handleRulesIngest(headerDeps, req, res)
    })
  )

  app.post(
    '/api/v1/webhook/k/:key/in',
    wrap(async (req, res) => {
      await handleRulesIngest(pathDeps, req, res)
    })
  )

  app.get(
    '/api/v1/webhook/job/:id',
    wrap(async (req, res) => {
      await handleJobStatus(ctx, accountClient, store, req, res)
    })
  )

  // Owner-only, session-token authenticated (unlike the two ingest routes above, which verify an API
  // key) - the settings page's "send test event" button. Same origin as Backup.svelte's BackupUrl:
  // the browser hits this pod directly with its own token, no transactor round trip needed.
  app.post(
    '/api/v1/webhook/:workspace/test/:endpointId',
    wrap(async (req, res) => {
      await handleTestSend(config, req, res)
    })
  )

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.use((_req, res) => {
    sendError(res, 404, 'not_found')
  })

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    // express.json({ limit }) rejects an oversized body with this error before any route handler runs.
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      sendError(res, 413, 'payload_too_large')
      return
    }
    ctx.error('webhook: unhandled request error', { err })
    sendError(res, 500, 'internal_error')
  })

  return { app, close: () => {} }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next)
  }

function bearerToken (req: Request): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(req.header('authorization') ?? '')
  return match?.[1]
}

type KeyVerification =
  | { status: 'ok', check: ApiKeyCheck }
  | { status: 'invalid' }
  | { status: 'unavailable' }
  | { status: 'error' }

// Distinguishes a genuine "unknown key" (account service answered null) from the account service
// itself being unreachable - the two must not both collapse into 401 (finding 12).
async function verifyKey (ctx: MeasureContext, accountClient: AccountClient, key: string): Promise<KeyVerification> {
  try {
    const check = await accountClient.verifyApiKey(key)
    return check === null ? { status: 'invalid' } : { status: 'ok', check }
  } catch (err) {
    ctx.error('webhook: verifyApiKey failed', { err })
    // PlatformError = account service answered (our own auth misconfig, not the caller's key) - not 503.
    if (err instanceof PlatformError) {
      return { status: 'error' }
    }
    return { status: 'unavailable' }
  }
}

function logCall (
  ctx: MeasureContext,
  keyId: string | undefined,
  action: unknown,
  via: 'header' | 'path',
  result: string
): void {
  // Never log the key itself, only the keyId it resolved to (undefined when the key didn't verify).
  ctx.info('webhook call', { keyId, action, via, result, time: Date.now() })
}

function applyRateLimitHeaders (res: Response, info: RateLimitInfo): void {
  const { remaining, limit, reset, retryAfter } = info
  res.setHeader('Retry-After', `${Math.max(Math.round((retryAfter ?? 0) / 1000), 1)}`)
  res.setHeader('Retry-After-ms', `${retryAfter ?? 1000}`)
  res.setHeader('X-RateLimit-Limit', `${limit}`)
  res.setHeader('X-RateLimit-Remaining', `${remaining}`)
  res.setHeader('X-RateLimit-Reset', `${reset}`)
}

// Shared by both ingest flows (raw action/k routes and the rule-driven /in routes) - grouped into one
// object because the two handlers now share it rather than each taking its own long parameter list.
interface IngestDeps {
  ctx: MeasureContext
  config: Config
  accountClient: AccountClient
  producer: PlatformQueueProducer<WebhookJobMessage>
  store: WebhookStore
  perKeyLimiter: SlidingWindowRateLimitter
  perIpLimiter: SlidingWindowRateLimitter
  keySource: 'header' | 'path'
}

type IngestAuth = { ok: true, check: ApiKeyCheck } | { ok: false }

// Shared by both ingest flows. On `{ ok: false }` a response was already sent to `res` - the caller
// must return without writing anything else.
async function authenticateIngest (deps: IngestDeps, req: Request, res: Response): Promise<IngestAuth> {
  const { ctx, accountClient, perKeyLimiter, perIpLimiter, keySource } = deps
  const key = keySource === 'path' ? req.params.key : bearerToken(req)

  if (key === undefined || key.length === 0) {
    logCall(ctx, undefined, undefined, keySource, 'unauthorized')
    sendError(res, 401, 'unauthorized')
    return { ok: false }
  }

  // Before verifyApiKey, so an unknown key cannot drive unbounded calls into the account service.
  // Keyed on the presented credential rather than on the keyId it resolves to, which is not known yet;
  // an over-limit key is stopped here and never touches the source-IP budget it shares with everyone
  // else behind that address.
  const keyLimit = perKeyLimiter.checkRateLimit(createHash('sha256').update(key).digest('hex'))
  if (keyLimit.remaining === 0) {
    logCall(ctx, undefined, undefined, keySource, 'rate_limited')
    applyRateLimitHeaders(res, keyLimit)
    sendError(res, 429, 'rate_limited')
    return { ok: false }
  }

  const verification = await verifyKey(ctx, accountClient, key)
  if (verification.status === 'unavailable') {
    logCall(ctx, undefined, undefined, keySource, 'service_unavailable')
    sendError(res, 503, 'service_unavailable')
    return { ok: false }
  }
  if (verification.status === 'error') {
    logCall(ctx, undefined, undefined, keySource, 'internal_error')
    sendError(res, 500, 'internal_error')
    return { ok: false }
  }
  if (verification.status === 'invalid') {
    // Only a credential that did not verify burns the shared per-IP budget - that is the guessing case.
    const ipLimit = perIpLimiter.checkRateLimit(req.ip ?? 'unknown')
    if (ipLimit.remaining === 0) {
      logCall(ctx, undefined, undefined, keySource, 'rate_limited')
      applyRateLimitHeaders(res, ipLimit)
      sendError(res, 429, 'rate_limited')
      return { ok: false }
    }
    logCall(ctx, undefined, undefined, keySource, 'unauthorized')
    sendError(res, 401, 'unauthorized')
    return { ok: false }
  }
  const check = verification.check
  if (!check.incoming) {
    // Same response as an unknown key - a caller must not be able to tell "wrong key" apart from
    // "valid key, but not permitted on ingest routes". Only our own log tells the two apart.
    logCall(ctx, check.keyId, undefined, keySource, 'incoming_disabled')
    sendError(res, 401, 'unauthorized')
    return { ok: false }
  }
  return { ok: true, check }
}

async function handleIngest (deps: IngestDeps, req: Request, res: Response): Promise<void> {
  const { ctx, config, producer, store, keySource } = deps
  const auth = await authenticateIngest(deps, req, res)
  if (!auth.ok) return
  const check = auth.check
  // No workspace in the path to check against - the key itself identifies it.
  const workspace = check.workspace

  const body = (req.body ?? {}) as Record<string, unknown>
  const action = body.action
  // `action` validity is checked against the operations registry (src/operations.ts) - the same
  // registry the consumer executes against, so the facade and the execution can't drift apart.
  if (!isKnownOperation(action)) {
    logCall(ctx, check.keyId, action, keySource, 'invalid_payload')
    sendError(res, 400, 'invalid_payload', `Unknown action: ${String(action)}`)
    return
  }
  const field = targetField(action)
  const target = body[field]
  if (typeof target !== 'string' || target.length === 0) {
    logCall(ctx, check.keyId, action, keySource, 'invalid_payload')
    sendError(res, 400, 'invalid_payload', `field "${field}": required`)
    return
  }

  if (!check.ops.includes(action)) {
    logCall(ctx, check.keyId, action, keySource, 'forbidden')
    sendError(res, 403, 'forbidden')
    return
  }

  const idempotencyKey = req.header('idempotency-key')
  if (idempotencyKey !== undefined && idempotencyKey.length > 0) {
    const existing = store.getIdempotentJob(check.keyId, idempotencyKey)
    if (existing !== undefined) {
      logCall(ctx, check.keyId, action, keySource, 'replayed')
      res.status(202).json({ jobId: existing.jobId })
      return
    }
  }

  // Best effort: a caller retries on its own only on 5xx, so an unknown target must be a 404 now rather
  // than a failed job later. If the lookup itself fails, the job is queued and the transactor decides.
  let lookup: TargetLookup | undefined
  try {
    const system = await getSystemTransactorTarget(config, workspace)
    lookup = await lookupTarget(system.rest, workspace, action, target)
  } catch (err) {
    ctx.warn('webhook: target lookup failed, queueing unchecked', { keyId: check.keyId, action, err })
  }
  if (lookup?.found === false) {
    logCall(ctx, check.keyId, action, keySource, 'not_found')
    sendError(res, 404, 'not_found', lookup.message)
    return
  }
  if (lookup?.found === true && check.spaces.length > 0 && !check.spaces.includes(lookup.space)) {
    logCall(ctx, check.keyId, action, keySource, 'forbidden')
    sendError(res, 403, 'forbidden', `The API key is not granted the space of ${field} '${target}'`)
    return
  }

  const jobId = `wh_${generateId()}`
  const message: WebhookJobMessage = {
    jobId,
    workspace,
    keyId: check.keyId,
    name: check.name,
    socialId: check.socialId,
    personUuid: check.personUuid,
    action,
    ops: check.ops,
    spaces: check.spaces,
    payload: body,
    receivedAt: Date.now(),
    attempt: 0
  }

  // Tracked before it is queued: the consumer runs in this same pod against this same store, so a job
  // enqueued first can be executed - and marked done - before the record it marks even exists.
  store.createJob(jobId, workspace, check.keyId)
  try {
    await producer.send(ctx, workspace, [message], workspace)
  } catch (err) {
    store.dropJob(jobId)
    ctx.error('webhook: failed to enqueue job', { err, keyId: check.keyId })
    logCall(ctx, check.keyId, action, keySource, 'internal_error')
    sendError(res, 500, 'internal_error')
    return
  }

  if (idempotencyKey !== undefined && idempotencyKey.length > 0) {
    store.putIdempotencyKey(check.keyId, idempotencyKey, jobId)
  }

  logCall(ctx, check.keyId, action, keySource, 'queued')
  res.status(202).json({ jobId })
}

interface RuleMatch {
  rule: WebhookIncomingRule
  items: Array<Record<string, string>>
}

// Evaluated against the whole body; only rules that matched AND produced at least one item carry work.
function matchRules (rules: WebhookIncomingRule[], body: Record<string, unknown>): RuleMatch[] {
  return rules
    .map((rule) => ({ rule, evaluation: evaluateWebhookRule(rule, body, safeRegexTest) }))
    .filter((m) => m.evaluation.matched && m.evaluation.items.length > 0)
    .map((m) => ({ rule: m.rule, items: m.evaluation.items }))
}

// One lookup per distinct (action, target) pair even when several matched rules share it. A failed
// lookup is recorded as `undefined` - queued unchecked, the same fallback handleIngest uses.
async function resolveRuleTargets (
  system: TransactorTarget,
  workspace: WorkspaceUuid,
  matches: RuleMatch[]
): Promise<Map<string, TargetLookup | undefined>> {
  const lookups = new Map<string, TargetLookup | undefined>()
  for (const { rule } of matches) {
    const key = `${rule.action}:${rule.target.id}`
    if (lookups.has(key)) continue
    try {
      lookups.set(key, await lookupTarget(system.rest, workspace, rule.action, rule.target.id))
    } catch (err) {
      lookups.set(key, undefined)
    }
  }
  return lookups
}

interface RuleJob {
  payload: Record<string, unknown>
  rule: WebhookIncomingRule
}

interface RuleSkip {
  rule: Ref<WebhookIncomingRule>
  reason: 'forbidden' | 'not_found'
}

// The grant is never widened for rule jobs: still `check.ops`/`check.spaces`, same as handleIngest.
function classifyRuleMatch (
  check: ApiKeyCheck,
  lookups: Map<string, TargetLookup | undefined>,
  match: RuleMatch
): { jobs: RuleJob[], skipped?: RuleSkip } {
  if (!check.ops.includes(match.rule.action)) {
    return { jobs: [], skipped: { rule: match.rule._id, reason: 'forbidden' } }
  }
  const lookup = lookups.get(`${match.rule.action}:${match.rule.target.id}`)
  if (lookup?.found === false) {
    return { jobs: [], skipped: { rule: match.rule._id, reason: 'not_found' } }
  }
  if (lookup?.found === true && check.spaces.length > 0 && !check.spaces.includes(lookup.space)) {
    return { jobs: [], skipped: { rule: match.rule._id, reason: 'forbidden' } }
  }
  const field = targetField(match.rule.action)
  // Item fields are spread first so a field named `action`/the target field cannot override them.
  const jobs = match.items.map((item) => ({
    payload: { ...item, action: match.rule.action, [field]: match.rule.target.id },
    rule: match.rule
  }))
  return { jobs }
}

// Queues every job in one producer.send call; on failure, none of them are left tracked in the store.
async function queueRuleJobs (
  deps: IngestDeps,
  workspace: WorkspaceUuid,
  check: ApiKeyCheck,
  jobs: RuleJob[]
): Promise<Array<{ jobId: string, rule: Ref<WebhookIncomingRule> }> | undefined> {
  const { ctx, producer, store } = deps
  const created: Array<{ jobId: string, rule: Ref<WebhookIncomingRule> }> = []
  const messages: WebhookJobMessage[] = []
  for (const job of jobs) {
    const jobId = `wh_${generateId()}`
    store.createJob(jobId, workspace, check.keyId)
    created.push({ jobId, rule: job.rule._id })
    messages.push({
      jobId,
      workspace,
      keyId: check.keyId,
      name: check.name,
      socialId: check.socialId,
      personUuid: check.personUuid,
      action: job.rule.action,
      ops: check.ops,
      spaces: check.spaces,
      payload: job.payload,
      receivedAt: Date.now(),
      attempt: 0,
      rule: job.rule._id
    })
  }
  if (messages.length === 0) return created
  try {
    await producer.send(ctx, workspace, messages, workspace)
    return created
  } catch (err) {
    for (const job of created) store.dropJob(job.jobId)
    ctx.error('webhook: failed to enqueue rule jobs', { err, keyId: check.keyId })
    return undefined
  }
}

// Third-party body -> WebhookIncomingRule matching -> one job per rendered item. No Idempotency-Key
// support here yet (one request can fan out into N jobs) - add a per-item key if a sender needs it.
async function handleRulesIngest (deps: IngestDeps, req: Request, res: Response): Promise<void> {
  const { ctx, config, keySource } = deps
  const auth = await authenticateIngest(deps, req, res)
  if (!auth.ok) return
  const check = auth.check
  const workspace = check.workspace
  const body = (req.body ?? {}) as Record<string, unknown>

  let system: TransactorTarget
  let rules: WebhookIncomingRule[]
  try {
    system = await getSystemTransactorTarget(config, workspace)
    rules = await loadRules(system.rest, workspace, check)
  } catch (err) {
    ctx.error('webhook: failed to load rules', { err, keyId: check.keyId })
    logCall(ctx, check.keyId, undefined, keySource, 'service_unavailable')
    sendError(res, 503, 'service_unavailable')
    return
  }

  const matches = matchRules(rules, body)
  const totalItems = matches.reduce((sum, m) => sum + m.items.length, 0)
  if (totalItems > WEBHOOK_RULE_MAX_JOBS) {
    logCall(ctx, check.keyId, undefined, keySource, 'payload_too_large')
    sendError(res, 413, 'payload_too_large', `Rules matched ${totalItems} items, limit is ${WEBHOOK_RULE_MAX_JOBS}`)
    return
  }
  if (totalItems === 0) {
    logCall(ctx, check.keyId, undefined, keySource, 'no_match')
    res.status(202).json({ jobs: [] })
    return
  }

  const lookups = await resolveRuleTargets(system, workspace, matches)
  const jobs: RuleJob[] = []
  const skipped: RuleSkip[] = []
  for (const match of matches) {
    const classified = classifyRuleMatch(check, lookups, match)
    jobs.push(...classified.jobs)
    if (classified.skipped !== undefined) skipped.push(classified.skipped)
  }

  const created = await queueRuleJobs(deps, workspace, check, jobs)
  if (created === undefined) {
    logCall(ctx, check.keyId, undefined, keySource, 'internal_error')
    sendError(res, 500, 'internal_error')
    return
  }

  logCall(ctx, check.keyId, undefined, keySource, created.length > 0 ? 'queued' : 'no_match')
  res.status(202).json({ jobs: created, skipped })
}

async function handleJobStatus (
  ctx: MeasureContext,
  accountClient: AccountClient,
  store: WebhookStore,
  req: Request,
  res: Response
): Promise<void> {
  const key = bearerToken(req)
  if (key === undefined || key.length === 0) {
    sendError(res, 401, 'unauthorized')
    return
  }

  const verification = await verifyKey(ctx, accountClient, key)
  if (verification.status === 'unavailable') {
    logCall(ctx, undefined, undefined, 'header', 'service_unavailable')
    sendError(res, 503, 'service_unavailable')
    return
  }
  if (verification.status === 'error') {
    logCall(ctx, undefined, undefined, 'header', 'internal_error')
    sendError(res, 500, 'internal_error')
    return
  }
  if (verification.status === 'invalid') {
    sendError(res, 401, 'unauthorized')
    return
  }
  const check = verification.check

  // keyId as well as workspace: one key must not read another key's job result or error text.
  const job = store.getJob(req.params.id)
  if (job?.workspace !== check.workspace || job.keyId !== check.keyId) {
    sendError(res, 404, 'not_found')
    return
  }

  res.status(200).json({
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    result: job.result,
    error: job.error
  })
}

// Synchronous, not queued: a test has to show its own result, and doesn't touch failureCount/
// lastError/enabled - a bad test send shouldn't count against (or auto-disable) a real endpoint.
// It's still logged into the same "recent deliveries" history real deliveries use.
async function handleTestSend (config: Config, req: Request, res: Response): Promise<void> {
  const workspace = req.params.workspace as WorkspaceUuid
  const token = bearerToken(req)
  if (token === undefined || token.length === 0) {
    sendError(res, 401, 'unauthorized')
    return
  }

  let decoded
  try {
    decoded = decodeToken(token)
  } catch {
    sendError(res, 401, 'unauthorized')
    return
  }
  if (decoded.workspace !== workspace) {
    sendError(res, 401, 'unauthorized')
    return
  }

  // Owner only, matching the settings category this is called from - the endpoint is read with the
  // pod's own system token below, so the caller's own read rights would not gate anything.
  try {
    const info = await getAccountClient(config.AccountsUrl, token).getLoginWithWorkspaceInfo()
    if (info.workspaces[workspace]?.role !== AccountRole.Owner) {
      sendError(res, 403, 'forbidden')
      return
    }
  } catch {
    sendError(res, 401, 'unauthorized')
    return
  }

  const endpointId = req.params.endpointId as Ref<WebhookEndpoint>
  const target = await getSystemTransactorTarget(config, workspace)
  const endpoint = await target.rest.findOne(setting.class.WebhookEndpoint, { _id: endpointId })
  if (endpoint === undefined) {
    sendError(res, 404, 'not_found')
    return
  }

  const deliveryId = `test_${generateId()}`
  const timestampSec = Math.floor(Date.now() / 1000)
  const event: WebhookEvent = {
    action: 'create',
    type: 'webhook.test',
    actor: decoded.account as unknown as PersonId,
    data: { message: 'This is a test event sent from the workspace settings page.' },
    organizationId: workspace
  }
  const body = JSON.stringify({ ...event, webhookId: deliveryId, webhookTimestamp: timestampSec })
  const headers = buildDeliveryHeaders(endpoint, deliveryId, timestampSec, body, 0)

  try {
    const result = await safeFetch(endpoint.url, {
      method: 'POST',
      headers,
      body,
      timeoutMs: config.WebhookDeliveryTimeoutMs,
      maxResponseBytes: config.WebhookMaxResponseBytes,
      allowInsecureHttp: config.AllowInsecureWebhookHttp,
      devAllowedHosts: config.DevAllowedWebhookHosts,
      blockedHosts: config.BlockedWebhookHosts
    })
    await recordDeliveryOutcome(target.rest, endpoint, { deliveryId, attempt: 0, status: result.status })
    res.status(200).json({ delivered: result.status >= 200 && result.status < 300, status: result.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await recordDeliveryOutcome(target.rest, endpoint, { deliveryId, attempt: 0, error: message })
    res.status(200).json({ delivered: false, error: message })
  }
}
