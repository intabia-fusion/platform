/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
*/

// Heartbeat proxy: sender's no-op TxUpdateDoc on invite-request must produce
// a touch TxUpdateDoc for every linked invite-response so the TransientTTL
// gets refreshed on both sides.

import core, {
  type Class,
  type Doc,
  generateId,
  type MeasureContext,
  type PersonId,
  type Ref,
  type Space,
  toFindResult,
  TxFactory,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import contact, { type Person } from '@hcengineering/contact'
import love, { type UserMeetingInvite } from '@hcengineering/love'
import { OnUserMeetingInvite } from '../index'

jest.mock('@hcengineering/server-contact', () => ({
  getAccountBySocialId: jest.fn(async () => null),
  getSocialStrings: jest.fn(async () => [])
}))

const callerPersonRef = 'person:caller' as Ref<Person>
const recipientPersonRef = 'person:recipient' as Ref<Person>
const callerSpace = 'space:caller' as Ref<Space>
const recipientSpace = 'space:recipient' as Ref<Space>

function createInvite (
  overrides: Partial<UserMeetingInvite> & { _id: Ref<UserMeetingInvite>, kind: 'invite-request' | 'invite-response' }
): UserMeetingInvite {
  return {
    _class: love.class.UserMeetingInvite,
    from: callerPersonRef,
    to: recipientPersonRef,
    status: 'pending',
    modifiedOn: Date.now(),
    modifiedBy: core.account.System,
    space: core.space.Space,
    ...overrides
  } as unknown as UserMeetingInvite
}

function createControl (invites: UserMeetingInvite[]): TriggerControl {
  return {
    ctx: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      newChild: jest.fn().mockReturnThis(),
      contextData: { broadcast: { targets: {} } }
    } as unknown as MeasureContext,
    workspace: { url: 'test-ws', uuid: 'test-ws-uuid', dataId: 'test-data', accountsUrl: '' } as any,
    branding: null,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>, query: any) => {
      let inv: UserMeetingInvite[] = invites
      if (_class !== love.class.UserMeetingInvite) return toFindResult([])
      if (query?.kind !== undefined) inv = inv.filter((it) => it.kind === query.kind)
      if (query?.from !== undefined) inv = inv.filter((it) => it.from === query.from)
      if (query?.to !== undefined) inv = inv.filter((it) => it.to === query.to)
      if (query?.meeting !== undefined) inv = inv.filter((it) => it.meeting === query.meeting)
      if (query?.room !== undefined) inv = inv.filter((it) => it.room === query.room)
      if (query?._id !== undefined) inv = inv.filter((it) => it._id === query._id)
      return toFindResult(inv as Doc[])
    }),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: { isDerived: () => false, hasMixin: () => false, as: (d: Doc) => d } as any,
    modelDb: {} as any,
    removedMap: new Map(),
    userStatusMap: new Map(),
    cache: new Map(),
    contextCache: new Map(),
    withScope: async <T>(_s: string, fn: () => Promise<T>) => await fn(),
    txes: [],
    apply: jest.fn().mockResolvedValue({}),
    queryFind: jest.fn().mockResolvedValue([]),
    storageAdapter: {} as any,
    serviceAdaptersManager: {} as any,
    lowLevel: {} as any,
    domainRequest: jest.fn().mockResolvedValue({})
  } as unknown as TriggerControl
}

function buildHeartbeatTx (req: UserMeetingInvite): TxUpdateDoc<UserMeetingInvite> {
  return {
    _id: generateId(),
    _class: core.class.TxUpdateDoc,
    space: core.space.DerivedTx,
    objectId: req._id,
    objectClass: love.class.UserMeetingInvite,
    objectSpace: req.space,
    operations: { modifiedOn: Date.now() } as any,
    modifiedOn: Date.now(),
    modifiedBy: 'caller-social-id' as PersonId,
    createdBy: 'caller-social-id' as PersonId,
    retrieve: false
  } satisfies TxUpdateDoc<UserMeetingInvite>
}

describe('OnUserMeetingInvite - heartbeat proxy', () => {
  it('TxUpdateDoc on invite-request emits a TTL-touch update for each invite-response', async () => {
    const meeting = 'meeting:1' as UserMeetingInvite['meeting']
    const req = createInvite({
      _id: 'invite:req' as Ref<UserMeetingInvite>,
      kind: 'invite-request',
      meeting,
      space: callerSpace
    })
    const resp = createInvite({
      _id: 'invite:resp' as Ref<UserMeetingInvite>,
      kind: 'invite-response',
      meeting,
      space: recipientSpace
    })

    const control = createControl([req, resp])
    const tx = buildHeartbeatTx(req)
    const result = await OnUserMeetingInvite([tx], control)

    const touches = result.filter(
      (t) => t._class === core.class.TxUpdateDoc && (t as TxUpdateDoc<UserMeetingInvite>).objectId === resp._id
    )
    expect(touches.length).toBe(1)
  })

  it('TxUpdateDoc on invite-request with no responses does nothing', async () => {
    const req = createInvite({
      _id: 'invite:req-orphan' as Ref<UserMeetingInvite>,
      kind: 'invite-request',
      meeting: 'meeting:orphan' as UserMeetingInvite['meeting'],
      space: callerSpace
    })
    const control = createControl([req])
    const result = await OnUserMeetingInvite([buildHeartbeatTx(req)], control)
    const responseTouches = result.filter(
      (t) =>
        t._class === core.class.TxUpdateDoc &&
        (t as TxUpdateDoc<UserMeetingInvite>).objectClass === love.class.UserMeetingInvite
    )
    expect(responseTouches.length).toBe(0)
  })
})

// Silence unused import warnings — `contact` is still required by the trigger.
void contact
