/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

// The call push of an invite: the notification carries the call, and a response gone by
// cancel, accept or decline stops the ringing on the receiver's phones.

import core, {
  type AccountUuid,
  type Class,
  type Doc,
  generateId,
  type MeasureContext,
  type PersonId,
  type Ref,
  type Space,
  toFindResult,
  type Tx,
  TxFactory,
  type TxCreateDoc,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import { QueueTopic, type TriggerControl } from '@hcengineering/server-core'
import contact, { type Person, type PersonSpace } from '@hcengineering/contact'
import love, { type UserMeetingInvite } from '@hcengineering/love'
import notification, { type CreateNotificationAction, type PushSubscription } from '@hcengineering/notification'
import { OnUserMeetingInvite } from '../index'

jest.mock('@hcengineering/server-contact', () => ({
  getAccountBySocialId: jest.fn(async () => null),
  getSocialStrings: jest.fn(async () => [])
}))

const caller = 'person:caller' as Ref<Person>
const recipient = 'person:recipient' as Ref<Person>
const recipientAccount = 'account:recipient' as AccountUuid
const recipientSpace = 'space:recipient' as Ref<Space>

const persons = [
  { _id: caller, _class: contact.class.Person, name: 'Ann,Caller', personUuid: 'account:caller' },
  { _id: recipient, _class: contact.class.Person, name: 'Bob,Recipient', personUuid: recipientAccount }
] as unknown as Person[]

const subscriptions = [
  { _id: 'sub-web', user: recipientAccount, endpoint: 'https://push.example.com/x' },
  { _id: 'sub-fcm', user: recipientAccount, endpoint: 'fcm://token' },
  { _id: 'sub-other', user: 'account:other', endpoint: 'fcm://other' }
] as unknown as PushSubscription[]

function invite (_id: string, kind: UserMeetingInvite['kind'], space: Ref<Space>): UserMeetingInvite {
  return {
    _id: _id as Ref<UserMeetingInvite>,
    _class: love.class.UserMeetingInvite,
    space,
    kind,
    from: caller,
    to: recipient,
    status: 'pending',
    modifiedOn: 0,
    modifiedBy: core.account.System
  } as unknown as UserMeetingInvite
}

const matches = (value: any, cond: any): boolean =>
  cond?.$in !== undefined ? cond.$in.includes(value) : value === cond

function createControl (
  invites: UserMeetingInvite[],
  removed: UserMeetingInvite[] = []
): {
    control: TriggerControl
    send: jest.Mock
  } {
  const send = jest.fn().mockResolvedValue(undefined)
  const all: Record<string, Doc[]> = {
    [love.class.UserMeetingInvite]: invites,
    [contact.class.Person]: persons,
    [contact.mixin.Employee]: persons.map((it) => ({ ...it, active: true })),
    [contact.class.PersonSpace]: [{ _id: recipientSpace, person: recipient } as unknown as PersonSpace],
    [notification.class.PushSubscription]: subscriptions
  }
  const control = {
    ctx: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } as unknown as MeasureContext,
    workspace: { url: 'test-ws', uuid: 'test-ws-uuid' } as any,
    branding: null,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>, query: any) =>
      toFindResult(
        (all[_class] ?? []).filter((doc: any) =>
          Object.entries(query ?? {}).every(([key, cond]) => key === 'active' || matches(doc[key], cond))
        )
      )
    ),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: { isDerived: () => false, hasMixin: () => false, as: (d: Doc) => d } as any,
    removedMap: new Map(removed.map((it) => [it._id, it])),
    queue: { getProducer: jest.fn(() => ({ send })) }
  } as unknown as TriggerControl
  return { control, send }
}

const txBase = {
  _id: generateId(),
  space: core.space.Tx,
  objectClass: love.class.UserMeetingInvite,
  modifiedOn: 100_000,
  modifiedBy: 'social:someone' as PersonId
}

describe('OnUserMeetingInvite - call push', () => {
  it('puts the call on the notification: the response to answer, the caller, the end of the ringing', async () => {
    const { control } = createControl([])
    const request = invite('invite:req', 'invite-request', 'space:caller' as Ref<Space>)
    const tx = {
      ...txBase,
      _class: core.class.TxCreateDoc,
      objectId: request._id,
      objectSpace: request.space,
      attributes: { kind: 'invite-request', from: caller, to: recipient, status: 'pending' }
    } as unknown as TxCreateDoc<UserMeetingInvite>

    const result = await OnUserMeetingInvite([tx], control)

    const response = result.find(
      (it: Tx) => (it as TxCreateDoc<Doc>).objectClass === love.class.UserMeetingInvite
    ) as TxCreateDoc<UserMeetingInvite>
    const action = result.find(
      (it: Tx) => (it as TxCreateDoc<Doc>).objectClass === notification.class.CreateNotificationAction
    ) as TxCreateDoc<CreateNotificationAction>
    expect(action.attributes.call).toEqual({
      inviteId: response.objectId,
      meetingId: undefined,
      roomId: undefined,
      callerName: 'Caller Ann',
      callerPerson: caller,
      expiresAt: 145_000
    })
  })

  it('stops the ringing on the native apps of the receiver when the response is declined', async () => {
    const response = invite('invite:resp', 'invite-response', recipientSpace)
    const { control, send } = createControl([response])
    const tx = {
      ...txBase,
      _class: core.class.TxUpdateDoc,
      objectId: response._id,
      objectSpace: response.space,
      operations: { status: 'declined' }
    } as unknown as TxUpdateDoc<UserMeetingInvite>

    await OnUserMeetingInvite([tx], control)

    expect((control.queue?.getProducer as jest.Mock).mock.calls[0][1]).toBe(QueueTopic.UserNotifications)
    expect(send).toHaveBeenCalledWith(control.ctx, 'test-ws-uuid', [
      {
        kind: 'call-cancel',
        id: 'call-cancel:invite:resp',
        account: recipientAccount,
        objectId: response._id,
        objectClass: love.class.UserMeetingInvite,
        objectSpace: recipientSpace,
        pushSubscriptions: [subscriptions[1]]
      }
    ])
  })

  it('stops the ringing of every response when the caller hangs up', async () => {
    const request = invite('invite:req', 'invite-request', 'space:caller' as Ref<Space>)
    const response = invite('invite:resp', 'invite-response', recipientSpace)
    const { control, send } = createControl([response], [request])
    const tx = {
      ...txBase,
      _class: core.class.TxRemoveDoc,
      objectId: request._id,
      objectSpace: request.space
    } as unknown as TxRemoveDoc<UserMeetingInvite>

    await OnUserMeetingInvite([tx], control)

    expect(send.mock.calls[0][2]).toEqual([expect.objectContaining({ kind: 'call-cancel', objectId: response._id })])
  })

  it('queues nothing for a heartbeat', async () => {
    const request = invite('invite:req', 'invite-request', 'space:caller' as Ref<Space>)
    const response = invite('invite:resp', 'invite-response', recipientSpace)
    const { control, send } = createControl([request, response])
    const tx = {
      ...txBase,
      _class: core.class.TxUpdateDoc,
      objectId: request._id,
      objectSpace: request.space,
      operations: { status: 'pending' }
    } as unknown as TxUpdateDoc<UserMeetingInvite>

    await OnUserMeetingInvite([tx], control)

    expect(send).not.toHaveBeenCalled()
  })
})
