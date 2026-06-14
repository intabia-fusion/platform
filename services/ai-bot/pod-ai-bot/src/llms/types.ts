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
 * Token usage for a single LLM call.
 * Source of truth is the provider `usage` from the API response; `approx` flags
 * results where the provider gave no usage and we fell back to local counting.
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  approx?: boolean
}

/** Total billable tokens for a usage record. */
export function totalTokens (usage?: TokenUsage): number {
  if (usage === undefined) return 0
  return usage.promptTokens + usage.completionTokens
}

/** Raw `usage` shape returned by OpenAI/GigaChat APIs. */
export interface ApiUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

/** Normalize a provider API `usage` object to `TokenUsage` (source of truth). */
export function usageFromApi (usage?: ApiUsage): TokenUsage | undefined {
  if (usage === undefined) return undefined
  return { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 }
}

/**
 * Result of a simple chat completion call.
 * - `text` contains the assistant output (if any)
 * - `usage` is the provider-reported token usage (prompt/completion split)
 * - `created` optionally carries provider returned timestamp (unix seconds)
 */
export interface ChatCompletionResult {
  text?: string
  usage?: TokenUsage
  created?: number
}

/**
 * Result of a tools-enabled chat completion run.
 * - `completion` is the final assistant output after any tool-thinking sections
 * - `usage` is the provider-reported token usage (prompt/completion split)
 */
export interface ChatCompletionWithToolsResult {
  completion?: string
  usage?: TokenUsage
}

/** Serializable tool definition (OpenAI function schema) passed to a provider step. */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** A tool call requested by the model (executed by the caller, not the provider). */
export interface ToolCall {
  id: string
  name: string
  arguments: string
}

/** Result of executing a tool call, fed back into the next model step. */
export interface ToolResult {
  id: string
  name: string
  content: string
  // Original call arguments, replayed so the model sees a consistent assistant turn.
  arguments?: string
}

/**
 * One step of a tool-using conversation: the model either returns final `content`
 * or requests `toolCalls`. The caller executes calls and resubmits results.
 */
export interface ChatToolStepResult {
  content?: string
  toolCalls?: ToolCall[]
  usage?: TokenUsage
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
    lang: string,
    description?: string
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
   * Run a single tool-using model step from raw, serializable tool definitions.
   *
   * Unlike `createChatCompletionWithTools`, this does NOT execute tools: it returns
   * the model's `toolCalls` (if any) so the caller can run them and resubmit
   * `priorToolResults`. Used by the clisr client, where tool execution happens on
   * the pod (which holds WorkspaceClient context), not on the model runner.
   *
   * Optional: providers without function-calling may omit it.
   */
  chatToolStep?: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    message: ChatMessage,
    contextMode: ContextMode,
    assistantMemory: string,
    userMemory: string,
    sharedContext: string,
    user: string,
    toolDefinitions: ToolDefinition[],
    priorToolResults: ToolResult[],
    history?: ChatMessage[],
    skipCache?: boolean,
    reason?: string
  ) => Promise<ChatToolStepResult | undefined>

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
