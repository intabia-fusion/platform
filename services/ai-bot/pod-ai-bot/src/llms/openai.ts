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
 * OpenAI-backed implementation of the LLMProvider interface.
 */

import { encodingForModel, getEncoding, Tiktoken } from 'js-tiktoken'
import OpenAI from 'openai'

import type { MeasureContext, WorkspaceUuid } from '@hcengineering/core'
import type { PersonMessage } from '@hcengineering/ai-bot'
import contact from '@hcengineering/contact'
import type { HistoryRecord } from '../types'
import config, { type AILevel, type AIProviderConfig } from '../config'
import { providerLevels } from './modelRegistry'
import { countTokens } from '@hcengineering/openai'
import { pushTokensData, tokensRecord } from '../billing'
import type {
  LLMProvider,
  ChatMessage,
  ChatCompletionResult,
  ChatCompletionWithToolsResult,
  RequestSummaryResult,
  ContextMode,
  ToolDefinition,
  ToolResult,
  ChatToolStepResult
} from './types'
import { totalTokens, usageFromApi } from './types'
import type { RunnableTools, BaseFunctionsArgs } from 'openai/lib/RunnableFunction'
import { PROMPTS } from './prompts'

export default class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly encoding: Tiktoken
  private readonly provider: AIProviderConfig
  private readonly defaultLevel: AILevel

  constructor (
    readonly ctx: MeasureContext,
    provider: AIProviderConfig
  ) {
    this.provider = provider
    // strongest served level is the default for service ops (translate/summary),
    // resolved by `order` so custom level ids work (not a hardcoded list)
    const served = providerLevels(provider)
    this.defaultLevel = served[served.length - 1] ?? 'low'

    this.client = new OpenAI({
      apiKey: (provider.endpointConfig?.apiKey as string) ?? config.OpenAIKey,
      baseURL: provider.endpoint ?? (config.OpenAIBaseUrl === '' ? undefined : config.OpenAIBaseUrl)
    })

    // Try to obtain encoding for the default model; fallback to universal encoding.
    this.encoding = (() => {
      try {
        return encodingForModel(this.modelFor(this.defaultLevel) as any)
      } catch {
        return getEncoding('cl100k_base')
      }
    })()
  }

  /** Resolve the concrete model name for a level, falling back to the default level. */
  private modelFor (level?: AILevel): string {
    const lvl = level ?? this.defaultLevel
    return this.provider.levels[lvl]?.model ?? this.provider.levels[this.defaultLevel]?.model ?? config.OpenAIModel
  }

  /** Billing multiplier + model id for a level (used to bill tokens). */
  private billingFor (level?: AILevel): { multiplier: number, modelId: string } {
    const lvl = level ?? this.defaultLevel
    const m = this.provider.levels[lvl] ?? this.provider.levels[this.defaultLevel]
    return { multiplier: m?.tokenMultiplier ?? 1, modelId: m?.model ?? this.modelFor(level) }
  }

  async translateHtml (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    html: string,
    lang: string
  ): Promise<string | undefined> {
    const response = await this.client.chat.completions.create({
      model: this.modelFor(),
      messages: [
        {
          role: 'system',
          content: PROMPTS.TRANSLATE_HTML(lang)
        },
        {
          role: 'user',
          content: html
        }
      ]
    })

    const responseText = response.choices?.[0]?.message?.content ?? undefined

    const usage = usageFromApi(response.usage)
    const total = totalTokens(usage)
    if (total !== 0 && usage !== undefined) {
      const { multiplier, modelId } = this.billingFor()
      void pushTokensData(ctx, [
        tokensRecord(
          workspace,
          usage.promptTokens,
          usage.completionTokens,
          multiplier,
          'manual-translate',
          modelId,
          new Date((response.created ?? Date.now() / 1000) * 1000).toISOString()
        )
      ])
    }

    return responseText
  }

  async summarizeMessages (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    messages: PersonMessage[],
    lang: string,
    description?: string
  ): Promise<string | undefined> {
    // Build person name map
    const personToName = new Map<string, string>()
    for (const m of messages) {
      if (!personToName.has(m.personRef)) {
        personToName.set(m.personRef, m.personName)
      }
    }

    // Disambiguate identical names
    const nameUsage = new Map<string, number>()
    for (const [personRef, name] of personToName) {
      const idx = nameUsage.get(name) ?? 0
      if (idx > 0) {
        personToName.set(personRef, name + ` no.${idx}`)
      }
      nameUsage.set(name, idx + 1)
    }

    const text = messages.map((p) => `---\n\n@${p.personName}\n${p.text}`).join('\n\n')

    const response = await this.client.chat.completions.create({
      model: this.modelFor(),
      messages: [
        {
          role: 'system',
          content: PROMPTS.SUMMARIZE_MESSAGES(lang, description)
        },
        {
          role: 'user',
          content: text
        }
      ]
    })

    const usage = usageFromApi(response.usage)
    const total = totalTokens(usage)
    if (total !== 0 && usage !== undefined) {
      const { multiplier, modelId } = this.billingFor()
      void pushTokensData(ctx, [
        tokensRecord(
          workspace,
          usage.promptTokens,
          usage.completionTokens,
          multiplier,
          'summarize',
          modelId,
          new Date((response.created ?? Date.now() / 1000) * 1000).toISOString()
        )
      ])
    }

    let responseText = response.choices?.[0]?.message?.content ?? undefined
    if (responseText === undefined) return undefined

    // Replace bolded participant names with internal ref syntax
    const classURI = encodeURIComponent(contact.class.Contact)
    for (const [personRef, name] of personToName) {
      const idURI = encodeURIComponent(personRef)
      const nameURI = encodeURIComponent(name)
      const refString = `[](ref://?_class=${classURI}&_id=${idURI}&label=${nameURI})`
      responseText = responseText.replaceAll(`**@${name}**`, refString)
    }

    return responseText
  }

  async createChatCompletion (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    message: ChatMessage,
    user?: string,
    history: ChatMessage[] = [],
    skipCache = true,
    reason = 'chat',
    level?: AILevel
  ): Promise<ChatCompletionResult | undefined> {
    const opt: OpenAI.RequestOptions = {}
    if (skipCache) {
      opt.headers = { 'cf-skip-cache': 'true' }
    }
    try {
      const systemContent = history
        .filter((it) => it.role === 'system')
        .map((it) => it.content)
        .join('\n')
      const response = await this.client.chat.completions.create(
        {
          messages: [
            {
              role: 'system',
              content: systemContent
            },
            ...history.filter((it) => it.role !== 'system'),
            message as any
          ],
          model: this.modelFor(level),
          user,
          stream: false
        },
        opt
      )

      const text = response.choices?.[0]?.message?.content ?? undefined
      const created = response.created

      const usage = usageFromApi(response.usage)
      const total = totalTokens(usage)
      if (total !== 0 && usage !== undefined) {
        const { multiplier, modelId } = this.billingFor(level)
        void pushTokensData(ctx, [
          tokensRecord(
            workspace,
            usage.promptTokens,
            usage.completionTokens,
            multiplier,
            reason,
            modelId,
            new Date((response.created ?? Date.now() / 1000) * 1000).toISOString()
          )
        ])
      }

      return { text, usage, created }
    } catch (e) {
      console.error(e)
    }

    return undefined
  }

  async createChatCompletionWithTools (
    tools: RunnableTools<BaseFunctionsArgs>,
    message: ChatMessage,
    contextMode: 'direct' | 'thread',
    assistantMemory: string,
    userMemory: string,
    sharedContext: string,
    user: string,
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    history: ChatMessage[] = [],
    skipCache = true,
    reason = 'chat',
    level?: AILevel
  ): Promise<ChatCompletionWithToolsResult | undefined> {
    const opt: OpenAI.RequestOptions = {}
    const date = new Date()
    if (skipCache) {
      opt.headers = { 'cf-skip-cache': 'true' }
    }

    try {
      const isDirectMode = contextMode === 'direct'

      // Join all other system prompts in history
      const systemMessages = history.filter((it) => it.role === 'system')

      const systemPrompt = isDirectMode
        ? PROMPTS.DIRECT_CHAT_WITH_TOOLS({ assistantMemory, userMemory, sharedContext })
        : PROMPTS.THREAD_CHAT_WITH_TOOLS({ sharedContext }) + '\n\n' + systemMessages.map((it) => it.content).join('\n')

      const res = this.client.beta.chat.completions.runTools(
        {
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            ...(history as any[]),
            message as any
          ],
          model: this.modelFor(level),
          user,
          tools
        },
        opt
      )

      let str = await res.finalContent()
      const usage = usageFromApi(await res.totalUsage())

      const pos = (str ?? '').indexOf('</think>')
      if (pos > 0) {
        str = (str ?? '').substring(pos + 8)
      }

      const total = totalTokens(usage)
      if (total !== 0 && usage !== undefined) {
        const { multiplier, modelId } = this.billingFor(level)
        void pushTokensData(ctx, [
          tokensRecord(
            workspace,
            usage.promptTokens,
            usage.completionTokens,
            multiplier,
            reason,
            modelId,
            date.toISOString()
          )
        ])
      }

      return {
        completion: str ?? undefined,
        usage
      }
    } catch (e) {
      console.error(e)
    }

    return undefined
  }

  async chatToolStep (
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
    history: ChatMessage[] = [],
    skipCache = true,
    reason = 'chat',
    level?: AILevel
  ): Promise<ChatToolStepResult | undefined> {
    const opt: OpenAI.RequestOptions = {}
    if (skipCache) {
      opt.headers = { 'cf-skip-cache': 'true' }
    }

    try {
      const isDirectMode = contextMode === 'direct'
      const systemMessages = history.filter((it) => it.role === 'system')
      const systemPrompt = isDirectMode
        ? PROMPTS.DIRECT_CHAT_WITH_TOOLS({ assistantMemory, userMemory, sharedContext })
        : PROMPTS.THREAD_CHAT_WITH_TOOLS({ sharedContext }) + '\n\n' + systemMessages.map((it) => it.content).join('\n')

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...history.filter((it) => it.role !== 'system'),
        message
      ]
      // Replay prior tool results so the model continues where it left off.
      // Reconstruct the assistant tool_call turn + its result for a consistent transcript.
      for (const tr of priorToolResults) {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [{ id: tr.id, type: 'function', function: { name: tr.name, arguments: tr.arguments ?? '{}' } }]
        })
        messages.push({ role: 'tool', tool_call_id: tr.id, content: tr.content })
      }

      const tools =
        toolDefinitions.length > 0
          ? toolDefinitions.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters }
          }))
          : undefined

      const response = await this.client.chat.completions.create(
        { messages, model: this.modelFor(level), user, tools, stream: false },
        opt
      )

      const choice = response.choices?.[0]?.message
      const usage = usageFromApi(response.usage)
      const total = totalTokens(usage)
      if (total !== 0 && usage !== undefined) {
        const { multiplier, modelId } = this.billingFor(level)
        void pushTokensData(ctx, [
          tokensRecord(
            workspace,
            usage.promptTokens,
            usage.completionTokens,
            multiplier,
            reason,
            modelId,
            new Date((response.created ?? Date.now() / 1000) * 1000).toISOString()
          )
        ])
      }

      const rawCalls = choice?.tool_calls ?? []
      if (rawCalls.length > 0) {
        return {
          toolCalls: rawCalls.map((c: any) => ({
            id: c.id,
            name: c.function?.name ?? '',
            arguments: c.function?.arguments ?? ''
          })),
          usage
        }
      }

      return { content: choice?.content ?? undefined, usage }
    } catch (e) {
      console.error(e)
    }

    return undefined
  }

  async requestSummary (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    personMemory: string,
    history: HistoryRecord[]
  ): Promise<RequestSummaryResult> {
    const summaryPrompt: { content: string, role: 'user' } = {
      content: PROMPTS.SUMMARY_USER_PROMPT(history),
      role: 'user'
    }

    const response = await this.createChatCompletion(ctx, workspace, summaryPrompt as any, undefined, [
      {
        role: 'system',
        content: PROMPTS.SUMMARY_SYSTEM_PROMPT
      }
    ])

    const summary = response?.text

    if (summary == null) {
      return { tokens: 0 }
    }

    const usageTokens = totalTokens(response?.usage)
    const tokens = usageTokens > 0 ? usageTokens : countTokens([{ content: summary, role: 'assistant' }], this.encoding)

    if (tokens !== 0) {
      const date = new Date((response?.created ?? Date.now() / 1000) * 1000).toISOString()
      const ru = response?.usage
      if (ru !== undefined) {
        const { multiplier, modelId } = this.billingFor()
        void pushTokensData(ctx, [
          tokensRecord(workspace, ru.promptTokens, ru.completionTokens, multiplier, 'summarize', modelId, date)
        ])
      } else {
        void pushTokensData(ctx, [{ workspace, reason: 'summarize', tokens, date }])
      }
    }

    return { summary, tokens }
  }

  countTokens (messages: ChatMessage[]): number {
    try {
      return countTokens(messages as any, this.encoding)
    } catch {
      // Best-effort fallback: return 0 if token counting fails for any reason
      return 0
    }
  }
}

/**
 * Helper factory to create an OpenAI provider for a registry provider config.
 * Returns undefined when neither the provider nor the global config supplies an API key.
 */
export function createOpenAIProvider (ctx: MeasureContext, provider: AIProviderConfig): LLMProvider | undefined {
  const apiKey = (provider.endpointConfig?.apiKey as string) ?? config.OpenAIKey
  if (apiKey !== '') {
    return new OpenAIProvider(ctx, provider)
  }
  return undefined
}
