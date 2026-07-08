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
  AccountRole,
  type AccountUuid,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  toFindResult,
  type MeasureContext,
  type SessionData,
  type WorkspaceMemberInfo
} from '@hcengineering/core'
import { PlatformError } from '@hcengineering/platform'
import contact from '@hcengineering/contact'
import type { LimitsProvider, Middleware, PipelineContext, TxMiddlewareResult } from '@hcengineering/server-core'
import { SeatLimitsMiddleware } from '../seatLimits'
import { LIMITS_PROVIDER_VAR, PLAN_LIMITS_VAR } from '../planLimits'

interface MockEmployee {
  personUuid: string
  active: boolean
  createdOn: number
}

// Whitelist for read-only members in tests: UserStatus stands in for the direct/presence classes.
// isDerived is reflexive, so a tx with objectClass === UserStatus is "allowed" without a model.
const ALLOWED_CLASS = core.class.UserStatus

function makeProvider (members: WorkspaceMemberInfo[], systemAccounts = new Set<AccountUuid>()): LimitsProvider {
  return {
    getPlanLimits: async () => ({
      usersLimit: 0,
      storageLimitGB: 0,
      tokenLimit: 0,
      transcriptLimit: 0
    }),
    getWorkspaceMembers: async () => members,
    getSystemAccounts: async () => systemAccounts,
    getReadOnlyAllowedClasses: () => new Set([ALLOWED_CLASS])
  }
}

// A non-whitelisted write tx (a plain space create). Read-only members must be rejected on it.
function writeTx (): any {
  return { _class: core.class.TxCreateDoc, objectClass: core.class.Space, space: 'some-space' }
}

// A whitelisted write tx (presence/direct stand-in). Read-only members must be allowed through.
function allowedTx (): any {
  return { _class: core.class.TxCreateDoc, objectClass: ALLOWED_CLASS, space: 'some-space' }
}

// Assert a member is seated (write tx passes to next) vs read-only (write tx -> Forbidden).
async function expectSeated (mw: SeatLimitsMiddleware, ctx: MeasureContext<SessionData>): Promise<void> {
  await expect(mw.tx(ctx, [writeTx()])).resolves.toBeDefined()
}
async function expectReadOnly (mw: SeatLimitsMiddleware, ctx: MeasureContext<SessionData>): Promise<void> {
  await expect(mw.tx(ctx, [writeTx()])).rejects.toBeInstanceOf(PlatformError)
}

// Empty test Hierarchy has no ancestors, so isDerived(X,X) is false. Stub it to be reflexive
// (and treat unknown classes as non-derived) so the whitelist check resolves in tests.
function reflexiveHierarchy (): Hierarchy {
  const hierarchy = new Hierarchy()
  hierarchy.isDerived = ((cls: any, from: any) => cls === from) as any
  return hierarchy
}

function makeContext (
  usersLimit: number,
  members: WorkspaceMemberInfo[],
  systemAccounts = new Set<AccountUuid>()
): PipelineContext {
  const hierarchy = reflexiveHierarchy()
  return {
    workspace: { uuid: 'ws-test' as any, url: 'test', dataId: 'test' as any },
    hierarchy,
    modelDb: new ModelDb(hierarchy),
    branding: null as any,
    adapterManager: {} as any,
    storageAdapter: {} as any,
    contextVars: {
      [PLAN_LIMITS_VAR]: { usersLimit, storageLimitGB: 0, tokenLimit: 0, transcriptLimit: 0 },
      [LIMITS_PROVIDER_VAR]: makeProvider(members, systemAccounts)
    },
    lastTx: '',
    lastHash: ''
  } as any
}

// next.findAll returns active employees (mirrors DB query findAll(Employee, {active:true})).
function makeNext (employees: MockEmployee[]): Middleware {
  return {
    findAll: jest.fn(async () => toFindResult(employees.filter((e) => e.active) as any)),
    tx: jest.fn(async (): Promise<TxMiddlewareResult> => ({})),
    searchFulltext: jest.fn(async () => ({ docs: [] })),
    handleBroadcast: jest.fn(async () => {}),
    groupBy: jest.fn(async () => new Map()),
    loadModel: jest.fn(async () => []),
    domainRequest: jest.fn(async () => ({})),
    closeSession: jest.fn(async () => {}),
    close: jest.fn(async () => {})
  } as any
}

