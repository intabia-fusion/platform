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
import contact, { type Employee } from '@hcengineering/contact'
import core, {
  AccountRole,
  type AccountUuid,
  type Class,
  type MeasureContext,
  type Ref,
  type SessionData,
  systemAccountUuid,
  type Tx,
  type TxApplyIf,
  type TxCUD,
  type TxMixin,
  type TxUpdateDoc,
  type Doc,
  type WorkspaceUuid,
  configUserAccountUuid
} from '@hcengineering/core'
import {
  BaseMiddleware,
  type LimitsProvider,
  type Middleware,
  type PipelineContext,
  type PlanLimits,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import { LIMITS_PROVIDER_VAR, PLAN_LIMITS_MAP_KEY, PLAN_LIMITS_VAR } from './planLimits'
import { aiBotAccountEmail } from './identity'

const GUEST_ROLES = new Set<AccountRole>([AccountRole.Guest, AccountRole.DocGuest, AccountRole.ReadOnlyGuest])

/** Owners take seats first, then Maintainers, then Users; ties broken by employee createdOn. */
function rolePriority (role: AccountRole | undefined): number {
  if (role === AccountRole.Owner) return 0
  if (role === AccountRole.Maintainer) return 1
  return 2
}

const AI_ACCOUNT_EMAILS = new Set<string>([aiBotAccountEmail])

function isSystemAccount (
  account: { uuid: AccountUuid, role: AccountRole, fullSocialIds: { value: string }[] },
  systemAccounts?: Set<AccountUuid>
): boolean {
  return (
    account.uuid === systemAccountUuid ||
    account.uuid === configUserAccountUuid ||
    account.role === AccountRole.Admin ||
    systemAccounts?.has(account.uuid) === true ||
    account.fullSocialIds.some((it) => AI_ACCOUNT_EMAILS.has(it.value))
  )
}

/**
 * Seat enforcement: members beyond usersLimit become read-only — write tx are rejected here,
 * except the direct/chat-message classes the provider whitelists. The account role is NOT
 * mutated; the user keeps their role so onboarding/identity flows that read role stay consistent.
 * Seats are assigned to active employees by role priority (Owner, Maintainer, then Users),
 * createdOn order within a role.
 */
export class SeatLimitsMiddleware extends BaseMiddleware implements Middleware {
  private usersLimit = 0
  private readonly seatSet = new Set<AccountUuid>()
  /** System/AI account uuids (never occupy a seat). Resolved lazily; undefined = not yet resolved. */
  private systemAccounts: Set<AccountUuid> | undefined
  /** Set when an Employee tx is seen; triggers a rebuild on the next tx. */
  private seatSetDirty = false
  /** Seats init is lazy: PLAN_LIMITS_VAR is published by PlanLimitsMiddleware, which boots after us. */
  private seatsInited = false

  private constructor (context: PipelineContext, next?: Middleware) {
    super(context, next)
  }

  static async create (
    ctx: MeasureContext,
    context: PipelineContext,
    next: Middleware | undefined
  ): Promise<SeatLimitsMiddleware> {
    const mw = new SeatLimitsMiddleware(context, next)
    await mw.init(ctx)
    return mw
  }

  private get provider (): LimitsProvider | undefined {
    return this.context.contextVars[LIMITS_PROVIDER_VAR] as LimitsProvider | undefined
  }

  private async init (_ctx: MeasureContext): Promise<void> {}

  /** Live limits: shared host map (refreshed on plan changes) over the boot snapshot. */
  private planLimits (): PlanLimits | undefined {
    const map = this.context.contextVars[PLAN_LIMITS_MAP_KEY] as Map<WorkspaceUuid, PlanLimits> | undefined
    return (
      map?.get(this.context.workspace.uuid) ?? (this.context.contextVars[PLAN_LIMITS_VAR] as PlanLimits | undefined)
    )
  }

  private async initSeats (ctx: MeasureContext): Promise<void> {
    const limits = this.planLimits()
    if (limits === undefined) return // PlanLimits not booted yet, retry on next tx
    this.seatsInited = true

    this.usersLimit = limits.usersLimit
    if (this.usersLimit === 0) return // seat enforcement disabled

    if (this.provider === undefined) {
      ctx.warn('SeatLimitsMiddleware: LimitsProvider not set, seat enforcement disabled')
      this.usersLimit = 0
      return
    }

    try {
      await this.buildSeatSet(ctx)
      ctx.info('SeatLimitsMiddleware: seat init complete', {
        usersLimit: this.usersLimit,
        seated: this.seatSet.size
      })
    } catch (err: any) {
      ctx.error('SeatLimitsMiddleware: failed to init seats, enforcement disabled', { err })
      this.usersLimit = 0 // fail-open
    }
  }

  /** Resolve system/AI account uuids once (excluded from seat counting). */
  private async resolveSystemAccounts (): Promise<Set<AccountUuid>> {
    if (this.systemAccounts !== undefined) return this.systemAccounts
    this.systemAccounts = (await this.provider?.getSystemAccounts(this.context.workspace.uuid)) ?? new Set()
    return this.systemAccounts
  }

  /**
   * Fill seatSet with the first usersLimit eligible employees (role priority, then createdOn).
   * The slot counter advances even for unresolvable accounts, so a card without an accepted
   * invite still consumes budget; seatSet itself holds only resolvable uuids for the downgrade.
   */
  private async buildSeatSet (ctx: MeasureContext): Promise<void> {
    const provider = this.provider
    if (provider === undefined) return
    const members = await provider.getWorkspaceMembers(this.context.workspace.uuid)
    const systemAccounts = await this.resolveSystemAccounts()

    // Keep every member role (including Admin) so the seat loop can identify and skip Admins.
    const memberRole = new Map<AccountUuid, AccountRole>()
    for (const m of members) memberRole.set(m.person, m.role)

    const employees = (await this.provideFindAll(ctx, contact.mixin.Employee, { active: true })) ?? []
    const sorted = [...employees].sort((a, b) => {
      const pa = rolePriority(a.personUuid == null ? undefined : memberRole.get(a.personUuid))
      const pb = rolePriority(b.personUuid == null ? undefined : memberRole.get(b.personUuid))
      if (pa !== pb) return pa - pb
      return (a.createdOn ?? 0) - (b.createdOn ?? 0)
    })

    this.seatSet.clear()
    let seatsUsed = 0
    for (const emp of sorted as Employee[]) {
      if (seatsUsed >= this.usersLimit) break
      const uuid = emp.personUuid
      if (uuid != null && !this.seatEligible(uuid, memberRole.get(uuid), systemAccounts)) continue
      seatsUsed++
      if (uuid != null) this.seatSet.add(uuid)
    }
  }

  /** A seat is consumed by any active employee except system/AI/Admin and guest-role accounts. */
  private seatEligible (uuid: AccountUuid, role: AccountRole | undefined, systemAccounts: Set<AccountUuid>): boolean {
    if (systemAccounts.has(uuid)) return false
    if (role === AccountRole.Admin) return false
    if (role !== undefined && GUEST_ROLES.has(role)) return false
    return true
  }

  private async rebuildSeatSet (ctx: MeasureContext): Promise<void> {
    this.seatSetDirty = false
    try {
      await this.buildSeatSet(ctx)
    } catch (err: any) {
      ctx.error('SeatLimitsMiddleware: failed to rebuild seat set', { err })
    }
  }

  private isEmployeeTx (tx: Tx): boolean {
    return (tx as TxCUD<Doc>).objectClass === contact.mixin.Employee
  }

  /**
   * A tx that turns an employee active: the create-mixin (UI "+Employee") or a re-activation
   * update (active: false -> true). These add a seat and must be blocked when the plan is full.
   */
  private isEmployeeActivation (tx: Tx): boolean {
    // UI may wrap the create-mixin in apply(); unwrap so the inner CUD is inspected.
    if (tx._class === core.class.TxApplyIf) {
      return (tx as TxApplyIf).txes.some((inner) => this.isEmployeeActivation(inner))
    }
    if (tx._class === core.class.TxMixin) {
      const mt = tx as TxMixin<Doc, Doc>
      return mt.mixin === contact.mixin.Employee && (mt.attributes as Partial<Employee>)?.active === true
    }
    if (tx._class === core.class.TxUpdateDoc) {
      const ut = tx as TxUpdateDoc<Employee>
      return ut.objectClass === contact.mixin.Employee && ut.operations?.active === true
    }
    return false
  }

  /**
   * Count seat-consuming active employees: every active Employee minus system/AI identities and
   * guest-role accounts (read-only, no seat). Mirrors buildSeatSet's seat accounting so the
   * creation block and the downgrade agree on what fills the budget.
   */
  private async countActiveEmployees (ctx: MeasureContext): Promise<number> {
    const provider = this.provider
    const systemAccounts = await this.resolveSystemAccounts()
    const members = (await provider?.getWorkspaceMembers(this.context.workspace.uuid)) ?? []
    const memberRole = new Map<AccountUuid, AccountRole>()
    for (const m of members) memberRole.set(m.person, m.role)

    const employees = (await this.provideFindAll(ctx, contact.mixin.Employee, { active: true })) ?? []
    let count = 0
    for (const emp of employees as Employee[]) {
      const uuid = emp.personUuid
      // Employees without a resolvable account (no membership) still take a slot — a card
      // pending invite consumes budget; only system/Admin/guest are exempt.
      if (uuid != null && !this.seatEligible(uuid, memberRole.get(uuid), systemAccounts)) continue
      count++
    }
    return count
  }

  /** Classes a read-only member may still write (direct/chat messages). Empty if provider omits it. */
  private readOnlyAllowedClasses (): Set<Ref<Class<Doc>>> {
    return this.provider?.getReadOnlyAllowedClasses?.() ?? new Set()
  }

  /** A tx is allowed for read-only members only if its target class is whitelisted (e.g. messages). */
  private isReadOnlyAllowed (tx: Tx, allowed: Set<Ref<Class<Doc>>>): boolean {
    if (tx._class === core.class.TxApplyIf) {
      return (tx as TxApplyIf).txes.every((inner) => this.isReadOnlyAllowed(inner, allowed))
    }
    const cud = tx as TxCUD<Doc>
    // System-generated derived tx (triggers/collections) are not user writes — pass through.
    if (cud.space === core.space.DerivedTx) return true
    const objectClass = cud.objectClass
    if (objectClass == null) return false
    for (const cls of allowed) {
      if (this.context.hierarchy.isDerived(objectClass, cls)) return true
    }
    return false
  }

  /** Read-only mode: reject every write tx whose class is not whitelisted; pass the rest through. */
  private async enforceReadOnly (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const allowed = this.readOnlyAllowedClasses()
    for (const tx of txes) {
      if (!this.isReadOnlyAllowed(tx, allowed)) {
        throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
      }
    }
    return await this.provideTx(ctx, txes)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const account = ctx.contextData?.account
    if (account == null) return await this.provideTx(ctx, txes)

    // System identities (system account, Admin operator, AI services) bypass all enforcement.
    const system = isSystemAccount(account, this.systemAccounts)

    if (system) {
      return await this.provideTx(ctx, txes)
    }

    if (!this.seatsInited) {
      await this.initSeats(ctx)
    } else {
      // Plan changed at runtime (shared map refreshed): rebuild seats with the new limit.
      const live = this.planLimits()?.usersLimit
      if (live !== undefined && live !== this.usersLimit) {
        this.seatsInited = false
        await this.initSeats(ctx)
      }
    }
    if (this.usersLimit === 0) {
      return await this.provideTx(ctx, txes)
    }

    // Hard-block adding a new seat past the limit. Existing over-limit employees (after a plan
    // downgrade) are kept; only NEW activations are rejected. Counted by active Employee, minus
    // system/AI. The seatless read-only enforcement below still applies to over-limit members.
    if (txes.some((tx) => this.isEmployeeActivation(tx))) {
      const current = await this.countActiveEmployees(ctx)
      if (current >= this.usersLimit) {
        ctx.info('SeatLimits: employee creation rejected', { usersLimit: this.usersLimit, current })
        throw new PlatformError(
          new Status(Severity.ERROR, platform.status.PlanLimitExceeded, { category: contact.mixin.Employee })
        )
      }
    }

    if (this.seatSetDirty) {
      await this.rebuildSeatSet(ctx)
    }
    // Employee active change invalidates the seat-set for the next tx.
    if (!this.seatSetDirty && txes.some((tx) => this.isEmployeeTx(tx))) {
      this.seatSetDirty = true
    }

    if (GUEST_ROLES.has(account.role)) {
      return await this.provideTx(ctx, txes)
    }

    if (this.seatSet.has(account.uuid)) {
      return await this.provideTx(ctx, txes)
    }

    // Seats not yet full: a free seat is available, so this member takes it (covers the boot window
    // where a fresh workspace has no active Employee yet — onboarding writes must not be blocked).
    // Count real active employees rather than seatSet.size, which may be empty if the set has not
    // been (re)built yet under load — otherwise enforcement would wrongly disable on a full workspace.
    const activeEmployees = await this.countActiveEmployees(ctx)
    if (activeEmployees < this.usersLimit) {
      return await this.provideTx(ctx, txes)
    }

    // Seatless member (all seats taken): read-only except whitelisted message classes. Role untouched.
    return await this.enforceReadOnly(ctx, txes)
  }
}
