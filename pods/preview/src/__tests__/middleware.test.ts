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

import { Analytics } from '@hcengineering/analytics'
import { MeasureMetricsContext } from '@hcengineering/core'
import { type Request, type Response } from 'express'

import { BadRequestError, ToolError } from '../error'
import { errorHandler } from '../middleware'

const ctx = new MeasureMetricsContext('middleware-test', {})

function respond (err: unknown): { status: jest.Mock, json: jest.Mock } {
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  errorHandler({ ctx })(err, {} as unknown as Request, { status } as unknown as Response, jest.fn())
  return { status, json }
}

describe('errorHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('keeps the failure detail out of a 500 body but in the log', () => {
    const logged = jest.spyOn(ctx, 'error').mockImplementation(() => undefined)
    const detail = 'ffmpeg exited with code 183: ffmpeg version 7.1 /tmp/preview-aB3dEf/65a1b2c3 moov atom not found'

    const { status, json } = respond(new Error(detail))

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ message: 'Internal Server Error' })
    expect(logged).toHaveBeenCalledWith(detail, expect.anything())
  })

  it('keeps the message of an http error', () => {
    jest.spyOn(ctx, 'error').mockImplementation(() => undefined)

    const { status, json } = respond(new BadRequestError('Blob is too large for preview'))

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({ message: 'Blob is too large for preview' })
  })

  it('answers a tool failure with a 500 and neither logs it nor sends it to Analytics', () => {
    const logged = jest.spyOn(ctx, 'error').mockImplementation(() => undefined)
    const handled = jest.spyOn(Analytics, 'handleError').mockImplementation(() => undefined)

    const { status, json } = respond(new ToolError('ffmpeg exited with code 183'))

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ message: 'Internal Server Error' })
    expect(logged).not.toHaveBeenCalled()
    expect(handled).not.toHaveBeenCalled()
  })

  it('still sends another error to Analytics', () => {
    jest.spyOn(ctx, 'error').mockImplementation(() => undefined)
    const handled = jest.spyOn(Analytics, 'handleError').mockImplementation(() => undefined)

    respond(new Error('boom'))

    expect(handled).toHaveBeenCalledTimes(1)
  })
})
