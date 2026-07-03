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
import core, {
  type Class,
  type Doc,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Space,
  systemAccountUuid,
  type Tx,
  type TxApplyIf,
  type TxCUD,
  TxProcessor,
  type TxUpdateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import {
  BaseMiddleware,
  type LimitsProvider,
  type Middleware,
  type PipelineContext,
  type PlanLimits,
  type SpaceCountsProvider,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { LIMITS_PROVIDER_VAR, PLAN_LIMITS_MAP_KEY, PLAN_LIMITS_VAR, SPACE_COUNTS_PROVIDER_KEY } from './planLimits'

/** Space count grouped by concrete _class, provided by SpaceSecurityMiddleware. */
type SpaceCounts = Map<Ref<Class<Space>>, number>

const ZERO_LIMITS: PlanLimits = {
  spaceLimits: new Map(),
  usersLimit: 0,
  storageLimitGB: 0,
  tokenLimit: 0,
  transcriptLimit: 0
}

/**
 * Middleware to limit users/projects/etc.
 */
export class PlanLimitsMiddleware extends BaseMiddleware implements Middleware {
  /** In-flight space creations reserved before the tx lands in SpaceSecurity's counts (check-then-act race guard). */
  private readonly pendingCreates = new Map<Ref<Class<Doc>>, number>()

  private constructor (context: PipelineContext, next?: Middleware) {
    super(context, next)
  }

  /** Shared host map, refreshed live on 'plan' LimitsChanged events. */
  private sharedMap (): Map<WorkspaceUuid, PlanLimits> | undefined {
    return this.context.contextVars[PLAN_LIMITS_MAP_KEY] as Map<WorkspaceUuid, PlanLimits> | undefined
  }

  private sharedLimits (): PlanLimits | undefined {
    return this.sharedMap()?.get(this.context.workspace.uuid)
  }

  /** SpaceCountsProvider registered by SpaceSecurityMiddleware (pulled for live counts). */
  private spaceCountsProvider (): SpaceCountsProvider | undefined {
    return this.context.contextVars[SPACE_COUNTS_PROVIDER_KEY] as SpaceCountsProvider | undefined
  }

  static async create (
    ctx: MeasureContext,
    context: PipelineContext,
    next: Middleware | undefined
  ): Promise<PlanLimitsMiddleware> {
    const mw = new PlanLimitsMiddleware(context, next)
    await mw.bootResolveLimits(ctx)
    return mw
  }

  private async bootResolveLimits (ctx: MeasureContext): Promise<void> {
    try {
      const provider = this.context.contextVars[LIMITS_PROVIDER_VAR] as LimitsProvider | undefined
      if (provider === undefined) {
        ctx.warn('PlanLimitsMiddleware: LimitsProvider not set in contextVars, limits disabled')
        this.context.contextVars[PLAN_LIMITS_VAR] = ZERO_LIMITS
        return
      }
      // Shared host map (refreshed by the host consumer on plan changes) wins over a fresh resolve.
      const shared = this.sharedLimits()
      const limits = shared ?? (await provider.getPlanLimits(this.context.workspace.uuid))
      this.sharedMap()?.set(this.context.workspace.uuid, limits)
      this.context.contextVars[PLAN_LIMITS_VAR] = limits
      ctx.info('PlanLimitsMiddleware: limits resolved', {
        workspace: this.context.workspace.uuid,
        spaceLimits: Object.fromEntries(limits.spaceLimits),
        usersLimit: limits.usersLimit
      })
      if (limits.spaceLimits.size > 0) {
        // Prime the counts provider: SpaceSecurityMiddleware registers it from its init(), which the
        // findAll below triggers. The call may then throw on the boot context (no session account) —
        // by that point the provider is registered, so swallow it.
        try {
          await this.provideFindAll(ctx as MeasureContext<SessionData>, core.class.Space, { _id: 'none' as Ref<Space> })
        } catch {}
        if (this.spaceCountsProvider() === undefined) {
          ctx.warn('PlanLimitsMiddleware: SpaceCountsProvider not registered after boot probe')
        }
      }
    } catch (err: any) {
      // fail-open: zero limits = unlimited
      ctx.error('PlanLimitsMiddleware: failed to resolve limits, using zero (unlimited)', { err })
      this.context.contextVars[PLAN_LIMITS_VAR] = ZERO_LIMITS
    }
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const reserved: Ref<Class<Doc>>[] = []
    try {
      // System account creates platform spaces (meeting records drive etc.) — not subject to plan limits.
      if (ctx.contextData?.account?.uuid !== systemAccountUuid) {
        for (const tx of txes) {
          this.checkTx(ctx, tx, reserved)
        }
      }
      return await this.provideTx(ctx, txes)
    } finally {
      for (const c of reserved) {
        const left = (this.pendingCreates.get(c) ?? 1) - 1
        if (left <= 0) this.pendingCreates.delete(c)
        else this.pendingCreates.set(c, left)
      }
    }
  }

  private checkTx (ctx: MeasureContext<SessionData>, tx: Tx, reserved: Array<Ref<Class<Doc>>>): void {
    // UI creates spaces via apply('...').createDoc — unwrap so inner CUDs are enforced
    // (ApplyTxMiddleware sits below this one and would otherwise hide them).
    if (this.context.hierarchy.isDerived(tx._class, core.class.TxApplyIf)) {
      for (const inner of (tx as TxApplyIf).txes) {
        this.checkTx(ctx, inner, reserved)
      }
      return
    }
    if (!TxProcessor.isExtendsCUD(tx._class)) {
      return
    }
    const cudTx = tx as TxCUD<Doc>
    const h = this.context.hierarchy

    if (!h.isDerived(cudTx.objectClass, core.class.Space)) {
      return
    }

    // Live value from the shared map first: it follows plan upgrades without a pipeline restart.
    const limits = this.sharedLimits() ?? (this.context.contextVars[PLAN_LIMITS_VAR] as PlanLimits | undefined)
    if (limits === undefined || limits.spaceLimits.size === 0) return // no limits -> nothing to enforce

    const provider = this.spaceCountsProvider()
    if (provider === undefined) {
      // fail-open: SpaceSecurity has not registered its counts provider yet (pipeline cold start)
      ctx.warn('PlanLimits: SpaceCountsProvider not registered, skipping enforcement', {
        objectClass: cudTx.objectClass
      })
      return
    }
    const counts = provider.getSpaceCounts()
    if (counts === undefined) {
      return
    }

    const isCreate = cudTx._class === core.class.TxCreateDoc
    // unarchive: space becomes active again, treated like a new active space
    const isUnarchive =
      cudTx._class === core.class.TxUpdateDoc && (cudTx as TxUpdateDoc<Space>).operations.archived === false
    if (!isCreate && !isUnarchive) return

    this.enforce(ctx, cudTx.objectClass, counts, limits)
    // Reserve the slot until provideTx completes: a parallel create must see it before
    // SpaceSecurity's counts update, or both pass the check and the limit is exceeded.
    this.pendingCreates.set(cudTx.objectClass, (this.pendingCreates.get(cudTx.objectClass) ?? 0) + 1)
    reserved.push(cudTx.objectClass)
  }

  /** Find the configured space-class whose limit covers objectClass, and enforce it. */
  private enforce (
    ctx: MeasureContext<SessionData>,
    objectClass: Ref<Class<Doc>>,
    counts: SpaceCounts,
    limits: PlanLimits
  ): void {
    const h = this.context.hierarchy
    for (const [limitClass, limitValue] of limits.spaceLimits) {
      if (limitValue === 0) continue // 0 = unlimited
      if (!h.isDerived(objectClass, limitClass)) continue

      // Sum non-archived counts across every concrete class derived from this limit's space class.
      let current = 0
      for (const [classRef, count] of counts) {
        if (h.isDerived(classRef, limitClass)) current += count
      }
      // Plus in-flight creations not yet visible in counts.
      for (const [classRef, count] of this.pendingCreates) {
        if (h.isDerived(classRef, limitClass)) current += count
      }
      if (current >= limitValue) {
        ctx.info('PlanLimits: rejected', { objectClass, limitClass, limitValue, current })
        throw new PlatformError(new Status(Severity.ERROR, platform.status.PlanLimitExceeded, { category: limitClass }))
      }
    }
  }
}