function makeSessionCtx (uuid: string, role: AccountRole): MeasureContext<SessionData> {
  const ctx = new MeasureMetricsContext('test', {}) as MeasureContext<SessionData>
  ctx.contextData = {
    broadcast: { txes: [], targets: {}, queue: [], sessions: {} },
    contextCache: new Map(),
    removedMap: new Map(),
    account: {
      uuid: uuid as AccountUuid,
      role,
      primarySocialId: `e:${uuid}` as any,
      socialIds: [],
      fullSocialIds: []
    },
    service: 'test',
    sessionId: 'sess',
    workspace: { uuid: 'ws-test' as any, url: 'test', dataId: 'test' as any },
    socialStringsToUsers: new Map()
  } as any
  return ctx
}

function member (person: string, role: AccountRole): WorkspaceMemberInfo {
  return { person: person as AccountUuid, role }
}

async function createMw (
  usersLimit: number,
  members: WorkspaceMemberInfo[],
  employees: MockEmployee[],
  systemAccounts = new Set<AccountUuid>()
): Promise<SeatLimitsMiddleware> {
  const measCtx = new MeasureMetricsContext('test', {})
  const context = makeContext(usersLimit, members, systemAccounts)
  return await SeatLimitsMiddleware.create(measCtx, context, makeNext(employees))
}

