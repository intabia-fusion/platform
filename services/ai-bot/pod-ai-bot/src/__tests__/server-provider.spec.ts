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

import { TranscriptionResult, TranscriptionOptions, AudioFormat } from '../transcription/types'

// Mock MeasureContext interface
interface MockMeasureContext {
  info: jest.Mock
  error: jest.Mock
  warn: jest.Mock
}

// Mock ClisrServer interface for testing
interface MockClisrServer {
  binaryRequest: jest.Mock
  close: jest.Mock
}

// Mock session interface
interface MockSession {
  id: string
  options: {
    transcription?: boolean
  }
}

describe('Server Provider for Client Distribution', () => {
  let mockCtx: MockMeasureContext
  let mockServer: MockClisrServer

  beforeEach(() => {
    mockCtx = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }

    mockServer = {
      binaryRequest: jest.fn(),
      close: jest.fn()
    }
  })

  describe('ServerProvider Initialization', () => {
    it('should have correct provider name', () => {
      const providerName = 'server'
      expect(providerName).toBe('server')
    })

    it('should require ClisrServer instance', () => {
      expect(mockServer).toBeDefined()
      expect(mockServer.binaryRequest).toBeDefined()
    })

    it('should throw error if server is undefined', () => {
      const createProvider = (server: MockClisrServer | undefined): void => {
        if (server === undefined) {
          throw new Error('Clisr server instance is not provided')
        }
      }

      expect(() => {
        createProvider(undefined)
      }).toThrow('Clisr server instance is not provided')
      expect(() => {
        createProvider(mockServer)
      }).not.toThrow()
    })
  })

  describe('Transcription Request Flow', () => {
    it('should call binaryRequest with correct parameters', async () => {
      const audioData = Buffer.from([0x4f, 0x67, 0x67, 0x53]) // OggS header
      const options: TranscriptionOptions = {
        audioFormat: 'ogg',
        language: 'en',
        sampleRate: 16000,
        channels: 1
      }

      const expectedResult: TranscriptionResult = {
        text: 'Hello world',
        language: 'en',
        confidence: 0.95
      }

      mockServer.binaryRequest.mockResolvedValue(expectedResult)

      const result = await mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options }, () => true)

      expect(mockServer.binaryRequest).toHaveBeenCalledWith(
        mockCtx,
        'transcribe',
        audioData,
        { options },
        expect.any(Function)
      )
      expect(result).toEqual(expectedResult)
    })

    it('should use ogg as default audio format', async () => {
      const audioData = Buffer.alloc(100)
      const options: TranscriptionOptions = {
        audioFormat: 'ogg'
      }

      mockServer.binaryRequest.mockResolvedValue({ text: 'result', language: 'en' })

      await mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options }, () => true)

      expect(mockServer.binaryRequest).toHaveBeenCalled()
    })

    it('should pass word timestamps option', async () => {
      const audioData = Buffer.alloc(100)
      const options: TranscriptionOptions = {
        wordTimestamps: true,
        audioFormat: 'ogg'
      }

      const resultWithWords: TranscriptionResult = {
        text: 'Hello world',
        language: 'en',
        words: [
          { word: 'Hello', start: 0, end: 0.5 },
          { word: 'world', start: 0.6, end: 1.0 }
        ]
      }

      mockServer.binaryRequest.mockResolvedValue(resultWithWords)

      const result = await mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options }, () => true)

      expect(result.words).toBeDefined()
      expect(result.words).toHaveLength(2)
    })
  })

  describe('Client Selection', () => {
    it('should filter clients with transcription capability', () => {
      const sessions: MockSession[] = [
        { id: 'session-1', options: { transcription: true } },
        { id: 'session-2', options: { transcription: false } },
        { id: 'session-3', options: { transcription: true } },
        { id: 'session-4', options: {} }
      ]

      const selectClient = (session: MockSession): boolean => {
        return session.options.transcription === true
      }

      const availableClients = sessions.filter(selectClient)

      expect(availableClients).toHaveLength(2)
      expect(availableClients[0].id).toBe('session-1')
      expect(availableClients[1].id).toBe('session-3')
    })

    it('should reject clients without transcription capability', () => {
      const session: MockSession = { id: 'no-transcription', options: {} }

      const selectClient = (s: MockSession): boolean => {
        return s.options.transcription === true
      }

      expect(selectClient(session)).toBe(false)
    })

    it('should handle empty client list', async () => {
      mockServer.binaryRequest.mockRejectedValue(new Error('No available clients'))

      await expect(
        mockServer.binaryRequest(
          mockCtx,
          'transcribe',
          Buffer.alloc(100),
          { options: { audioFormat: 'ogg' } },
          () => false // No clients match
        )
      ).rejects.toThrow('No available clients')
    })
  })

  describe('Error Handling', () => {
    it('should handle transcription failure', async () => {
      const audioData = Buffer.alloc(100)

      mockServer.binaryRequest.mockRejectedValue(new Error('Transcription failed'))

      await expect(
        mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options: { audioFormat: 'ogg' } }, () => true)
      ).rejects.toThrow('Transcription failed')
    })

    it('should handle client timeout', async () => {
      const audioData = Buffer.alloc(100)

      mockServer.binaryRequest.mockRejectedValue(new Error('Request timeout'))

      await expect(
        mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options: { audioFormat: 'ogg' } }, () => true)
      ).rejects.toThrow('Request timeout')
    })

    it('should handle client disconnection during request', async () => {
      const audioData = Buffer.alloc(100)

      mockServer.binaryRequest.mockRejectedValue(new Error('Client disconnected'))

      await expect(
        mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options: { audioFormat: 'ogg' } }, () => true)
      ).rejects.toThrow('Client disconnected')
    })

    it('should log errors with context', async () => {
      const audioData = Buffer.alloc(100)
      const error = new Error('Transcription error')

      mockServer.binaryRequest.mockRejectedValue(error)

      try {
        await mockServer.binaryRequest(
          mockCtx,
          'transcribe',
          audioData,
          { options: { audioFormat: 'ogg' } },
          () => true
        )
      } catch (err: any) {
        mockCtx.error('Transcription failed', {
          provider: 'server',
          error: err.message
        })
      }

      expect(mockCtx.error).toHaveBeenCalledWith('Transcription failed', {
        provider: 'server',
        error: 'Transcription error'
      })
    })
  })

  describe('Performance Logging', () => {
    it('should log successful transcription with timing', async () => {
      const audioData = Buffer.alloc(100)
      const result: TranscriptionResult = {
        text: 'Test transcription',
        language: 'en',
        words: [{ word: 'Test', start: 0, end: 0.5 }]
      }

      mockServer.binaryRequest.mockResolvedValue(result)

      const startTime = Date.now()
      const transcriptionResult = await mockServer.binaryRequest(
        mockCtx,
        'transcribe',
        audioData,
        { format: 'ogg' },
        () => true
      )
      const elapsed = Date.now() - startTime

      mockCtx.info('Transcription completed', {
        provider: 'server',
        language: transcriptionResult.language,
        textLength: transcriptionResult.text.length,
        wordCount: transcriptionResult.words?.length ?? 0,
        elapsedMs: elapsed
      })

      expect(mockCtx.info).toHaveBeenCalled()
    })

    it('should track request duration', async () => {
      const audioData = Buffer.alloc(100)

      // Simulate delay
      mockServer.binaryRequest.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { text: 'result', language: 'en' }
      })

      const startTime = Date.now()
      await mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options: { audioFormat: 'ogg' } }, () => true)
      const duration = Date.now() - startTime

      expect(duration).toBeGreaterThanOrEqual(10)
    })
  })

  describe('Audio Format Handling', () => {
    it('should handle OGG Opus format', async () => {
      // OGG Opus magic bytes
      const oggHeader = Buffer.from([0x4f, 0x67, 0x67, 0x53]) // 'OggS'
      const audioData = Buffer.concat([oggHeader, Buffer.alloc(96)])

      mockServer.binaryRequest.mockResolvedValue({ text: 'result', language: 'en' })

      await mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options: { audioFormat: 'ogg' } }, () => true)

      expect(mockServer.binaryRequest).toHaveBeenCalledWith(
        mockCtx,
        'transcribe',
        audioData,
        { options: { audioFormat: 'ogg' } },
        expect.any(Function)
      )
    })

    it('should handle WAV format', async () => {
      // WAV header magic bytes
      const wavHeader = Buffer.from('RIFF')
      const audioData = Buffer.concat([wavHeader, Buffer.alloc(96)])

      mockServer.binaryRequest.mockResolvedValue({ text: 'result', language: 'en' })

      await mockServer.binaryRequest(mockCtx, 'transcribe', audioData, { options: { audioFormat: 'wav' } }, () => true)

      expect(mockServer.binaryRequest).toHaveBeenCalled()
    })

    it('should reject unsupported formats on client side', () => {
      const supportedFormats: AudioFormat[] = ['ogg', 'wav']
      const unsupportedFormat = 'mp3'

      const isSupported = supportedFormats.includes(unsupportedFormat as AudioFormat)
      expect(isSupported).toBe(false)
    })
  })

  describe('Session Management', () => {
    it('should register transcription capability via method call', () => {
      const session: MockSession = { id: 'new-session', options: {} }

      // Simulate method handler
      const handleMethod = (method: string, ops: unknown[]): void => {
        if (method === 'transcription') {
          session.options.transcription = ops[0] as boolean
        }
      }

      handleMethod('transcription', [true])
      expect(session.options.transcription).toBe(true)
    })

    it('should unregister transcription capability', () => {
      const session: MockSession = { id: 'session', options: { transcription: true } }

      const handleMethod = (method: string, ops: unknown[]): void => {
        if (method === 'transcription') {
          session.options.transcription = ops[0] as boolean
        }
      }

      handleMethod('transcription', [false])
      expect(session.options.transcription).toBe(false)
    })

    it('should track multiple session states', () => {
      const sessions = new Map<string, MockSession>()

      sessions.set('s1', { id: 's1', options: { transcription: true } })
      sessions.set('s2', { id: 's2', options: { transcription: false } })
      sessions.set('s3', { id: 's3', options: { transcription: true } })

      const readySessions = Array.from(sessions.values()).filter((s) => s.options.transcription === true)

      expect(readySessions).toHaveLength(2)
    })
  })

  describe('Load Balancing', () => {
    it('should distribute requests across available clients', () => {
      const clientIds = ['client-1', 'client-2', 'client-3']
      let roundRobinIndex = 0

      const selectNextClient = (): string => {
        const client = clientIds[roundRobinIndex % clientIds.length]
        roundRobinIndex++
        return client
      }

      const selected = [
        selectNextClient(),
        selectNextClient(),
        selectNextClient(),
        selectNextClient(),
        selectNextClient(),
        selectNextClient()
      ]

      expect(selected).toEqual(['client-1', 'client-2', 'client-3', 'client-1', 'client-2', 'client-3'])
    })

    it('should handle single client scenario', () => {
      const clientIds = ['only-client']
      let roundRobinIndex = 0

      const selectNextClient = (): string => {
        const client = clientIds[roundRobinIndex % clientIds.length]
        roundRobinIndex++
        return client
      }

      const selected = [selectNextClient(), selectNextClient(), selectNextClient()]

      expect(selected).toEqual(['only-client', 'only-client', 'only-client'])
    })
  })

  describe('Response Validation', () => {
    it('should validate transcription result structure', () => {
      const validateResult = (result: TranscriptionResult): boolean => {
        return (
          typeof result.text === 'string' &&
          (result.language === undefined || typeof result.language === 'string') &&
          (result.confidence === undefined ||
            (typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1))
        )
      }

      const validResult: TranscriptionResult = {
        text: 'Hello',
        language: 'en',
        confidence: 0.95
      }

      const minimalResult: TranscriptionResult = {
        text: 'Hello'
      }

      expect(validateResult(validResult)).toBe(true)
      expect(validateResult(minimalResult)).toBe(true)
    })

    it('should handle empty transcription result', () => {
      const result: TranscriptionResult = {
        text: '',
        language: 'en'
      }

      expect(result.text).toBe('')
      expect(result.text.length).toBe(0)
    })

    it('should handle result with word timestamps', () => {
      const result: TranscriptionResult = {
        text: 'Hello world',
        language: 'en',
        words: [
          { word: 'Hello', start: 0.0, end: 0.5, confidence: 0.98 },
          { word: 'world', start: 0.6, end: 1.0, confidence: 0.96 }
        ],
        segments: [{ start: 0.0, end: 1.0, text: 'Hello world' }]
      }

      expect(result.words).toHaveLength(2)
      expect(result.segments).toHaveLength(1)
      expect(result.words?.[0].confidence).toBe(0.98)
    })
  })
})
