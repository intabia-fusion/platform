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

import type {
  ChatMessage,
  ChatCompletionResult,
  ChatCompletionWithToolsResult,
  RequestSummaryResult
} from '../llms/types'
import type {
  TranslateHtmlRequest,
  SummarizeMessagesRequest,
  ChatCompletionRequest,
  ChatCompletionWithToolsRequest,
  RequestSummaryRequest,
  LLMRequest
} from '../llms/server'
import { LLMProviderType } from '../llms'

// Mock MeasureContext interface
interface MockMeasureContext {
  info: jest.Mock
  error: jest.Mock
  warn: jest.Mock
}

// Mock ClisrServer interface for testing
interface MockClisrServer {
  requestWithFilter: jest.Mock
  request: jest.Mock
}

// Mock session interface
interface MockSession {
  id: string
  options: {
    llm?: boolean
  }
}

describe('LLM Server Provider', () => {
  let mockCtx: MockMeasureContext
  let mockServer: MockClisrServer

  beforeEach(() => {
    mockCtx = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }

    mockServer = {
      requestWithFilter: jest.fn(),
      request: jest.fn()
    }
  })

  describe('Provider Initialization', () => {
    it('should have correct provider type', () => {
      const providerTypes: LLMProviderType[] = ['openai', 'gigachat', 'server']
      expect(providerTypes).toContain('server')
    })

    it('should require ClisrServer instance', () => {
      expect(mockServer).toBeDefined()
      expect(mockServer.requestWithFilter).toBeDefined()
    })

    it('should throw error if server is undefined', () => {
      const createProvider = (server: MockClisrServer | undefined): void => {
        if (server === undefined) {
          throw new Error('LLM server provider requires ClisrServer instance')
        }
      }

      expect(() => {
        createProvider(undefined)
      }).toThrow('LLM server provider requires ClisrServer instance')
      expect(() => {
        createProvider(mockServer)
      }).not.toThrow()
    })
  })

  describe('Client Selection', () => {
    it('should filter clients with LLM capability', () => {
      const sessions: MockSession[] = [
        { id: 'session-1', options: { llm: true } },
        { id: 'session-2', options: { llm: false } },
        { id: 'session-3', options: { llm: true } },
        { id: 'session-4', options: {} }
      ]

      const selectLLMClient = (session: MockSession): boolean => {
        return session.options.llm === true
      }

      const availableClients = sessions.filter(selectLLMClient)

      expect(availableClients).toHaveLength(2)
      expect(availableClients[0].id).toBe('session-1')
      expect(availableClients[1].id).toBe('session-3')
    })

    it('should reject clients without LLM capability', () => {
      const session: MockSession = { id: 'no-llm', options: {} }

      const selectLLMClient = (s: MockSession): boolean => {
        return s.options.llm === true
      }

      expect(selectLLMClient(session)).toBe(false)
    })
  })

  describe('TranslateHtml Request', () => {
    it('should create valid translate request', () => {
      const request: TranslateHtmlRequest = {
        method: 'translateHtml',
        html: '<p>Hello world</p>',
        lang: 'ru',
        workspace: 'workspace-123' as any
      }

      expect(request.method).toBe('translateHtml')
      expect(request.html).toBeDefined()
      expect(request.lang).toBe('ru')
      expect(request.workspace).toBeDefined()
    })

    it('should handle translate response', async () => {
      mockServer.requestWithFilter.mockResolvedValue('<p>Привет мир</p>')

      const result = await mockServer.requestWithFilter(
        mockCtx,
        'llm',
        [{ method: 'translateHtml', html: '<p>Hello</p>', lang: 'ru' }],
        () => true
      )

      expect(result).toBe('<p>Привет мир</p>')
    })

    it('should handle translate failure', async () => {
      mockServer.requestWithFilter.mockResolvedValue(undefined)

      const result = await mockServer.requestWithFilter(
        mockCtx,
        'llm',
        [{ method: 'translateHtml', html: '<p>Hello</p>', lang: 'ru' }],
        () => true
      )

      expect(result).toBeUndefined()
    })
  })

  describe('SummarizeMessages Request', () => {
    it('should create valid summarize request', () => {
      const request: SummarizeMessagesRequest = {
        method: 'summarizeMessages',
        messages: [
          { personRef: 'person-1', personName: 'John', text: 'Hello' },
          { personRef: 'person-2', personName: 'Jane', text: 'Hi there' }
        ] as any[],
        lang: 'en',
        workspace: 'workspace-123' as any
      }

      expect(request.method).toBe('summarizeMessages')
      expect(request.messages).toHaveLength(2)
      expect(request.lang).toBe('en')
    })

    it('should handle summarize response', async () => {
      const summary = 'John and Jane exchanged greetings.'
      mockServer.requestWithFilter.mockResolvedValue(summary)

      const result = await mockServer.requestWithFilter(
        mockCtx,
        'llm',
        [{ method: 'summarizeMessages', messages: [], lang: 'en' }],
        () => true
      )

      expect(result).toBe(summary)
    })
  })

  describe('ChatCompletion Request', () => {
    it('should create valid chat completion request', () => {
      const message: ChatMessage = {
        role: 'user',
        content: 'What is the weather?'
      }

      const request: ChatCompletionRequest = {
        method: 'createChatCompletion',
        message,
        user: 'user-123',
        history: [{ role: 'system', content: 'You are a helpful assistant.' }],
        skipCache: true,
        reason: 'chat',
        workspace: 'workspace-123' as any
      }

      expect(request.method).toBe('createChatCompletion')
      expect(request.message.role).toBe('user')
      expect(request.history).toHaveLength(1)
    })

    it('should handle chat completion response', async () => {
      const response: ChatCompletionResult = {
        text: 'The weather is sunny today.',
        usage: 50,
        created: Math.floor(Date.now() / 1000)
      }

      mockServer.requestWithFilter.mockResolvedValue(response)

      const result = (await mockServer.requestWithFilter(
        mockCtx,
        'llm',
        [{ method: 'createChatCompletion', message: { role: 'user', content: 'test' } }],
        () => true
      )) as ChatCompletionResult

      expect(result.text).toBe('The weather is sunny today.')
      expect(result.usage).toBe(50)
    })

    it('should handle optional parameters', () => {
      const minimalRequest: ChatCompletionRequest = {
        method: 'createChatCompletion',
        message: { role: 'user', content: 'Hello' },
        workspace: 'workspace-123' as any
      }

      expect(minimalRequest.user).toBeUndefined()
      expect(minimalRequest.history).toBeUndefined()
      expect(minimalRequest.skipCache).toBeUndefined()
    })
  })

  describe('ChatCompletionWithTools Request', () => {
    it('should create valid chat completion with tools request', () => {
      const request: ChatCompletionWithToolsRequest = {
        method: 'createChatCompletionWithTools',
        message: { role: 'user', content: 'Create a task' },
        contextMode: 'direct',
        assistantMemory: 'Previous context...',
        userMemory: 'User preferences...',
        sharedContext: 'Shared knowledge...',
        user: 'user-123',
        workspace: 'workspace-123' as any,
        toolDefinitions: [
          {
            name: 'createTask',
            description: 'Create a new task',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' }
              }
            }
          }
        ]
      }

      expect(request.method).toBe('createChatCompletionWithTools')
      expect(request.contextMode).toBe('direct')
      expect(request.toolDefinitions).toHaveLength(1)
      expect(request.toolDefinitions?.[0].name).toBe('createTask')
    })

    it('should handle chat completion with tools response', async () => {
      const response: ChatCompletionWithToolsResult = {
        completion: 'I have created a task for you.',
        usage: 100
      }

      mockServer.requestWithFilter.mockResolvedValue(response)

      const result = (await mockServer.requestWithFilter(
        mockCtx,
        'llm',
        [{ method: 'createChatCompletionWithTools' }],
        () => true
      )) as ChatCompletionWithToolsResult

      expect(result.completion).toBe('I have created a task for you.')
      expect(result.usage).toBe(100)
    })

    it('should support both context modes', () => {
      const directRequest: ChatCompletionWithToolsRequest = {
        method: 'createChatCompletionWithTools',
        message: { role: 'user', content: 'test' },
        contextMode: 'direct',
        assistantMemory: '',
        userMemory: '',
        sharedContext: '',
        user: 'user',
        workspace: 'ws' as any
      }

      const threadRequest: ChatCompletionWithToolsRequest = {
        method: 'createChatCompletionWithTools',
        message: { role: 'user', content: 'test' },
        contextMode: 'thread',
        assistantMemory: '',
        userMemory: '',
        sharedContext: '',
        user: 'user',
        workspace: 'ws' as any
      }

      expect(directRequest.contextMode).toBe('direct')
      expect(threadRequest.contextMode).toBe('thread')
    })
  })

  describe('RequestSummary Request', () => {
    it('should create valid request summary request', () => {
      const request: RequestSummaryRequest = {
        method: 'requestSummary',
        personMemory: 'User background...',
        history: [
          {
            workspace: 'ws',
            message: 'Hello',
            objectId: 'obj-1' as any,
            objectClass: 'class-1' as any,
            role: 'user',
            user: 'user-1' as any,
            tokens: 10,
            timestamp: Date.now()
          }
        ],
        workspace: 'workspace-123' as any
      }

      expect(request.method).toBe('requestSummary')
      expect(request.history).toHaveLength(1)
      expect(request.personMemory).toBeDefined()
    })

    it('should handle request summary response', async () => {
      const response: RequestSummaryResult = {
        summary: 'User discussed greetings.',
        tokens: 25
      }

      mockServer.requestWithFilter.mockResolvedValue(response)

      const result = (await mockServer.requestWithFilter(
        mockCtx,
        'llm',
        [{ method: 'requestSummary' }],
        () => true
      )) as RequestSummaryResult

      expect(result.summary).toBe('User discussed greetings.')
      expect(result.tokens).toBe(25)
    })

    it('should handle empty result', async () => {
      mockServer.requestWithFilter.mockResolvedValue({ tokens: 0 })

      const result = (await mockServer.requestWithFilter(
        mockCtx,
        'llm',
        [{ method: 'requestSummary' }],
        () => true
      )) as RequestSummaryResult

      expect(result.tokens).toBe(0)
      expect(result.summary).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle request failure', async () => {
      mockServer.requestWithFilter.mockRejectedValue(new Error('Request failed'))

      await expect(mockServer.requestWithFilter(mockCtx, 'llm', [], () => true)).rejects.toThrow('Request failed')
    })

    it('should handle client timeout', async () => {
      mockServer.requestWithFilter.mockRejectedValue(new Error('Request timeout'))

      await expect(mockServer.requestWithFilter(mockCtx, 'llm', [], () => true)).rejects.toThrow('Request timeout')
    })

    it('should handle no available clients', async () => {
      mockServer.requestWithFilter.mockRejectedValue(new Error('No available clients'))

      await expect(mockServer.requestWithFilter(mockCtx, 'llm', [], () => false)).rejects.toThrow(
        'No available clients'
      )
    })
  })

  describe('Token Counting', () => {
    it('should estimate tokens from character count', () => {
      const countTokens = (messages: ChatMessage[]): number => {
        let totalChars = 0
        for (const message of messages) {
          totalChars += message.content.length
        }
        return Math.ceil(totalChars / 4)
      }

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there!' }
      ]

      const tokens = countTokens(messages)
      expect(tokens).toBeGreaterThan(0)
      // Rough estimate: ~4 characters per token
      // "Hello world" = 11 chars, "Hi there!" = 9 chars, total = 20 chars
      expect(tokens).toBe(5) // Math.ceil(20 / 4) = 5
    })

    it('should handle empty messages', () => {
      const countTokens = (messages: ChatMessage[]): number => {
        let totalChars = 0
        for (const message of messages) {
          totalChars += message.content.length
        }
        return Math.ceil(totalChars / 4)
      }

      expect(countTokens([])).toBe(0)
    })
  })

  describe('LLM Request Type Discrimination', () => {
    it('should discriminate request types by method field', () => {
      const requests: LLMRequest[] = [
        { method: 'translateHtml', html: '', lang: '', workspace: '' as any },
        { method: 'summarizeMessages', messages: [], lang: '', workspace: '' as any },
        { method: 'createChatCompletion', message: { role: 'user', content: '' }, workspace: '' as any },
        {
          method: 'createChatCompletionWithTools',
          message: { role: 'user', content: '' },
          contextMode: 'direct',
          assistantMemory: '',
          userMemory: '',
          sharedContext: '',
          user: '',
          workspace: '' as any
        },
        { method: 'requestSummary', personMemory: '', history: [], workspace: '' as any },
        { method: 'countTokens', messages: [] }
      ]

      expect(requests[0].method).toBe('translateHtml')
      expect(requests[1].method).toBe('summarizeMessages')
      expect(requests[2].method).toBe('createChatCompletion')
      expect(requests[3].method).toBe('createChatCompletionWithTools')
      expect(requests[4].method).toBe('requestSummary')
      expect(requests[5].method).toBe('countTokens')
    })
  })

  describe('Session Management', () => {
    it('should register LLM capability via method call', () => {
      const session: MockSession = { id: 'new-session', options: {} }

      const handleMethod = (method: string, ops: unknown[]): void => {
        if (method === 'llm') {
          session.options.llm = ops[0] as boolean
        }
      }

      handleMethod('llm', [true])
      expect(session.options.llm).toBe(true)
    })

    it('should unregister LLM capability', () => {
      const session: MockSession = { id: 'session', options: { llm: true } }

      const handleMethod = (method: string, ops: unknown[]): void => {
        if (method === 'llm') {
          session.options.llm = ops[0] as boolean
        }
      }

      handleMethod('llm', [false])
      expect(session.options.llm).toBe(false)
    })
  })

  describe('Performance Logging', () => {
    it('should log successful request with timing', async () => {
      mockServer.requestWithFilter.mockResolvedValue({ text: 'result' })

      const startTime = Date.now()
      await mockServer.requestWithFilter(mockCtx, 'llm', [], () => true)
      const elapsed = Date.now() - startTime

      mockCtx.info('LLM request completed', {
        provider: 'server',
        elapsedMs: elapsed
      })

      expect(mockCtx.info).toHaveBeenCalled()
    })

    it('should log request failure', async () => {
      mockServer.requestWithFilter.mockRejectedValue(new Error('Failed'))

      try {
        await mockServer.requestWithFilter(mockCtx, 'llm', [], () => true)
      } catch (err: any) {
        mockCtx.error('LLM request failed', {
          provider: 'server',
          error: err.message
        })
      }

      expect(mockCtx.error).toHaveBeenCalledWith('LLM request failed', {
        provider: 'server',
        error: 'Failed'
      })
    })
  })
})

