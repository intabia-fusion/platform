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

/**
 * Server-backed implementation of the LLMProvider interface.
 * Distributes LLM requests to connected external clients via Clisr.
 */

import type { MeasureContext, WorkspaceUuid } from '@hcengineering/core'
import type { PersonMessage } from '@hcengineering/ai-bot'
import type { HistoryRecord } from '../types'
import type {
  LLMProvider,
  ChatMessage,
  ChatCompletionResult,
  ChatCompletionWithToolsResult,
  RequestSummaryResult,
  ContextMode
} from './types'
import type { RunnableTools, BaseFunctionsArgs } from 'openai/lib/RunnableFunction'
import { ClisrServer } from '@intabiafusion/clisr'

/**
 * Request types for server provider methods
 */
export interface TranslateHtmlRequest {
  method: 'translateHtml'
  html: string
  lang: string
  workspace: WorkspaceUuid
}

export interface SummarizeMessagesRequest {
  method: 'summarizeMessages'
  messages: PersonMessage[]
  lang: string
  workspace: WorkspaceUuid
}

export interface ChatCompletionRequest {
  method: 'createChatCompletion'
  message: ChatMessage
  user?: string
  history?: ChatMessage[]
  skipCache?: boolean
  reason?: string
  workspace: WorkspaceUuid
}

export interface ChatCompletionWithToolsRequest {
  method: 'createChatCompletionWithTools'
  message: ChatMessage
  contextMode: ContextMode
  assistantMemory: string
  userMemory: string
  sharedContext: string
  user: string
  history?: ChatMessage[]
  skipCache?: boolean
  reason?: string
  workspace: WorkspaceUuid
  // Note: tools are not serializable, so we pass tool definitions instead
  toolDefinitions?: Array<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
}

export interface RequestSummaryRequest {
  method: 'requestSummary'
  personMemory: string
  history: HistoryRecord[]
  workspace: WorkspaceUuid
}

export interface CountTokensRequest {
  method: 'countTokens'
  messages: ChatMessage[]
}

export type LLMRequest =
  | TranslateHtmlRequest
  | SummarizeMessagesRequest
  | ChatCompletionRequest
  | ChatCompletionWithToolsRequest
  | RequestSummaryRequest
  | CountTokensRequest

/**
 * Server provider that distributes LLM requests to connected clients via Clisr
 */
export default class ServerLLMProvider implements LLMProvider {
  constructor (
    private readonly ctx: MeasureContext,
    private readonly server: ClisrServer
  ) {}

  /**
   * Select clients that have LLM capability enabled
   */
  private readonly selectLLMClient = (session: { options: { llm?: boolean } }): boolean => {
    return session.options.llm === true
  }

  async translateHtml (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    html: string,
    lang: string
  ): Promise<string | undefined> {
    const startTime = Date.now()

    try {
      const request: TranslateHtmlRequest = {
        method: 'translateHtml',
        html,
        lang,
        workspace
      }

      const result = await this.server.requestWithFilter(ctx, 'llm', [request], this.selectLLMClient)

      const elapsed = Date.now() - startTime
      this.ctx.info('Server LLM translateHtml completed', {
        provider: 'server',
        workspace,
        lang,
        elapsedMs: elapsed
      })

      return result
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      this.ctx.error('Server LLM translateHtml failed', {
        provider: 'server',
        workspace,
        error: err.message,
        elapsedMs: elapsed
      })
      return undefined
    }
  }

  async summarizeMessages (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    messages: PersonMessage[],
    lang: string
  ): Promise<string | undefined> {
    const startTime = Date.now()

    try {
      const request: SummarizeMessagesRequest = {
        method: 'summarizeMessages',
        messages,
        lang,
        workspace
      }

      const result = await this.server.requestWithFilter(ctx, 'llm', [request], this.selectLLMClient)

      const elapsed = Date.now() - startTime
      this.ctx.info('Server LLM summarizeMessages completed', {
        provider: 'server',
        workspace,
        messageCount: messages.length,
        elapsedMs: elapsed
      })

      return result
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      this.ctx.error('Server LLM summarizeMessages failed', {
        provider: 'server',
        workspace,
        error: err.message,
        elapsedMs: elapsed
      })
      return undefined
    }
  }

