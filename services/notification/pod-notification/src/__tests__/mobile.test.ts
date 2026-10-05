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

import type { Class, Doc, Ref } from '@hcengineering/core'

import {
  apnsAlertPayload,
  androidTag,
  apnsCallCancelPayload,
  apnsDismissAllPayload,
  apnsDismissPayload,
  apnsVoipPayload,
  fcmAlertMessage,
  fcmCallCancelMessage,
  fcmCallMessage,
  fcmDismissAllMessage,
  fcmDismissMessage,
  PushKind,
  pushTarget,
  rustoreAlertMessage,
  rustoreCallCancelMessage,
  rustoreCallMessage,
  rustoreDismissAllMessage,
  rustoreDismissMessage
} from '../mobile'

jest.mock('../config', () => ({
  __esModule: true,
  default: { TTL: 86400 }
}))

describe('pushTarget', () => {
  it('reads a device token out of its scheme', () => {
    expect(pushTarget('apns://abc123')).toEqual({ kind: PushKind.Apns, token: 'abc123' })
    expect(pushTarget('apns-voip://voip1')).toEqual({ kind: PushKind.ApnsVoip, token: 'voip1' })
    expect(pushTarget('fcm://xyz789')).toEqual({ kind: PushKind.Fcm, token: 'xyz789' })
    expect(pushTarget('rustore://def456')).toEqual({ kind: PushKind.RuStore, token: 'def456' })
  })

  it('leaves every other endpoint on web push', () => {
    expect(pushTarget('https://web.push.apple.com/xyz')).toEqual({ kind: PushKind.Web })
    expect(pushTarget('https://fcm.googleapis.com/fcm/send/abc')).toEqual({ kind: PushKind.Web })
    expect(pushTarget('')).toEqual({ kind: PushKind.Web })
  })
})

const objectId = 'doc-1' as Ref<Doc>
const objectClass = 'chunter:class:Channel' as Ref<Class<Doc>>
const group = 'channel-1' as Ref<Doc>

describe('alert payloads', () => {
  const data = {
    tag: 'msg-1',
    title: 'Title',
    body: 'Body',
    url: 'https://app/x',
    domain: 'https://app',
    objectId,
    objectClass,
    createdOn: 1000
  }

  it('APNs: an alert threaded by its chat and the reconciliation keys beside aps', () => {
    expect(apnsAlertPayload(data)).toEqual({
      aps: { alert: { title: 'Title', body: 'Body' }, sound: 'default', 'thread-id': 'doc-1', 'mutable-content': 1 },
      url: 'https://app/x',
      domain: 'https://app',
      tag: 'msg-1',
      objectId: 'doc-1',
      objectClass: 'chunter:class:Channel',
      createdOn: 1000
    })
  })

  it('APNs: a thread reply stacks with its channel', () => {
    const aps = apnsAlertPayload({ ...data, group }).aps as Record<string, unknown>
    expect(aps['thread-id']).toBe('channel-1')
  })

  it('APNs: falls back to the tag as thread when the push names no object', () => {
    const aps = apnsAlertPayload({ ...data, objectId: undefined }).aps as Record<string, unknown>
    expect(aps['thread-id']).toBe('msg-1')
  })

  it('FCM: a notification block plus string-only data', () => {
    expect(fcmAlertMessage('tok', data)).toEqual({
      token: 'tok',
      notification: { title: 'Title', body: 'Body' },
      data: {
        url: 'https://app/x',
        domain: 'https://app',
        tag: 'msg-1',
        objectId: 'doc-1',
        objectClass: 'chunter:class:Channel',
        createdOn: '1000'
      },
      android: { priority: 'HIGH', ttl: '86400s', notification: { tag: 'msg-1' } }
    })
  })

  it('FCM: leaves absent keys out of data', () => {
    expect(fcmAlertMessage('tok', { title: 'T', body: 'B' })).toMatchObject({ data: {} })
  })

  it('RuStore: the FCM shape with the same reconciliation keys in data', () => {
    expect(rustoreAlertMessage('tok', data)).toEqual({
      token: 'tok',
      notification: { title: 'Title', body: 'Body' },
      data: {
        url: 'https://app/x',
        domain: 'https://app',
        tag: 'msg-1',
        objectId: 'doc-1',
        objectClass: 'chunter:class:Channel',
        createdOn: '1000'
      },
      android: { ttl: '86400s', notification: { tag: 'msg-1' } }
    })
  })
})

describe('dismiss payloads', () => {
  const data = { kind: 'dismiss' as const, objectId, objectClass, tags: ['msg-1', 'msg-2'], readUpTo: 2000 }

  it('APNs: background content-available, no alert, the dismiss keys', () => {
    expect(apnsDismissPayload(data)).toEqual({
      aps: { 'content-available': 1 },
      kind: 'dismiss',
      objectId: 'doc-1',
      objectClass: 'chunter:class:Channel',
      tags: ['msg-1', 'msg-2'],
      readUpTo: 2000
    })
  })

  it('FCM: data only, tags as a JSON string, no notification block', () => {
    expect(fcmDismissMessage('tok', data)).toEqual({
      token: 'tok',
      data: {
        kind: 'dismiss',
        objectId: 'doc-1',
        objectClass: 'chunter:class:Channel',
        tags: '["msg-1","msg-2"]',
        readUpTo: '2000'
      },
      android: { priority: 'HIGH', ttl: '86400s' }
    })
  })

  it('RuStore: data only, the FCM dismiss shape', () => {
    expect(rustoreDismissMessage('tok', data)).toEqual({
      token: 'tok',
      data: {
        kind: 'dismiss',
        objectId: 'doc-1',
        objectClass: 'chunter:class:Channel',
        tags: '["msg-1","msg-2"]',
        readUpTo: '2000'
      },
      android: { ttl: '86400s' }
    })
  })
})

