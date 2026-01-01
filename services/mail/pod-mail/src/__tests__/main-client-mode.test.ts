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

import { type MeasureContext } from '@hcengineering/core'
import { Request, Response } from 'express'

// Mock config completely to avoid environment variable issues
jest.mock('../config', () => {
  return {
    __esModule: true,
    default: {
      source: 'noreply@example.com',
      mode: 'client',
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

describe('handleSendMail - Client Mode', () => {
  let req: Request
  let res: Response
  let sendMailMock: jest.Mock
  let mailClient: any
  let mockCtx: MeasureContext
  let handleSendMail: any

  beforeEach(async () => {
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
  })

  it('should call sendMessage directly in client mode', async () => {
    await handleSendMail(undefined, mailClient, req, res, mockCtx)

    // In client mode, it should call sendMessage directly
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com', // Verify that the default source from config is used
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Hello, world!'
      }),
      mockCtx,
      undefined
    )
  })

  it('should use from if it is provided in client mode', async () => {
    req.body.from = 'test.from@example.com'
    await handleSendMail(undefined, mailClient, req, res, mockCtx)

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'test.from@example.com', // Verify that the from is used
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Hello, world!'
      }),
      mockCtx,
      undefined
    )
  })

  it('should send to multiple addresses in client mode', async () => {
    req.body.to = ['test1@example.com', 'test2@example.com']
    await handleSendMail(undefined, mailClient, req, res, mockCtx)

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: ['test1@example.com', 'test2@example.com'], // Verify that multiple addresses are passed
        subject: 'Test Subject',
        text: 'Hello, world!'
      }),
      mockCtx,
      undefined
    )
  })

  it('should send email with credentials in client mode', async () => {
    req.body.to = ['test1@example.com', 'test2@example.com']
    req.body.password = 'test-password'
    await handleSendMail(undefined, mailClient, req, res, mockCtx)

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@example.com',
        to: ['test1@example.com', 'test2@example.com'], // Verify that multiple addresses are passed
        subject: 'Test Subject',
        text: 'Hello, world!'
      }),
      mockCtx,
      'test-password'
    )
  })

  it('handles errors thrown by MailClient', async () => {
    sendMailMock.mockRejectedValue(new Error('Email service error'))

    await handleSendMail(undefined, mailClient, req, res, mockCtx)

    expect(res.send).toHaveBeenCalled() // Check that a response is still sent
  })

  it('should return 400 if text is missing in client mode', async () => {
    req.body.text = undefined

    await handleSendMail(undefined, mailClient, req, res, mockCtx)

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith({ err: "'text' and 'html' are missing" })
    expect(sendMailMock).not.toHaveBeenCalled()
  })
})
