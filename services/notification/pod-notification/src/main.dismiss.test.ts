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

import core, { type AccountUuid, type PersonId, type Ref } from '@hcengineering/core'
import notification, {
  type PushDismissAllData,
  type PushDismissData,
  type PushSubscription
} from '@hcengineering/notification'

import { sendDismissToSubscription } from './main'
import { Delivery, sendApnsDismiss, sendFcmDismiss } from './mobile'

jest.mock('./config', () => ({
  default: {
    Source: 'test-source',
    PushPublicKey: 'test-key',
    PushPrivateKey: 'test-private-key',
    PushSubject: 'mailto:test@example.com',
    TTL: 86400,
    ServiceId: 'web-push-service',
    AccountsUrl: 'http://localhost:3000',
    Secret: 'secret'
  }
}))

// The native transports are configured here, unlike in main.test.ts: this file checks the dispatch
// to them and the dead-token handling, not the requests themselves (mobile.test.ts covers payloads).
jest.mock('./mobile', () => {
  const actual = jest.requireActual('./mobile')
  return {
    ...actual,
    apnsConfigured: () => true,
    fcmConfigured: () => true,
    sendApnsDismiss: jest.fn(),
    sendFcmDismiss: jest.fn()
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

const dismiss: PushDismissData = {
  kind: 'dismiss',
  objectId: 'doc-1' as any,
  objectClass: 'DocClass' as any,
  tags: ['msg-1'],
  readUpTo: 100
}

describe('sendDismissToSubscription with native transports configured', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends the dismiss to every native subscription by its transport and skips web push', async () => {
    ;(sendApnsDismiss as jest.Mock).mockResolvedValue(Delivery.Ok)
    ;(sendFcmDismiss as jest.Mock).mockResolvedValue(Delivery.Ok)

    const failed = await sendDismissToSubscription(
      [
        subscription('sub-web', 'https://example.com/endpoint'),
        subscription('sub-apns', 'apns://token-a'),
        subscription('sub-fcm', 'fcm://token-f')
      ],
      dismiss
    )

    expect(failed).toEqual([])
    expect(sendApnsDismiss).toHaveBeenCalledWith('token-a', dismiss)
    expect(sendFcmDismiss).toHaveBeenCalledWith('token-f', dismiss)
  })

  it('reports the subscriptions whose token is gone, and keeps the ones that merely failed', async () => {
    ;(sendApnsDismiss as jest.Mock).mockResolvedValue(Delivery.Gone)
    ;(sendFcmDismiss as jest.Mock).mockResolvedValue(Delivery.Error)

    const failed = await sendDismissToSubscription(
      [subscription('sub-apns', 'apns://token-a'), subscription('sub-fcm', 'fcm://token-f')],
      dismiss
    )

    expect(failed).toEqual(['sub-apns'])
  })

  it('sends a dismiss-all the same way, by transport', async () => {
    ;(sendApnsDismiss as jest.Mock).mockResolvedValue(Delivery.Ok)
    ;(sendFcmDismiss as jest.Mock).mockResolvedValue(Delivery.Ok)
    const all: PushDismissAllData = { kind: 'dismiss-all', workspace: 'ws-1' as any, readUpTo: 100 }

    await sendDismissToSubscription(
      [subscription('sub-web', 'https://example.com/endpoint'), subscription('sub-apns', 'apns://token-a')],
      all
    )

    expect(sendApnsDismiss).toHaveBeenCalledWith('token-a', all)
    expect(sendFcmDismiss).not.toHaveBeenCalled()
  })
})