  async createChatCompletion (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    message: ChatMessage,
    user?: string,
    history: ChatMessage[] = [],
    skipCache = true,
    reason = 'chat'
  ): Promise<ChatCompletionResult | undefined> {
    const startTime = Date.now()

    try {
      const request: ChatCompletionRequest = {
        method: 'createChatCompletion',
        message,
        user,
        history,
        skipCache,
        reason,
        workspace
      }

      const result = (await this.server.requestWithFilter(ctx, 'llm', [request], this.selectLLMClient)) as
        | ChatCompletionResult
        | undefined

      const elapsed = Date.now() - startTime
      this.ctx.info('Server LLM createChatCompletion completed', {
        provider: 'server',
        workspace,
        reason,
        hasResult: result !== undefined,
        elapsedMs: elapsed
      })

      return result
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      this.ctx.error('Server LLM createChatCompletion failed', {
        provider: 'server',
        workspace,
        reason,
        error: err.message,
        elapsedMs: elapsed
      })
      return undefined
    }
  }

  async createChatCompletionWithTools (
    tools: RunnableTools<BaseFunctionsArgs>,
    message: ChatMessage,
    contextMode: ContextMode,
    assistantMemory: string,
    userMemory: string,
    sharedContext: string,
    user: string,
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    history: ChatMessage[] = [],
    skipCache = true,
    reason = 'chat'
  ): Promise<ChatCompletionWithToolsResult | undefined> {
    const startTime = Date.now()

    try {
      // Extract tool definitions (tools themselves are not serializable)
      const toolDefinitions = tools.map((tool) => ({
        name: tool.function.name ?? '',
        description: tool.function.description ?? '',
        parameters: tool.function.parameters as Record<string, unknown>
      }))

      const request: ChatCompletionWithToolsRequest = {
        method: 'createChatCompletionWithTools',
        message,
        contextMode,
        assistantMemory,
        userMemory,
        sharedContext,
        user,
        history,
        skipCache,
        reason,
        workspace,
        toolDefinitions
      }

      const result = (await this.server.requestWithFilter(ctx, 'llm', [request], this.selectLLMClient)) as
        | ChatCompletionWithToolsResult
        | undefined

      const elapsed = Date.now() - startTime
      this.ctx.info('Server LLM createChatCompletionWithTools completed', {
        provider: 'server',
        workspace,
        contextMode,
        reason,
        toolCount: toolDefinitions.length,
        hasResult: result !== undefined,
        elapsedMs: elapsed
      })

      return result
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      this.ctx.error('Server LLM createChatCompletionWithTools failed', {
        provider: 'server',
        workspace,
        contextMode,
        reason,
        error: err.message,
        elapsedMs: elapsed
      })
      return undefined
    }
  }

  async requestSummary (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    personMemory: string,
    history: HistoryRecord[]
  ): Promise<RequestSummaryResult> {
    const startTime = Date.now()

    try {
      const request: RequestSummaryRequest = {
        method: 'requestSummary',
        personMemory,
        history,
        workspace
      }

      const result = (await this.server.requestWithFilter(ctx, 'llm', [request], this.selectLLMClient)) as
        | RequestSummaryResult
        | undefined

      const elapsed = Date.now() - startTime
      this.ctx.info('Server LLM requestSummary completed', {
        provider: 'server',
        workspace,
        historyCount: history.length,
        hasResult: result?.summary !== undefined,
        elapsedMs: elapsed
      })

      return result ?? { tokens: 0 }
    } catch (err: any) {
      const elapsed = Date.now() - startTime
      this.ctx.error('Server LLM requestSummary failed', {
        provider: 'server',
        workspace,
        error: err.message,
        elapsedMs: elapsed
      })
      return { tokens: 0 }
    }
  }

  countTokens (messages: ChatMessage[]): number {
    // For server provider, we can't easily count tokens locally
    // Return a rough estimate based on character count
    // Actual token counting should be done on the client side
    let totalChars = 0
    for (const message of messages) {
      totalChars += message.content.length
    }
    // Rough estimate: ~4 characters per token for English text
    return Math.ceil(totalChars / 4)
  }
}

/**
 * Factory function to create a server LLM provider
 */
export function createServerLLMProvider (ctx: MeasureContext, server: ClisrServer): ServerLLMProvider {
  return new ServerLLMProvider(ctx, server)
}
