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
  type Class,
  type Doc,
  MeasureMetricsContext,
  type PersonUuid,
  type Ref,
  type Tx,
  type TxCUD,
  type WorkspaceMemberInfo,
  type WorkspaceUuid
} from '@hcengineering/core'
import {
  type LimitsProvider,
  type Middleware,
  type PipelineContext,
  type PlanLimits,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import { SeatLimitsMiddleware } from '../seatLimits'
import { EnsureEmployeeMiddleware } from '../ensureEmployee'
import { LIMITS_PROVIDER_VAR, MEMBERS_VERSION_KEY, PLAN_LIMITS_VAR } from '../planLimits'
import { ensureEmployee, ensureEmployeeDomain } from '@hcengineering/contact'

jest.mock('@hcengineering/contact', () => ({
  __esModule: true,
  default: {
    class: { Person: 'person', PersonSpace: 'person-space' },
    mixin: { Employee: 'employee' },
    space: { Contacts: 'contacts' }
  },
  get ensureEmployeeDomain () {
    return jest.requireActual('@hcengineering/contact').ensureEmployeeDomain
  },
  ensureEmployee: jest.fn()
}))

const WS = 'ws1' as WorkspaceUuid
const uuid = (n: string): AccountUuid => n as unknown as AccountUuid

function member (person: string, role: AccountRole): WorkspaceMemberInfo {
  return { person: uuid(person), role }
}

// A non-message write tx: not whitelisted, so a seatless member is rejected on it.
const WRITE_TX = {
  _id: 'write-tx',
  _class: core.class.TxUpdateDoc,
  space: core.space.Tx,
  objectClass: core.class.Space,
  objectId: 'x'
} as unknown as TxCUD<Doc>

function makeContext (
  members: WorkspaceMemberInfo[],
  usersLimit: number,
  systemAccounts: AccountUuid[] = [],
  integrationAccounts: AccountUuid[] = []
): { context: PipelineContext, provider: LimitsProvider } {
  const provider: LimitsProvider = {
    getPerson: async (account) => ({ uuid: account as unknown as PersonUuid, firstName: 'Owner', lastName: 'Test' }),
    getPlanLimits: async () => ({ usersLimit }) as unknown as PlanLimits,
    getWorkspaceMembers: async () => members,
    getSystemAccounts: async () => new Set(systemAccounts),
    getIntegrationAccounts: async () => new Set(integrationAccounts),
    getReadOnlyAllowedClasses: () => new Set<Ref<Class<Doc>>>()
  }
  const context = {
    workspace: { uuid: WS },
    hierarchy: { isDerived: () => false },
    contextVars: {
      [LIMITS_PROVIDER_VAR]: provider,
      [PLAN_LIMITS_VAR]: { usersLimit, storageLimitGB: 0, tokenLimit: 0, transcriptLimit: 0 },
      [MEMBERS_VERSION_KEY]: new Map<WorkspaceUuid, number>()
    }
  } as unknown as PipelineContext
  return { context, provider }
}

// next-middleware: records that the write passed enforcement.
function makeNext (): { next: Middleware, passed: () => boolean } {
  let didPass = false
  const next = {
    tx: async (): Promise<TxMiddlewareResult> => {
      didPass = true
      return {}
    },
    domainRequest: async (_ctx: unknown, domain: string) => ({ domain, value: 'next' })
  } as unknown as Middleware
  return { next, passed: () => didPass }
}

async function createSeat (
  ctx: MeasureMetricsContext,
  context: PipelineContext,
  next: Middleware
): Promise<SeatLimitsMiddleware> {
  const employee = await EnsureEmployeeMiddleware.create(ctx, context, next)
  return await SeatLimitsMiddleware.create(ctx, context, employee)
}

async function runTx (
  mw: SeatLimitsMiddleware,
  account: { uuid: AccountUuid, role: AccountRole },
  txes: Tx[] = [WRITE_TX],
  contextData: object = {}
): Promise<{ rejected: boolean }> {
  const ctx = new MeasureMetricsContext('test', {})
  ;(ctx as any).contextData = { account: { ...account, fullSocialIds: [] }, ...contextData }
  try {
    await mw.tx(ctx as any, txes)
    return { rejected: false }
  } catch {
    return { rejected: true }
  }
}

describe('SeatLimitsMiddleware', () => {
  const ctx = new MeasureMetricsContext('test', {})

  it('runs only the server bootstrap with the seatless account and rejects its ordinary writes', async () => {
    const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
    const { context } = makeContext(members, 1)
    const { next } = makeNext()
    const mw = await createSeat(ctx, context, next)
    const request = new MeasureMetricsContext('bootstrap', {})
    const account = { uuid: uuid('u1'), role: AccountRole.User, fullSocialIds: [] }
    ;(request as any).contextData = { account }
    const head: Partial<Middleware> = {
      tx: async (txCtx, txes) => {
        const sibling = request.newChild('ordinary', {}) as typeof txCtx
        await Promise.all([
          expect(mw.tx(request as any, txes)).rejects.toThrow(),
          expect(mw.tx(sibling, txes)).rejects.toThrow()
        ])
        expect(txCtx.contextData).toBe(request.contextData)
        return await mw.tx(txCtx, structuredClone(txes))
      },
      findAll: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ _id: 'employee' }])
        .mockResolvedValueOnce([{ _id: 'space' }])
    }
    context.head = head as Middleware
    ;(ensureEmployee as jest.Mock).mockImplementationOnce(async (_ctx, received, client) => {
      expect(received).toBe(account)
      await client.tx(WRITE_TX)
      return 'employee'
    })

    const result = await mw.domainRequest(request as any, ensureEmployeeDomain, {
      account: 'owner',
      tx: WRITE_TX
    })
    expect(result.value).toEqual({ employee: 'employee', personSpace: 'space' })
    await expect(mw.tx(request as any, [WRITE_TX])).rejects.toThrow()
  })

  it('does not bootstrap an unknown account', async () => {
    const { context } = makeContext([member('owner', AccountRole.Owner)], 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    const request = new MeasureMetricsContext('bootstrap', {})
    ;(request as any).contextData = { account: { uuid: uuid('u1'), role: AccountRole.User, fullSocialIds: [] } }
    const tx = jest.fn(async (txCtx, txes) => await mw.tx(txCtx, txes))
    context.head = { findAll: jest.fn().mockResolvedValueOnce([{ _id: 'space' }]), tx } as unknown as Middleware
    ;(ensureEmployee as jest.Mock).mockImplementationOnce(async (_ctx, _account, client) => {
      await expect(client.tx(WRITE_TX)).rejects.toThrow()
      return 'person'
    })
    expect((await mw.domainRequest(request as any, ensureEmployeeDomain, {})).value).toEqual({
      employee: 'person',
      personSpace: 'space'
    })
  })

  it('keeps read-only sessions from writing through the domain operation', async () => {
    const { context } = makeContext([member('owner', AccountRole.Owner)], 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    const request = new MeasureMetricsContext('readonly', {})
    ;(request as any).contextData = {
      account: { uuid: uuid('owner'), role: AccountRole.Owner, fullSocialIds: [] },
      readOnly: true
    }
    const tx = jest.fn()
    context.head = { findAll: jest.fn().mockResolvedValueOnce([{ _id: 'space' }]), tx } as unknown as Middleware
    ;(ensureEmployee as jest.Mock).mockImplementationOnce(async (_ctx, _account, client) => {
      await expect(client.tx(WRITE_TX)).rejects.toThrow()
      return 'person'
    })
    expect((await mw.domainRequest(request as any, ensureEmployeeDomain, {})).value).toEqual({
      employee: 'person',
      personSpace: 'space'
    })
    expect(tx).not.toHaveBeenCalled()
  })

  it('returns an existing employee and space without a limits provider', async () => {
    const { context } = makeContext([], 0)
    context.contextVars[LIMITS_PROVIDER_VAR] = undefined
    const mw = await createSeat(ctx, context, makeNext().next)
    const request = new MeasureMetricsContext('existing', {})
    ;(request as any).contextData = { account: { uuid: uuid('u1'), role: AccountRole.User, fullSocialIds: [] } }
    context.head = { findAll: jest.fn().mockResolvedValueOnce([{ _id: 'space' }]) } as unknown as Middleware
    ;(ensureEmployee as jest.Mock).mockImplementationOnce(async (_ctx, _account, _client, _ids, getPerson) => {
      expect(await getPerson()).toBeUndefined()
      return 'person'
    })
    expect((await mw.domainRequest(request as any, ensureEmployeeDomain, {})).value).toEqual({
      employee: 'person',
      personSpace: 'space'
    })
  })

  it('synchronizes an existing profile for a member with a seat', async () => {
    const { context, provider } = makeContext([member('u1', AccountRole.User)], 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    const request = new MeasureMetricsContext('seated', {})
    ;(request as any).contextData = { account: { uuid: uuid('u1'), role: AccountRole.User, fullSocialIds: [] } }
    const head: Partial<Middleware> = {
      findAll: jest.fn().mockResolvedValue([{ _id: 'space' }]),
      tx: async (txCtx, txes) => await mw.tx(txCtx, txes)
    }
    context.head = head as Middleware
    const getPerson = jest.spyOn(provider, 'getPerson')
    ;(ensureEmployee as jest.Mock).mockImplementationOnce(async (_ctx, _account, client, _ids, getGlobalPerson) => {
      await getGlobalPerson()
      await client.tx(WRITE_TX)
      return 'person'
    })
    expect((await mw.domainRequest(request as any, ensureEmployeeDomain, {})).value).toEqual({
      employee: 'person',
      personSpace: 'space'
    })
    expect(getPerson).toHaveBeenCalledTimes(1)
  })

  it('returns a complete seatless profile without synchronizing it', async () => {
    const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
    const { context, provider } = makeContext(members, 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    const request = new MeasureMetricsContext('bootstrap', {})
    ;(request as any).contextData = { account: { uuid: uuid('u1'), role: AccountRole.User, fullSocialIds: [] } }
    const findAll = jest
      .fn()
      .mockResolvedValueOnce([{ _id: 'person' }])
      .mockResolvedValueOnce([{ _id: 'space' }])
    const getPerson = jest.spyOn(provider, 'getPerson')
    context.head = { findAll } as unknown as Middleware
    ;(ensureEmployee as jest.Mock).mockClear()
    const result = await mw.domainRequest(request as any, ensureEmployeeDomain, {})
    expect(result.value).toEqual({ employee: 'person', personSpace: 'space' })
    expect(findAll).toHaveBeenCalledTimes(2)
    expect(getPerson).not.toHaveBeenCalled()
    expect(ensureEmployee).not.toHaveBeenCalled()
  })

  it('restarts the employee trigger when an active employee has no person space', async () => {
    const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
    const { context } = makeContext(members, 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    const request = new MeasureMetricsContext('bootstrap', {})
    ;(request as any).contextData = {
      account: { uuid: uuid('u1'), role: AccountRole.User, primarySocialId: 'sid', fullSocialIds: [] }
    }
    const findAll = jest
      .fn()
      .mockResolvedValueOnce([{ _id: 'person' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: 'person' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: 'space' }])
    const tx = jest.fn(async (txCtx, txes) => await mw.tx(txCtx, txes))
    const head: Partial<Middleware> = { findAll, tx }
    context.head = head as Middleware
    ;(ensureEmployee as jest.Mock).mockResolvedValueOnce('person')
    const result = await mw.domainRequest(request as any, ensureEmployeeDomain, {})
    expect(result.value).toEqual({ employee: 'person', personSpace: 'space' })
    expect(tx).toHaveBeenCalledTimes(1)
    expect(tx.mock.calls[0][1][0]._class).toBe(core.class.TxApplyIf)
  })

  it('rejects an incomplete employee before attempting to restore its space', async () => {
    const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
    const { context } = makeContext(members, 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    const request = new MeasureMetricsContext('bootstrap', {})
    ;(request as any).contextData = { account: { uuid: uuid('u1'), role: AccountRole.User, fullSocialIds: [] } }
    const tx = jest.fn()
    context.head = { findAll: jest.fn().mockResolvedValue([]), tx } as unknown as Middleware
    ;(ensureEmployee as jest.Mock).mockResolvedValueOnce('person')
    await expect(mw.domainRequest(request as any, ensureEmployeeDomain, {})).rejects.toThrow(
      'Employee bootstrap failed'
    )
    expect(tx).not.toHaveBeenCalled()
    expect(ensureEmployee).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { throwOnForbidden: true }
    )
  })

  it('passes a seated member and rejects the overflow member (read-only)', async () => {
    const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User), member('u2', AccountRole.User)]
    const { context } = makeContext(members, 2)
    const { next } = makeNext()
    const mw = await createSeat(ctx, context, next)

    // owner + u1 take the 2 seats; u2 is seatless -> read-only reject on a non-message write.
    expect((await runTx(mw, { uuid: uuid('owner'), role: AccountRole.Owner })).rejected).toBe(false)
    expect((await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User })).rejected).toBe(false)
    expect((await runTx(mw, { uuid: uuid('u2'), role: AccountRole.User })).rejected).toBe(true)
  })

  it('keeps existing seats when an overflow member sorts before them', async () => {
    const members = [
      member('owner', AccountRole.Owner),
      member('z-user', AccountRole.User),
      { ...member('a-new', AccountRole.User), seatOrder: 1 }
    ]
    const { context } = makeContext(members, 2)
    const mw = await createSeat(ctx, context, makeNext().next)
    expect((await runTx(mw, { uuid: uuid('z-user'), role: AccountRole.User })).rejected).toBe(false)
    expect((await runTx(mw, { uuid: uuid('a-new'), role: AccountRole.User })).rejected).toBe(true)
  })

  it('keeps the first overflow member seated when a later UUID sorts earlier', async () => {
    const members = [member('owner', AccountRole.Owner), { ...member('z-first', AccountRole.User), seatOrder: 1 }]
    const { context } = makeContext(members, 2)
    const mw = await createSeat(ctx, context, makeNext().next)
    expect((await runTx(mw, { uuid: uuid('z-first'), role: AccountRole.User })).rejected).toBe(false)
    members.push({ ...member('a-second', AccountRole.User), seatOrder: 2 })
    ;(context.contextVars[MEMBERS_VERSION_KEY] as Map<WorkspaceUuid, number>).set(WS, 1)
    expect((await runTx(mw, { uuid: uuid('z-first'), role: AccountRole.User })).rejected).toBe(false)
    expect((await runTx(mw, { uuid: uuid('a-second'), role: AccountRole.User })).rejected).toBe(true)
  })

  it('uses UUID order when overflow members have the same seat order', async () => {
    for (const names of [
      ['a', 'z'],
      ['z', 'a']
    ]) {
      const members = [
        member('owner', AccountRole.Owner),
        ...names.map((name) => ({ ...member(name, AccountRole.User), seatOrder: 1 }))
      ]
      const { context } = makeContext(members, 2)
      const mw = await createSeat(ctx, context, makeNext().next)
      expect((await runTx(mw, { uuid: uuid('a'), role: AccountRole.User })).rejected).toBe(false)
      expect((await runTx(mw, { uuid: uuid('z'), role: AccountRole.User })).rejected).toBe(true)
    }
  })

  it('keeps a seatless member read-only when the tx claims DerivedTx', async () => {
    const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
    const { context } = makeContext(members, 1)
    const { next, passed } = makeNext()
    const mw = await createSeat(ctx, context, next)

    const derivedTx = { ...WRITE_TX, space: core.space.DerivedTx } as unknown as Tx
    expect((await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User }, [derivedTx])).rejected).toBe(true)
    expect(passed()).toBe(false)
  })

  it('passes a seatless member tx inside the trigger context', async () => {
    const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
    const { context } = makeContext(members, 1)
    const { next } = makeNext()
    const mw = await createSeat(ctx, context, next)

    const u1 = { uuid: uuid('u1'), role: AccountRole.User }
    expect((await runTx(mw, u1, [WRITE_TX], { isTriggerCtx: true })).rejected).toBe(false)
  })

  it('excludes aiBot (system account) from the seat count', async () => {
    // limit 1, but aiBot holds a User role in ws_members; it must not eat the single seat.
    const members = [member('u1', AccountRole.User), member('aibot', AccountRole.User)]
    const { context } = makeContext(members, 1, [uuid('aibot')])
    const mw = await createSeat(ctx, context, makeNext().next)

    expect((await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User })).rejected).toBe(false)
  })

  it('excludes an API-key integration account from the seat count', async () => {
    // limit 1: apikey holds a User role but is not seat-eligible, so only real users compete for it.
    const members = [member('apikey', AccountRole.User), member('u1', AccountRole.User), member('u2', AccountRole.User)]
    const { context } = makeContext(members, 1, [], [uuid('apikey')])
    const mw = await createSeat(ctx, context, makeNext().next)

    // apikey never eats the seat, and does not block u1 from getting it.
    expect((await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User })).rejected).toBe(false)
    // u2 is a normal member beyond the limit - unlike apikey, it does compete for the same seat.
    expect((await runTx(mw, { uuid: uuid('u2'), role: AccountRole.User })).rejected).toBe(true)
  })

  it('lets an API-key integration account write even with every seat taken', async () => {
    // Taking no seat must not mean read-only: apikey is never in seatSet, yet its writes go through.
    const members = [member('u1', AccountRole.User), member('apikey', AccountRole.User)]
    const { context } = makeContext(members, 1, [], [uuid('apikey')])
    const mw = await createSeat(ctx, context, makeNext().next)

    expect((await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User })).rejected).toBe(false)
    expect((await runTx(mw, { uuid: uuid('apikey'), role: AccountRole.User })).rejected).toBe(false)
  })

  it('does not count Admin or guest roles toward seats', async () => {
    // Only u1 is seat-eligible; admin/guest ride free even at limit 1.
    const members = [
      member('admin', AccountRole.Admin),
      member('guest', AccountRole.Guest),
      member('u1', AccountRole.User)
    ]
    const { context } = makeContext(members, 1)
    const mw = await createSeat(ctx, context, makeNext().next)

    expect((await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User })).rejected).toBe(false)
    // A guest is always let through regardless of seat pressure.
    expect((await runTx(mw, { uuid: uuid('guest'), role: AccountRole.Guest })).rejected).toBe(false)
  })

  it('assigns seats by role priority: Owner keeps a seat over a User at the boundary', async () => {
    // limit 1, uuids sorted so a plain User would win by uuid — role priority must put Owner first.
    const members = [member('aaa', AccountRole.User), member('zzz', AccountRole.Owner)]
    const { context } = makeContext(members, 1)
    const mw = await createSeat(ctx, context, makeNext().next)

    expect((await runTx(mw, { uuid: uuid('zzz'), role: AccountRole.Owner })).rejected).toBe(false)
    expect((await runTx(mw, { uuid: uuid('aaa'), role: AccountRole.User })).rejected).toBe(true)
  })

  it('rebuilds the seat set when the host bumps members-version', async () => {
    // Start: u1 seated, u2 overflow. After u1 leaves and version bumps, u2 gets the seat.
    let members = [member('u1', AccountRole.User), member('u2', AccountRole.User)]
    const { context, provider } = makeContext(members, 1)
    ;(provider as any).getWorkspaceMembers = async () => members
    const mw = await createSeat(ctx, context, makeNext().next)

    expect((await runTx(mw, { uuid: uuid('u2'), role: AccountRole.User })).rejected).toBe(true)

    members = [member('u2', AccountRole.User)]
    const versions = context.contextVars[MEMBERS_VERSION_KEY] as Map<WorkspaceUuid, number>
    versions.set(WS, 1)

    expect((await runTx(mw, { uuid: uuid('u2'), role: AccountRole.User })).rejected).toBe(false)
  })

  it('keeps the latest membership when a version changes during a rebuild', async () => {
    const oldMembers = [member('owner', AccountRole.Owner), member('old', AccountRole.User)]
    const newMembers = [member('owner', AccountRole.Owner), member('new', AccountRole.User)]
    const { context, provider } = makeContext(oldMembers, 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    const owner = { uuid: uuid('owner'), role: AccountRole.Owner }
    await runTx(mw, owner)

    let releaseOld!: (members: WorkspaceMemberInfo[]) => void
    let startedOld!: () => void
    const oldStarted = new Promise<void>((resolve) => {
      startedOld = resolve
    })
    const oldResponse = new Promise<WorkspaceMemberInfo[]>((resolve) => {
      releaseOld = resolve
    })
    const fetch = jest
      .spyOn(provider, 'getWorkspaceMembers')
      .mockImplementationOnce(async () => {
        startedOld()
        return await oldResponse
      })
      .mockResolvedValue(newMembers)
    const versions = context.contextVars[MEMBERS_VERSION_KEY] as Map<WorkspaceUuid, number>
    versions.set(WS, 1)
    const first = runTx(mw, owner)
    await oldStarted
    versions.set(WS, 2)
    let secondFinished = false
    const second = runTx(mw, owner)
    void second.then(() => {
      secondFinished = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(secondFinished).toBe(false)
    releaseOld(oldMembers)
    await Promise.all([first, second])
    expect((mw as any).knownMembers.has(uuid('new'))).toBe(true)
    expect((mw as any).knownMembers.has(uuid('old'))).toBe(false)

    const request = new MeasureMetricsContext('bootstrap', {})
    ;(request as any).contextData = {
      account: { uuid: uuid('new'), role: AccountRole.User, primarySocialId: 'sid', fullSocialIds: [] }
    }
    const head: Partial<Middleware> = {
      findAll: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ _id: 'person' }])
        .mockResolvedValueOnce([{ _id: 'space' }]),
      tx: async (txCtx, txes) => await mw.tx(txCtx, txes)
    }
    context.head = head as Middleware
    ;(ensureEmployee as jest.Mock).mockImplementationOnce(async (_ctx, _account, client) => {
      await client.tx(WRITE_TX)
      return 'person'
    })
    expect((await mw.domainRequest(request as any, ensureEmployeeDomain, {})).value).toEqual({
      employee: 'person',
      personSpace: 'space'
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not publish discarded membership when the next rebuild fails', async () => {
    const members = [member('owner', AccountRole.Owner), member('new', AccountRole.User)]
    const { context, provider } = makeContext(members, 1)
    const mw = await createSeat(ctx, context, makeNext().next)
    await runTx(mw, { uuid: uuid('owner'), role: AccountRole.Owner })
    const versions = context.contextVars[MEMBERS_VERSION_KEY] as Map<WorkspaceUuid, number>
    versions.set(WS, 1)
    jest
      .spyOn(provider, 'getWorkspaceMembers')
      .mockResolvedValueOnce(members)
      .mockRejectedValue(new Error('account service down'))
    jest.spyOn(provider, 'getIntegrationAccounts').mockImplementationOnce(async () => {
      versions.set(WS, 2)
      return new Set([uuid('new')])
    })
    await runTx(mw, { uuid: uuid('owner'), role: AccountRole.Owner })
    expect((mw as any).integrationAccounts.has(uuid('new'))).toBe(false)
    expect((mw as any).membersVersion).toBe(0)
  })

  it('seats a member who joined before the members-version bump arrived', async () => {
    let members = [member('owner', AccountRole.Owner)]
    const { context, provider } = makeContext(members, 2)
    ;(provider as any).getWorkspaceMembers = async () => members
    const mw = await createSeat(ctx, context, makeNext().next)
    expect((await runTx(mw, { uuid: uuid('owner'), role: AccountRole.Owner })).rejected).toBe(false)

    // Joined in the account service; no version bump yet.
    members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
    expect((await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User })).rejected).toBe(false)
  })

  it('rebuilds once per members-version for a non-member, not on every tx', async () => {
    const { context, provider } = makeContext([member('owner', AccountRole.Owner)], 2)
    const fetch = jest.spyOn(provider, 'getWorkspaceMembers')
    const mw = await createSeat(ctx, context, makeNext().next)
    const stranger = { uuid: uuid('stranger'), role: AccountRole.User }
    expect((await runTx(mw, stranger)).rejected).toBe(true)
    const afterFirst = fetch.mock.calls.length

    expect((await runTx(mw, stranger)).rejected).toBe(true)
    expect((await runTx(mw, stranger)).rejected).toBe(true)
    expect(fetch.mock.calls.length).toBe(afterFirst)

    // A bump may bring it in: allowed to look again.
    ;(context.contextVars[MEMBERS_VERSION_KEY] as Map<WorkspaceUuid, number>).set(WS, 1)
    await runTx(mw, stranger)
    expect(fetch.mock.calls.length).toBeGreaterThan(afterFirst)
  })

  it('keeps the read-only path when the rebuild for an unknown member fails', async () => {
    const { context, provider } = makeContext([member('owner', AccountRole.Owner)], 2)
    const mw = await createSeat(ctx, context, makeNext().next)
    expect((await runTx(mw, { uuid: uuid('owner'), role: AccountRole.Owner })).rejected).toBe(false)
    ;(provider as any).getWorkspaceMembers = async () => {
      throw new Error('account service down')
    }
    // A trigger-derived tx passes read-only enforcement: rejected here means the rebuild error leaked.
    const res = await runTx(mw, { uuid: uuid('u1'), role: AccountRole.User }, [WRITE_TX], { isTriggerCtx: true })
    expect(res.rejected).toBe(false)
  })

  describe('domain request', () => {
    const request = async (
      mw: SeatLimitsMiddleware,
      account: { uuid: AccountUuid, role: AccountRole }
    ): Promise<{ seatReadOnly: boolean | undefined, value: unknown }> => {
      const data: any = { account: { ...account, fullSocialIds: [] } }
      const c = new MeasureMetricsContext('test', {})
      ;(c as any).contextData = data
      const res = await mw.domainRequest(c as any, 'd' as any, {})
      return { seatReadOnly: data.seatReadOnly, value: res.value }
    }

    it('flags a seatless caller and still passes the request on', async () => {
      const members = [member('owner', AccountRole.Owner), member('u1', AccountRole.User)]
      const { context } = makeContext(members, 1)
      const mw = await createSeat(ctx, context, makeNext().next)

      expect(await request(mw, { uuid: uuid('u1'), role: AccountRole.User })).toEqual({
        seatReadOnly: true,
        value: 'next'
      })
    })

    it('leaves a seated member, a guest and an integration account unflagged', async () => {
      const members = [
        member('owner', AccountRole.Owner),
        member('guest', AccountRole.Guest),
        member('apikey', AccountRole.User),
        member('u1', AccountRole.User)
      ]
      const { context } = makeContext(members, 1, [], [uuid('apikey')])
      const mw = await createSeat(ctx, context, makeNext().next)

      expect((await request(mw, { uuid: uuid('owner'), role: AccountRole.Owner })).seatReadOnly).toBeUndefined()
      expect((await request(mw, { uuid: uuid('guest'), role: AccountRole.Guest })).seatReadOnly).toBeUndefined()
      expect((await request(mw, { uuid: uuid('apikey'), role: AccountRole.User })).seatReadOnly).toBeUndefined()
      expect((await request(mw, { uuid: uuid('u1'), role: AccountRole.User })).seatReadOnly).toBe(true)
    })
  })
})