describe('call payloads', () => {
  const now = 1_000_000
  const data = {
    tag: 'notify-1',
    title: 'Call',
    body: 'Ann is calling',
    url: 'https://app/x',
    domain: 'https://app/workbench/ws',
    objectId,
    objectClass,
    createdOn: now
  }
  const call = {
    inviteId: 'invite-1' as Ref<Doc>,
    roomId: 'room-1' as Ref<Doc>,
    callerName: 'Ann',
    callerPerson: 'person-ann' as Ref<Doc>,
    expiresAt: now + 45_000
  }
  const fields = {
    kind: 'call',
    inviteId: 'invite-1',
    roomId: 'room-1',
    callerName: 'Ann',
    callerPerson: 'person-ann',
    url: 'https://app/x',
    domain: 'https://app/workbench/ws',
    tag: 'notify-1',
    objectId: 'doc-1',
    objectClass: 'chunter:class:Channel'
  }

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('APNs VoIP: the call keys only, numbers kept, no aps alert, absent keys left out', () => {
    expect(apnsVoipPayload(data, call)).toEqual({ ...fields, expiresAt: now + 45_000, createdOn: now })
  })

  it('FCM: data only, high priority, ttl down to the end of the ringing', () => {
    expect(fcmCallMessage('tok', data, call)).toEqual({
      token: 'tok',
      data: { ...fields, expiresAt: String(now + 45_000), createdOn: String(now) },
      android: { priority: 'HIGH', ttl: '45s' }
    })
    expect(fcmCallMessage('tok', data, { ...call, expiresAt: now + 10_500 })).toMatchObject({
      android: { ttl: '11s' }
    })
  })

  it('RuStore: the FCM call shape, no notification block', () => {
    expect(rustoreCallMessage('tok', data, call)).toEqual({
      token: 'tok',
      data: { ...fields, expiresAt: String(now + 45_000), createdOn: String(now) },
      android: { ttl: '45s' }
    })
  })

  it('cancel: background on APNs, data only on FCM and RuStore', () => {
    expect(apnsCallCancelPayload('invite-1')).toEqual({
      aps: { 'content-available': 1 },
      kind: 'call-cancel',
      inviteId: 'invite-1'
    })
    expect(fcmCallCancelMessage('tok', 'invite-1')).toEqual({
      token: 'tok',
      data: { kind: 'call-cancel', inviteId: 'invite-1' },
      android: { priority: 'HIGH', ttl: '45s' }
    })
    expect(rustoreCallCancelMessage('tok', 'invite-1')).toEqual({
      token: 'tok',
      data: { kind: 'call-cancel', inviteId: 'invite-1' },
      android: { ttl: '45s' }
    })
  })
})

describe('dismiss-all payloads', () => {
  const data = { kind: 'dismiss-all' as const, workspace: 'ws-1' as any, readUpTo: 3000 }

  it('APNs: background content-available, the workspace and the time, no document and no tags', () => {
    expect(apnsDismissAllPayload(data)).toEqual({
      aps: { 'content-available': 1 },
      kind: 'dismiss-all',
      workspace: 'ws-1',
      readUpTo: 3000
    })
  })

  it('FCM: data only', () => {
    expect(fcmDismissAllMessage('tok', data)).toEqual({
      token: 'tok',
      data: { kind: 'dismiss-all', workspace: 'ws-1', readUpTo: '3000' },
      android: { priority: 'HIGH', ttl: '86400s' }
    })
  })

  it('RuStore: data only, the FCM shape', () => {
    expect(rustoreDismissAllMessage('tok', data)).toEqual({
      token: 'tok',
      data: { kind: 'dismiss-all', workspace: 'ws-1', readUpTo: '3000' },
      android: { ttl: '86400s' }
    })
  })
})

describe('the workspace of an alert', () => {
  const data = { title: 't', body: 'b', tag: 'msg-1', createdOn: 1000, workspace: 'ws-1' as any }

  it('is in the Android notification tag with the time: the SDK-drawn alert keeps nothing else', () => {
    expect((fcmAlertMessage('tok', data) as any).android.notification.tag).toBe('ws-1|1000|msg-1')
    expect((rustoreAlertMessage('tok', data) as any).android.notification.tag).toBe('ws-1|1000|msg-1')
    // `data.tag` stays the plain id: that is what a dismiss names.
    expect((fcmAlertMessage('tok', data) as any).data.tag).toBe('msg-1')
  })

  it('leaves the plain id as the tag when the workspace or the time is unknown', () => {
    expect(androidTag({ title: 't', body: 'b', tag: 'msg-1' })).toBe('msg-1')
    expect(androidTag({ title: 't', body: 'b' })).toBeUndefined()
  })

  it('goes with the alert on every transport, for a workspace dismiss to find it', () => {
    expect(apnsAlertPayload(data).workspace).toBe('ws-1')
    expect((fcmAlertMessage('tok', data) as any).data.workspace).toBe('ws-1')
    expect((rustoreAlertMessage('tok', data) as any).data.workspace).toBe('ws-1')
  })
})
