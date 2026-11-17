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
jest.mock('../config', () => ({ __esModule: true, default: { LoveEndpoint: 'http://love' } }))

/* eslint-disable import/first */
import { LoveController } from '../workspace/love'
/* eslint-enable import/first */

describe('LoveController.connect', () => {
  it('propagates exhausted admission without marking the meeting as transcribing or connected', async () => {
    const originalFetch = global.fetch
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 413 })
    global.fetch = fetchMock
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    const controller = new LoveController(
      'workspace' as any,
      { info: jest.fn() } as any,
      'token',
      { findAll: jest.fn().mockResolvedValue([]) } as any,
      { _id: 'bot', name: 'Bot' } as any
    )
    jest.spyOn(controller, 'getMeeting').mockResolvedValue({ _id: 'meeting', name: 'Meeting' } as any)
    jest.spyOn(controller, 'getRoomParticipant').mockResolvedValue(undefined)
    const updateState = jest.spyOn(controller, 'updateTranscriptionState')
    const createParticipant = jest.spyOn(controller, 'createAiParticipant')
    try {
      await expect(
        controller.connect({ meetingId: 'meeting', transcription: true, language: 'en' } as any)
      ).rejects.toMatchObject({ code: 413, message: 'transcription-limit-exceeded' })
      expect(controller.hasActiveConnections()).toBe(false)
      expect(updateState).not.toHaveBeenCalled()
      expect(createParticipant).not.toHaveBeenCalled()
    } finally {
      global.fetch = originalFetch
      consoleError.mockRestore()
    }
  })
})
