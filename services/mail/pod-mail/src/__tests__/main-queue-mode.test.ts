//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { Request, Response } from 'express'
import { type MeasureContext, WorkspaceUuid } from '@hcengineering/core'
import { type PlatformQueueProducer } from '@hcengineering/server-core'
import { AccountNotification } from '../types'

// Mock config completely to avoid environment variable issues
jest.mock('../config', () => {
  return {
    __esModule: true,
    default: {
      source: 'noreply@example.com',
      mode: 'queue',
      port: 1025,
      apiKey: 'test-key'
    }
  }
})

// Mock MailClient
jest.mock('../mail', () => {
  return {
    __esModule: true,
    MailClient: jest.fn().mockImplementation(() => ({
      sendMessage: jest.fn()
    }))
  }
})

describe('handleSendMail - Queue Mode', () => {
  let req: Request
  let res: Response
  let sendMailMock: jest.Mock
  let mailClient: any
  let mockCtx: MeasureContext
  let mockQueueProducer: PlatformQueueProducer<AccountNotification>
  let handleSendMail: any

  beforeEach(async () => {
    // Import after mocks are set up
    const mainModule = await import('../main')
    handleSendMail = mainModule.handleSendMail

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    req = {
      body: {
        text: 'Hello, world!',
        subject: 'Test Subject',
        to: 'test@example.com',
        apiKey: 'test-key' // Include apiKey to pass authorization check
      }
    } as Request

    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response

    // Get the mocked MailClient and its sendMessage mock
    const { MailClient } = await import('../mail')
    mailClient = new MailClient()
    sendMailMock = mailClient.sendMessage

    mockCtx = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as MeasureContext

    mockQueueProducer = {
      send: jest.fn()
    } as unknown as PlatformQueueProducer<AccountNotification>
  })

  it('should push to queue in queue mode', async () => {
    await handleSendMail(mockQueueProducer, mailClient, req, res, mockCtx)

    // In queue mode, it should push to the queue, not call sendMessage directly
    expect(mockQueueProducer.send).toHaveBeenCalledWith(
      mockCtx,
      '' as WorkspaceUuid,
      [
        {
          type: 'email',
          data: expect.objectContaining({
            from: 'noreply@example.com',
            to: 'test@example.com',
            subject: 'Test Subject',
            text: 'Hello, world!'
          })
        }
      ],
      'test@example.com'
    )
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('should return 400 if text is missing', async () => {
    req.body.text = undefined

    await handleSendMail(mockQueueProducer, mailClient, req, res, mockCtx)

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith({ err: "'text' and 'html' are missing" })
    expect(mockQueueProducer.send).not.toHaveBeenCalled()
  })

  it('should return 400 if subject is missing', async () => {
    req.body.subject = undefined

    await handleSendMail(mockQueueProducer, mailClient, req, res, mockCtx)

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith({ err: "'subject' is missing" })
    expect(mockQueueProducer.send).not.toHaveBeenCalled()
  })

  it('should return 400 if to is missing', async () => {
    req.body.to = undefined

    await handleSendMail(mockQueueProducer, mailClient, req, res, mockCtx)

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith({ err: "'to' is missing" })
    expect(mockQueueProducer.send).not.toHaveBeenCalled()
  })
})