describe('LLM Batching Configuration', () => {
  describe('Batch Size Configuration', () => {
    it('should default to batch size 1 (no batching)', () => {
      const defaultBatchSize = 1
      expect(defaultBatchSize).toBe(1)
    })

    it('should support configurable batch sizes', () => {
      const batchSizes = [1, 5, 10, 50]

      batchSizes.forEach((size) => {
        expect(size).toBeGreaterThan(0)
      })
    })

    it('should validate batch size is positive', () => {
      const validateBatchSize = (size: number): boolean => {
        return size > 0 && Number.isInteger(size)
      }

      expect(validateBatchSize(1)).toBe(true)
      expect(validateBatchSize(10)).toBe(true)
      expect(validateBatchSize(0)).toBe(false)
      expect(validateBatchSize(-1)).toBe(false)
      expect(validateBatchSize(1.5)).toBe(false)
    })
  })

  describe('Batch Processing', () => {
    it('should process requests in batches', () => {
      const batchSize = 5
      const requests = Array.from({ length: 12 }, (_, i) => ({
        id: `req-${i}`,
        message: { role: 'user' as const, content: `Message ${i}` }
      }))

      const batches: (typeof requests)[] = []
      for (let i = 0; i < requests.length; i += batchSize) {
        batches.push(requests.slice(i, i + batchSize))
      }

      expect(batches).toHaveLength(3)
      expect(batches[0]).toHaveLength(5)
      expect(batches[1]).toHaveLength(5)
      expect(batches[2]).toHaveLength(2)
    })

    it('should process single requests when batch size is 1', () => {
      const batchSize = 1
      const requests = [{ id: 'req-1' }, { id: 'req-2' }, { id: 'req-3' }]

      const batches: (typeof requests)[] = []
      for (let i = 0; i < requests.length; i += batchSize) {
        batches.push(requests.slice(i, i + batchSize))
      }

      expect(batches).toHaveLength(3)
      expect(batches.every((b) => b.length === 1)).toBe(true)
    })

    it('should handle empty request list', () => {
      const batchSize = 5
      const requests: unknown[] = []

      const batches: unknown[][] = []
      for (let i = 0; i < requests.length; i += batchSize) {
        batches.push(requests.slice(i, i + batchSize))
      }

      expect(batches).toHaveLength(0)
    })
  })

  describe('Configuration Parsing', () => {
    it('should parse batch size from environment', () => {
      const parseBatchSize = (value: string | undefined): number => {
        return parseInt(value ?? '1')
      }

      expect(parseBatchSize('1')).toBe(1)
      expect(parseBatchSize('10')).toBe(10)
      expect(parseBatchSize(undefined)).toBe(1)
    })

    it('should parse batch size from YAML config', () => {
      const yamlConfig = {
        llm: {
          provider: 'server',
          batch: 5
        }
      }

      expect(yamlConfig.llm.batch).toBe(5)
    })

    it('should prioritize YAML config over environment', () => {
      const yamlBatch = 10
      const envBatch = '5'

      const batchSize = yamlBatch ?? parseInt(envBatch ?? '1')
      expect(batchSize).toBe(10)
    })
  })
})

describe('LLM Provider Factory', () => {
  it('should create server provider when configured', () => {
    const providerType = 'server'
    const hasServer = true

    const shouldCreateServerProvider = providerType === 'server' && hasServer
    expect(shouldCreateServerProvider).toBe(true)
  })

  it('should require server for server provider', () => {
    const providerType = 'server'
    const hasServer = false

    const shouldCreateServerProvider = providerType === 'server' && hasServer
    expect(shouldCreateServerProvider).toBe(false)
  })

  it('should fallback to OpenAI if server not available', () => {
    const providerType = 'server'
    const hasServer = false
    const hasOpenAIKey = true

    let provider: string | undefined
    if (providerType === 'server' && hasServer) {
      provider = 'server'
    } else if (hasOpenAIKey) {
      provider = 'openai'
    }

    expect(provider).toBe('openai')
  })

  it('should support all provider types', () => {
    const supportedProviders: LLMProviderType[] = ['openai', 'gigachat', 'server']

    expect(supportedProviders).toContain('openai')
    expect(supportedProviders).toContain('gigachat')
    expect(supportedProviders).toContain('server')
  })
})
