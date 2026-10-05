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

import core, { type AccountUuid, type Doc, type PersonId, type Ref } from '@hcengineering/core'
import notification, { type PushCallData, type PushData, type PushSubscription } from '@hcengineering/notification'
import webpush from 'web-push'

import { sendCallCancelToSubscription, sendDismissToSubscription, sendPushToSubscription } from './main'
import {
  Delivery,
  sendApns,
  sendApnsCallCancel,
  sendApnsDismiss,
  sendApnsVoip,
  sendFcm,
  sendFcmCall,
  sendFcmCallCancel,
  sendRustoreCall,
  sendRustoreCallCancel
} from './mobile'

jest.mock('./config', () => ({
  default: { TTL: 86400, ServiceId: 'web-push-service', AccountsUrl: 'http://localhost:3000', Secret: 'secret' }
}))

jest.mock('web-push', () => ({ sendNotification: jest.fn(), setVapidDetails: jest.fn(), WebPushError: Error }))

jest.mock('./mobile', () => {
  const actual = jest.requireActual('./mobile')
  const sent = (): jest.Mock => jest.fn().mockResolvedValue(actual.Delivery.Ok)
  return {
    ...actual,
    apnsConfigured: () => true,
    fcmConfigured: () => true,
    rustoreConfigured: () => true,
    sendApns: sent(),
    sendApnsVoip: sent(),
    sendApnsDismiss: sent(),
    sendApnsCallCancel: sent(),
    sendFcm: sent(),
    sendFcmCall: sent(),
    sendFcmCallCancel: sent(),
    sendRustore: sent(),
    sendRustoreCall: sent(),
    sendRustoreCallCancel: sent()
  }
})

function subscription (id: string, endpoint: string): PushSubscription {
  return {
    _id: id as Ref<PushSubscription>,
    _class: notification.class.PushSubscription,
    space: core.space.Workspace,
    user: 'user-1' as AccountUuid,
    endpoint,
    keys: { p256dh: 'dh', auth: 'auth' },
    modifiedOn: 0,
    modifiedBy: 'system' as PersonId
  }
}

const web = subscription('sub-web', 'https://example.com/endpoint')
const apns = subscription('sub-apns', 'apns://token-a')
const voip = subscription('sub-voip', 'apns-voip://token-v')
const fcm = subscription('sub-fcm', 'fcm://token-f')
const rustore = subscription('sub-rustore', 'rustore://token-r')

const data: PushData = { tag: 'notify-1', title: 'Ann', body: 'is calling you' }
const call = (expiresAt: number): PushCallData => ({
  inviteId: 'invite-1' as Ref<Doc>,
  callerName: 'Ann',
  callerPerson: 'person-ann' as Ref<Doc>,
  expiresAt
})

describe('call push routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('never sends a chat push to a VoIP token, and keeps the banner for the rest', async () => {
    await sendPushToSubscription([web, apns, voip, fcm], data)

    expect(sendApnsVoip).not.toHaveBeenCalled()
    expect(sendApns).toHaveBeenCalledWith('token-a', data)
    expect(sendFcm).toHaveBeenCalledWith('token-f', data)
    expect(webpush.sendNotification).toHaveBeenCalledWith(web, JSON.stringify(data), expect.anything())
  })

  it('never sends a dismiss to a VoIP token', async () => {
    await sendDismissToSubscription([voip, apns], {
      kind: 'dismiss',
      objectId: 'doc-1' as any,
      objectClass: 'c' as any,
      tags: [],
      readUpTo: 0
    })

    expect(sendApnsDismiss).toHaveBeenCalledTimes(1)
    expect(sendApnsDismiss).toHaveBeenCalledWith('token-a', expect.anything())
  })

  it('rings over VoIP and data-only Android pushes, leaves the plain iPhone token silent, the browser as before', async () => {
    const live = call(Date.now() + 45_000)
    await sendPushToSubscription([web, apns, voip, fcm, rustore], data, live)

    expect(sendApnsVoip).toHaveBeenCalledWith('token-v', data, live)
    expect(sendApns).not.toHaveBeenCalled()
    expect(sendFcmCall).toHaveBeenCalledWith('token-f', data, live)
    expect(sendFcm).not.toHaveBeenCalled()
    expect(sendRustoreCall).toHaveBeenCalledWith('token-r', data, live)
    expect(webpush.sendNotification).toHaveBeenCalledWith(web, JSON.stringify(data), expect.anything())
  })

  it('keeps the banner on an iPhone that has no VoIP token yet', async () => {
    await sendPushToSubscription([apns, fcm], data, call(Date.now() + 45_000))

    expect(sendApns).toHaveBeenCalledWith('token-a', data)
    expect(sendFcmCall).toHaveBeenCalled()
  })

  it('rings nothing for a call already over: banners only, nothing on VoIP', async () => {
    await sendPushToSubscription([apns, voip, fcm], data, call(Date.now() - 1))

    expect(sendApnsVoip).not.toHaveBeenCalled()
    expect(sendFcmCall).not.toHaveBeenCalled()
    expect(sendApns).toHaveBeenCalledWith('token-a', data)
    expect(sendFcm).toHaveBeenCalledWith('token-f', data)
  })

  it('falls back to the banner when VoIP delivery fails', async () => {
    ;(sendApnsVoip as jest.Mock).mockResolvedValueOnce(Delivery.Error)
    const live = call(Date.now() + 45_000)
    await sendPushToSubscription([apns, voip], data, live)

    expect(sendApnsVoip).toHaveBeenCalledWith('token-v', data, live)
    expect(sendApns).toHaveBeenCalledWith('token-a', data)
  })

  it('falls back to the banner when the VoIP token is dead', async () => {
    ;(sendApnsVoip as jest.Mock).mockResolvedValueOnce(Delivery.Gone)

    expect(await sendPushToSubscription([apns, voip], data, call(Date.now() + 45_000))).toEqual(['sub-voip'])
    expect(sendApns).toHaveBeenCalledWith('token-a', data)
  })

  it('reports a dead VoIP token', async () => {
    ;(sendApnsVoip as jest.Mock).mockResolvedValueOnce(Delivery.Gone)

    expect(await sendPushToSubscription([voip], data, call(Date.now() + 45_000))).toEqual(['sub-voip'])
  })

  it('cancels on every native token but VoIP, and not in the browser', async () => {
    ;(sendFcmCallCancel as jest.Mock).mockResolvedValueOnce(Delivery.Gone)

    const failed = await sendCallCancelToSubscription([web, apns, voip, fcm, rustore], 'invite-1')

    expect(failed).toEqual(['sub-fcm'])
    expect(sendApnsCallCancel).toHaveBeenCalledWith('token-a', 'invite-1')
    expect(sendFcmCallCancel).toHaveBeenCalledWith('token-f', 'invite-1')
    expect(sendRustoreCallCancel).toHaveBeenCalledWith('token-r', 'invite-1')
    expect(sendApnsVoip).not.toHaveBeenCalled()
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})
