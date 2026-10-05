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

import { EventEmitter } from 'events'
import { connect } from 'http2'
import type { Doc, Ref } from '@hcengineering/core'

import { Delivery, sendApnsCallCancel, sendApnsVoip } from '../mobile'

jest.mock('../config', () => {
  const { generateKeyPairSync } = jest.requireActual('crypto')
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return {
    __esModule: true,
    default: {
      TTL: 86400,
      ApnsKeyId: 'key',
      ApnsTeamId: 'team',
      ApnsKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      ApnsTopic: 'com.example.app',
      ApnsProduction: false
    }
  }
})

jest.mock('http2', () => ({ ...jest.requireActual('http2'), connect: jest.fn() }))

// The module keeps one APNs session, so one fake answers 200 to every request and records the last.
const sent: { headers: Record<string, string>, body: string } = { headers: {}, body: '' }
;(connect as jest.Mock).mockReturnValue({
  closed: false,
  destroyed: false,
  on: jest.fn(),
  request: (headers: Record<string, string>) => {
    sent.headers = headers
    const stream = new EventEmitter() as EventEmitter & { end: (body: string) => void }
    stream.end = (body: string) => {
      sent.body = body
      stream.emit('response', { ':status': 200 })
      stream.emit('end')
    }
    return stream
  }
})

describe('APNs call requests', () => {
  it('VoIP: its own topic, priority 10, expires with the call', async () => {
    const expiresAt = Date.now() + 45_000

    const delivery = await sendApnsVoip(
      'tok',
      { title: 'Ann', body: 'calls' },
      { inviteId: 'invite-1' as Ref<Doc>, callerName: 'Ann', callerPerson: 'p' as Ref<Doc>, expiresAt }
    )

    expect(delivery).toBe(Delivery.Ok)
    expect(sent.headers).toMatchObject({
      ':path': '/3/device/tok',
      'apns-push-type': 'voip',
      'apns-priority': '10',
      'apns-topic': 'com.example.app.voip',
      'apns-expiration': String(Math.floor(expiresAt / 1000))
    })
    expect(JSON.parse(sent.body)).toMatchObject({ kind: 'call', inviteId: 'invite-1', expiresAt })
  })

  it('cancel: a background push on the app topic, never VoIP', async () => {
    const delivery = await sendApnsCallCancel('tok', 'invite-1')

    expect(delivery).toBe(Delivery.Ok)
    expect(sent.headers).toMatchObject({
      'apns-push-type': 'background',
      'apns-priority': '5',
      'apns-topic': 'com.example.app'
    })
    expect(JSON.parse(sent.body)).toEqual({
      aps: { 'content-available': 1 },
      kind: 'call-cancel',
      inviteId: 'invite-1'
    })
  })
})