describe('SeatLimitsMiddleware', () => {
  it('usersLimit=0: enforcement disabled, all pass', async () => {
    const mw = await createMw(0, [], [])
    await expectSeated(mw, makeSessionCtx('user1', AccountRole.User))
  })

  it('Owner takes a seat first regardless of createdOn', async () => {
    // usersLimit=1: owner created later than user1, but role priority wins the single seat
    const members = [member('owner1', AccountRole.Owner), member('user1', AccountRole.User)]
    const employees: MockEmployee[] = [
      { personUuid: 'user1', active: true, createdOn: 1000 },
      { personUuid: 'owner1', active: true, createdOn: 2000 }
    ]
    const mw = await createMw(1, members, employees)

    await expectSeated(mw, makeSessionCtx('owner1', AccountRole.Owner))
    await expectReadOnly(mw, makeSessionCtx('user1', AccountRole.User))
  })

  it('Maintainer has priority over User, but loses to Owner', async () => {
    // usersLimit=2: seats go to owner and maintainer (priority), user is left out
    const members = [
      member('owner1', AccountRole.Owner),
      member('maint1', AccountRole.Maintainer),
      member('user1', AccountRole.User)
    ]
    const employees: MockEmployee[] = [
      { personUuid: 'user1', active: true, createdOn: 1000 },
      { personUuid: 'maint1', active: true, createdOn: 2000 },
      { personUuid: 'owner1', active: true, createdOn: 3000 }
    ]
    const mw = await createMw(2, members, employees)

    await expectSeated(mw, makeSessionCtx('maint1', AccountRole.Maintainer))
    await expectReadOnly(mw, makeSessionCtx('user1', AccountRole.User))
  })

  it('Owner beyond the budget is read-only too (no role bypass)', async () => {
    // usersLimit=1, two owners: the earlier-created one wins, the other is read-only
    const members = [member('owner1', AccountRole.Owner), member('owner2', AccountRole.Owner)]
    const employees: MockEmployee[] = [
      { personUuid: 'owner1', active: true, createdOn: 1000 },
      { personUuid: 'owner2', active: true, createdOn: 2000 }
    ]
    const mw = await createMw(1, members, employees)

    await expectSeated(mw, makeSessionCtx('owner1', AccountRole.Owner))
    await expectReadOnly(mw, makeSessionCtx('owner2', AccountRole.Owner))
  })

  it('first usersLimit employees by createdOn get write', async () => {
    // usersLimit=3: owner + user1 + user2 seated, user3 is not
    const members = [
      member('owner1', AccountRole.Owner),
      member('user1', AccountRole.User),
      member('user2', AccountRole.User),
      member('user3', AccountRole.User)
    ]
    const employees: MockEmployee[] = [
      { personUuid: 'owner1', active: true, createdOn: 500 },
      { personUuid: 'user1', active: true, createdOn: 1000 },
      { personUuid: 'user2', active: true, createdOn: 2000 },
      { personUuid: 'user3', active: true, createdOn: 3000 }
    ]
    const mw = await createMw(3, members, employees)

    await expectSeated(mw, makeSessionCtx('user1', AccountRole.User))
    await expectReadOnly(mw, makeSessionCtx('user3', AccountRole.User))
  })

  it('later createdOn loses seat when limit reached', async () => {
    const members = [member('user1', AccountRole.User), member('user2', AccountRole.User)]
    // unsorted input; earliest createdOn (user1) wins the single seat
    const employees: MockEmployee[] = [
      { personUuid: 'user2', active: true, createdOn: 5000 },
      { personUuid: 'user1', active: true, createdOn: 1000 }
    ]
    const mw = await createMw(1, members, employees)

    await expectSeated(mw, makeSessionCtx('user1', AccountRole.User))
    await expectReadOnly(mw, makeSessionCtx('user2', AccountRole.User))
  })

  it('a read-only member can still write whitelisted (direct/presence) classes', async () => {
    const members = [member('user1', AccountRole.User), member('user2', AccountRole.User)]
    const employees: MockEmployee[] = [
      { personUuid: 'user1', active: true, createdOn: 1000 },
      { personUuid: 'user2', active: true, createdOn: 2000 }
    ]
    const mw = await createMw(1, members, employees) // user2 seatless

    const c2 = makeSessionCtx('user2', AccountRole.User)
    await expect(mw.tx(c2, [allowedTx()])).resolves.toBeDefined() // direct message goes through
    await expect(mw.tx(c2, [writeTx()])).rejects.toBeInstanceOf(PlatformError) // other writes blocked
  })

  it('Admin does not consume the seat budget and is not seated', async () => {
    // usersLimit=1, admin created first: must not grab the seat, the single User keeps it.
    const members = [member('admin1', AccountRole.Admin), member('user1', AccountRole.User)]
    const employees: MockEmployee[] = [
      { personUuid: 'admin1', active: true, createdOn: 500 },
      { personUuid: 'user1', active: true, createdOn: 1000 }
    ]
    const mw = await createMw(1, members, employees)

    await expectSeated(mw, makeSessionCtx('user1', AccountRole.User))
    await expectSeated(mw, makeSessionCtx('admin1', AccountRole.Admin)) // Admin bypass
  })

  it('active employee without an accepted invite still consumes a seat (P.3)', async () => {
    // pending1 is an active Employee with no workspace membership (role unresolved), like a
    // "+Employee" card whose invite was not accepted. It must take the single seat (createdOn
    // earliest), pushing the real member user1 to read-only.
    const members = [member('user1', AccountRole.User)] // pending1 not a member yet
    const employees: MockEmployee[] = [
      { personUuid: 'pending1', active: true, createdOn: 500 },
      { personUuid: 'user1', active: true, createdOn: 1000 }
    ]
    const mw = await createMw(1, members, employees)

    // pending1 holds the only seat -> user1 is seatless.
    await expectReadOnly(mw, makeSessionCtx('user1', AccountRole.User))
  })

  it('aibot/system account does not occupy a seat', async () => {
    // aibot is a User-role member but a system account: it must not take the single seat.
    const members = [member('aibot', AccountRole.User), member('user1', AccountRole.User)]
    // aibot created earliest -> would grab the seat if not excluded.
    const employees: MockEmployee[] = [
      { personUuid: 'aibot', active: true, createdOn: 500 },
      { personUuid: 'user1', active: true, createdOn: 1000 }
    ]
    const mw = await createMw(1, members, employees, new Set(['aibot' as AccountUuid]))

    await expectSeated(mw, makeSessionCtx('user1', AccountRole.User))
    // aibot writes regardless (system bypass), even though it holds no seat.
    await expectSeated(mw, makeSessionCtx('aibot', AccountRole.User))
  })

  it('kicked employee (inactive) frees a seat for the next by createdOn', async () => {
    const members = [member('user1', AccountRole.User), member('user2', AccountRole.User)]
    // user1 kicked (active=false) -> findAll({active:true}) returns only user2
    const employees: MockEmployee[] = [{ personUuid: 'user2', active: true, createdOn: 2000 }]
    const mw = await createMw(1, members, employees)

    await expectSeated(mw, makeSessionCtx('user2', AccountRole.User))
    await expectReadOnly(mw, makeSessionCtx('user1', AccountRole.User))
  })

  it('Guest bypasses seat logic (handled by GuestPermissions downstream)', async () => {
    const mw = await createMw(1, [member('owner1', AccountRole.Owner)], [])
    // Guests are not seat-enforced here; their write passes SeatLimits (GuestPermissions decides).
    await expectSeated(mw, makeSessionCtx('guest1', AccountRole.Guest))
  })

  it('Employee mixin tx sets seatSetDirty for next tx', async () => {
    const members = [member('owner1', AccountRole.Owner), member('user1', AccountRole.User)]
    const employees: MockEmployee[] = [{ personUuid: 'user1', active: true, createdOn: 1000 }]
    const mw = await createMw(2, members, employees)

    const employeeTx = [{ objectClass: contact.mixin.Employee }] as any
    const ctx = makeSessionCtx('user1', AccountRole.User)
    await mw.tx(ctx, employeeTx)
    expect((mw as any).seatSetDirty).toBe(true)
  })

  it('read-only enforcement does not mutate the account role', async () => {
    // usersLimit=1 filled by owner1's active employee -> user1 is seatless (all seats taken).
    const members = [member('owner1', AccountRole.Owner), member('user1', AccountRole.User)]
    const employees: MockEmployee[] = [{ personUuid: 'owner1', active: true, createdOn: 1000 }]
    const mw = await createMw(1, members, employees)
    const ctx = makeSessionCtx('user1', AccountRole.User)
    await expectReadOnly(mw, ctx)
    // Role must stay User — no ReadOnlyGuest spoof.
    expect(ctx.contextData.account.role).toBe(AccountRole.User)
  })

  it('a member writes while seats are still free (boot window, no active employee yet)', async () => {
    // usersLimit=5 but no active employee resolved yet -> a free seat is available, member writes.
    // Regression: free auto-provisioning set usersLimit>0 on fresh workspaces; the creator's first
    // writes happen before their Employee is active (seated:0), and must NOT be blocked.
    const mw = await createMw(5, [member('user1', AccountRole.User)], [])
    await expectSeated(mw, makeSessionCtx('user1', AccountRole.User))
  })

  it('a new member writes while only some of the seats are taken', async () => {
    // 5 seats, 2 active employees -> 3 free; a third member (not yet onboarded) still writes.
    const members = [
      member('owner1', AccountRole.Owner),
      member('user1', AccountRole.User),
      member('user2', AccountRole.User)
    ]
    const employees: MockEmployee[] = [
      { personUuid: 'owner1', active: true, createdOn: 1000 },
      { personUuid: 'user1', active: true, createdOn: 2000 }
    ]
    const mw = await createMw(5, members, employees)
    await expectSeated(mw, makeSessionCtx('user2', AccountRole.User))
  })

  it('the workspace creator can onboard (Employee tx) while seats are free', async () => {
    // Fresh free workspace: no active employee yet, owner creates their own Employee mixin.
    const mw = await createMw(5, [member('owner1', AccountRole.Owner)], [])
    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    await expect(mw.tx(ctx, [createEmployeeActivationTx()])).resolves.toBeDefined()
  })
})

