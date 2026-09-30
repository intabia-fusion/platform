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
  apnsDismissPayload,
  fcmAlertMessage,
  fcmDismissMessage,
  PushKind,
  pushTarget,
  rustoreAlertMessage,
  rustoreDismissMessage
} from '../mobile'

jest.mock('../config', () => ({
  __esModule: true,
  default: { TTL: 86400 }
}))

describe('pushTarget', () => {
  it('reads a device token out of its scheme', () => {
    expect(pushTarget('apns://abc123')).toEqual({ kind: PushKind.Apns, token: 'abc123' })
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

  it('RuStore: data only, so the app stacks the conversation itself', () => {
    expect(rustoreAlertMessage('tok', { ...data, group, groupTitle: 'develop' })).toEqual({
      token: 'tok',
      data: {
        title: 'Title',
        body: 'Body',
        url: 'https://app/x',
        domain: 'https://app',
        tag: 'msg-1',
        group: 'channel-1',
        groupTitle: 'develop',
        objectId: 'doc-1',
        objectClass: 'chunter:class:Channel',
        createdOn: '1000'
      },
      android: { ttl: '86400s' }
    })
  })
})

describe('dismiss payloads', () => {
  const data = { objectId, objectClass, tags: ['msg-1', 'msg-2'], readUpTo: 2000 }

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
