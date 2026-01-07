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

import type { MeasureContext, WorkspaceUuid } from '@hcengineering/core'
import type { PersonMessage } from '@hcengineering/ai-bot'
import type { HistoryRecord } from '../types'
import type { RunnableTools, BaseFunctionsArgs } from 'openai/lib/RunnableFunction'

/**
 * Simple chat message shape used for conversation context.
 * This intentionally mirrors common LLM SDK message formats.
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Result of a simple chat completion call.
 * - `text` contains the assistant output (if any)
 * - `usage` is an optional token usage estimate (provider-normalized)
 * - `created` optionally carries provider returned timestamp (unix seconds)
 */
export interface ChatCompletionResult {
  text?: string
  usage?: number
  created?: number
}

/**
 * Result of a tools-enabled chat completion run.
 * - `completion` is the final assistant output after any tool-thinking sections
 * - `usage` is an optional token usage estimate
 */
export interface ChatCompletionWithToolsResult {
  completion?: string
  usage?: number
}

/**
 * Result for summary request - summary and effective token count.
 */
export interface RequestSummaryResult {
  summary?: string
  tokens: number
}

/**
 * Context mode used when creating completions with tools.
 */
export type ContextMode = 'direct' | 'thread'

/**
 * Main LLM provider interface.
 *
 * Implementations must provide these methods. Keep implementations
 * robust (catch errors internally) – callers often expect `undefined`
 * when the provider cannot fulfill the request.
 */
export interface LLMProvider {
  /**
   * Translate HTML while preserving structure and metadata.
   */
  translateHtml: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    html: string,
    lang: string
  ) => Promise<string | undefined>

  /**
   * Create a summary from a sequence of person messages.
   */
  summarizeMessages: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    messages: PersonMessage[],
    lang: string
  ) => Promise<string | undefined>

  /**
   * Create a standard chat completion.
   * - `message` is the user/system prompt
   * - `history` are prior messages in helper shape
   * Returns normalized result (text + usage).
   */
  createChatCompletion: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    message: ChatMessage,
    user?: string,
    history?: ChatMessage[],
    skipCache?: boolean,
    reason?: string
  ) => Promise<ChatCompletionResult | undefined>

  /**
   * Create a chat completion that can use tools (provider-specific).
   * Tools are pre-built and passed ready to use; provider just needs to execute them.
   * This keeps the provider abstraction clean - callers handle WorkspaceClient context.
   */
  createChatCompletionWithTools: (
    tools: RunnableTools<BaseFunctionsArgs>,
    message: ChatMessage,
    contextMode: ContextMode,
    assistantMemory: string,
    userMemory: string,
    sharedContext: string,
    user: string,
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    history?: ChatMessage[],
    skipCache?: boolean,
    reason?: string
  ) => Promise<ChatCompletionWithToolsResult | undefined>

  /**
   * Request a compact, factual summary of conversation history.
   * The provider may use its own token counting/encoding internally.
   */
  requestSummary: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    personMemory: string,
    history: HistoryRecord[]
  ) => Promise<RequestSummaryResult>

  /**
   * Best-effort token counting for a sequence of `ChatMessage`.
   * Providers should implement this using a suitable tokenizer/encoding.
   */
  countTokens: (messages: ChatMessage[]) => number
}

/**
 * Factory signature used to create providers from environment/config.
 */
export type LLMFactory = (ctx: MeasureContext) => LLMProvider | undefined
