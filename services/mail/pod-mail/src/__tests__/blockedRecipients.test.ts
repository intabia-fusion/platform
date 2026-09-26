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
import { MeasureMetricsContext } from '@hcengineering/core'

const mockSendMail = jest.fn()

jest.mock('../config', () => ({
  __esModule: true,
  default: {
    source: 'platform@intabia.ru',
    mode: 'queue',
    port: 1025,
    blockedRecipients: new Set(['huly.ai.bot@hc.engineering'])
  }
}))

jest.mock('../transport', () => ({
  getDefaultTransport: () => ({ sendMail: mockSendMail }),
  getSmtpTransport: () => ({ sendMail: mockSendMail })
}))

// eslint-disable-next-line import/first
import { MailClient } from '../mail'
// eslint-disable-next-line import/first
import { withoutBlockedRecipients } from '../utils'

const bot = 'huly.ai.bot@hc.engineering'
const blocked = new Set([bot])

describe('withoutBlockedRecipients', () => {
  it('drops a message whose only recipient is blocked', () => {
    expect(withoutBlockedRecipients({ to: bot }, blocked)).toBeUndefined()
    expect(withoutBlockedRecipients({ to: bot.toUpperCase() }, blocked)).toBeUndefined()
    expect(withoutBlockedRecipients({ to: `AI Bot <${bot}>` }, blocked)).toBeUndefined()
    expect(withoutBlockedRecipients({ to: { name: 'AI Bot', address: bot } }, blocked)).toBeUndefined()
  })

  it('keeps the other recipients', () => {
    expect(withoutBlockedRecipients({ to: `${bot}, user@example.com` }, blocked)).toEqual({
      to: ['user@example.com'],
      cc: undefined,
      bcc: undefined
    })
    expect(withoutBlockedRecipients({ to: bot, cc: 'user@example.com' }, blocked)).toEqual({
      to: undefined,
      cc: 'user@example.com',
      bcc: undefined
    })
  })

  it('returns the message untouched when nothing is blocked', () => {
    const message = { to: 'user@example.com', subject: 's' }
    expect(withoutBlockedRecipients(message, blocked)).toBe(message)
    expect(withoutBlockedRecipients({ to: bot }, new Set())).toEqual({ to: bot })
  })
})

describe('MailClient.sendMessage', () => {
  const ctx = new MeasureMetricsContext('test', {})

  beforeEach(() => {
    mockSendMail.mockReset()
  })

  it('does not send to a blocked recipient', async () => {
    await new MailClient().sendMessage({ from: 'platform@intabia.ru', to: bot, subject: 's' }, ctx)

    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('sends to the remaining recipients', async () => {
    await new MailClient().sendMessage({ from: 'platform@intabia.ru', to: [bot, 'user@example.com'] }, ctx)

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['user@example.com'] }),
      expect.any(Function)
    )
  })
})