// create-mixin Employee with active:true (the onboarding path).
function createEmployeeActivationTx (): any {
  return { _class: core.class.TxMixin, mixin: contact.mixin.Employee, attributes: { active: true } }
}

// Hard-block creating a new active employee past usersLimit. Counted by active Employee
// (minus system/AI). Existing over-limit employees after a downgrade are kept.
describe('SeatLimitsMiddleware - employee creation enforcement', () => {
  // create-mixin Employee with active:true (the UI "+Employee" path)
  function createEmployeeTx (): any {
    return { _class: core.class.TxMixin, mixin: contact.mixin.Employee, attributes: { active: true } }
  }
  // re-activation update (active:false -> true)
  function activateEmployeeTx (): any {
    return { _class: core.class.TxUpdateDoc, objectClass: contact.mixin.Employee, operations: { active: true } }
  }
  function applyWrap (...inner: any[]): any {
    return { _class: core.class.TxApplyIf, txes: inner }
  }

  it('rejects new employee when active count >= usersLimit', async () => {
    const members = [member('owner1', AccountRole.Owner)]
    const employees: MockEmployee[] = [{ personUuid: 'owner1', active: true, createdOn: 1000 }]
    const mw = await createMw(1, members, employees) // limit 1, already 1 active

    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    await expect(mw.tx(ctx, [createEmployeeTx()])).rejects.toThrow(PlatformError)
  })

  it('allows new employee when active count < usersLimit', async () => {
    const members = [member('owner1', AccountRole.Owner)]
    const employees: MockEmployee[] = [{ personUuid: 'owner1', active: true, createdOn: 1000 }]
    const mw = await createMw(3, members, employees) // limit 3, only 1 active

    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    await expect(mw.tx(ctx, [createEmployeeTx()])).resolves.not.toThrow()
  })

  it('rejects re-activation update past the limit', async () => {
    const members = [member('owner1', AccountRole.Owner)]
    const employees: MockEmployee[] = [{ personUuid: 'owner1', active: true, createdOn: 1000 }]
    const mw = await createMw(1, members, employees)

    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    await expect(mw.tx(ctx, [activateEmployeeTx()])).rejects.toThrow(PlatformError)
  })

  it('rejects apply-wrapped employee creation (UI batch path)', async () => {
    const members = [member('owner1', AccountRole.Owner)]
    const employees: MockEmployee[] = [{ personUuid: 'owner1', active: true, createdOn: 1000 }]
    const mw = await createMw(1, members, employees)

    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    await expect(mw.tx(ctx, [applyWrap(createEmployeeTx())])).rejects.toThrow(PlatformError)
  })

  it('system/AI active employees do not count toward the limit', async () => {
    const members = [member('owner1', AccountRole.Owner), member('aibot', AccountRole.User)]
    // 2 active employees, but aibot is system -> only 1 counts; limit 2 still has room.
    const employees: MockEmployee[] = [
      { personUuid: 'owner1', active: true, createdOn: 1000 },
      { personUuid: 'aibot', active: true, createdOn: 2000 }
    ]
    const mw = await createMw(2, members, employees, new Set(['aibot' as AccountUuid]))

    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    await expect(mw.tx(ctx, [createEmployeeTx()])).resolves.not.toThrow()
  })

  it('usersLimit=0 (unlimited): no creation block', async () => {
    const members = [member('owner1', AccountRole.Owner)]
    const employees: MockEmployee[] = [{ personUuid: 'owner1', active: true, createdOn: 1000 }]
    const mw = await createMw(0, members, employees)

    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    await expect(mw.tx(ctx, [createEmployeeTx()])).resolves.not.toThrow()
  })

  it('non-employee tx is not blocked at the limit', async () => {
    const members = [member('owner1', AccountRole.Owner)]
    const employees: MockEmployee[] = [{ personUuid: 'owner1', active: true, createdOn: 1000 }]
    const mw = await createMw(1, members, employees)

    const ctx = makeSessionCtx('owner1', AccountRole.Owner)
    const someTx = { _class: core.class.TxCreateDoc, objectClass: contact.class.Person } as any
    await expect(mw.tx(ctx, [someTx])).resolves.not.toThrow()
  })
})
