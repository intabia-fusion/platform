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
 * GigaChat-backed implementation of the LLMProvider interface.
 */

import GigaChat from 'gigachat'
import { encodingForModel, getEncoding } from 'js-tiktoken'

import type { MeasureContext, WorkspaceUuid } from '@hcengineering/core'
import type { PersonMessage } from '@hcengineering/ai-bot'
import contact from '@hcengineering/contact'
import type { HistoryRecord } from '../types'
import config from '../config'
import { pushTokensData } from '../billing'
import type {
  LLMProvider,
  ChatMessage,
  ChatCompletionResult,
  ChatCompletionWithToolsResult,
  RequestSummaryResult
} from './types'
import type { RunnableTools, BaseFunctionsArgs } from 'openai/lib/RunnableFunction'
import { PROMPTS } from './prompts'
import { Usage } from 'gigachat/interfaces'

export default class GigaChatProvider implements LLMProvider {
  private readonly client: GigaChat
  private readonly encoding: any // js-tiktoken doesn't have a direct encoding for GigaChat models

  constructor (readonly ctx: MeasureContext) {
    // Initialize GigaChat client with configuration
    this.client = new GigaChat({
      credentials: config.GigaChatCredentials ?? '',
      scope: config.GigaChatScope ?? 'GIGACHAT_API_PERS',
      model: config.GigaChatModel ?? 'GigaChat',
      baseUrl: config.GigaChatBaseUrl ?? 'https://gigachat.devices.sberbank.ru/api/v1/',
      timeout: config.GigaChatTimeout != null ? parseInt(config.GigaChatTimeout) : 600
    })

    // For token counting, we'll use a reasonable fallback since GigaChat models aren't in js-tiktoken
    // We'll use the cl100k_base encoding as a reasonable approximation
    try {
      this.encoding = encodingForModel('gpt-4')
    } catch {
      this.encoding = getEncoding('cl100k_base')
    }
  }

  toTokens (usage: Usage): number {
    return usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)
  }

  async translateHtml (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    html: string,
    lang: string
  ): Promise<string | undefined> {
    try {
      const response = await this.client.chat({
        messages: [
          {
            role: 'system',
            content: PROMPTS.TRANSLATE_HTML(lang)
          },
          {
            role: 'user',
            content: html
          }
        ],
        model: config.GigaChatModel ?? 'GigaChat'
      })

      const responseText = response.choices?.[0]?.message?.content ?? undefined
      const usage = this.toTokens(response.usage)

      if (usage !== 0) {
        void pushTokensData(ctx, [
          {
            workspace,
            reason: 'manual-translate',
            tokens: usage,
            date: new Date().toISOString()
          }
        ])
      }

      return responseText
    } catch (error) {
      console.error('GigaChat translation error:', error)
      return undefined
    }
  }

  async summarizeMessages (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    messages: PersonMessage[],
    lang: string
  ): Promise<string | undefined> {
    try {
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

      const response = await this.client.chat({
        messages: [
          {
            role: 'system',
            content: PROMPTS.SUMMARIZE_MESSAGES(lang)
          },
          {
            role: 'user',
            content: text
          }
        ],
        model: config.GigaChatModel ?? 'GigaChat'
      })

      const usage = this.toTokens(response.usage)
      if (usage !== 0) {
        void pushTokensData(ctx, [
          {
            workspace,
            reason: 'summarize',
            tokens: usage,
            date: new Date().toISOString()
          }
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
        responseText = responseText.replace(new RegExp(`\\*\\*@${name}\\*\\*`, 'g'), refString)
      }

      return responseText
    } catch (error) {
      console.error('GigaChat summarization error:', error)
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
    try {
      const systemContent = history
        .filter((it) => it.role === 'system')
        .map((it) => it.content)
        .join('\n')
      const response = await this.client.chat({
        messages: [
          {
            role: 'system',
            content: systemContent
          },
          ...history.filter((it) => it.role !== 'system'),
          message as any
        ],
        model: config.GigaChatModel ?? 'GigaChat',
        user
      })

      const text = response.choices?.[0]?.message?.content ?? undefined
      const usage = this.toTokens(response.usage)
      const created = Math.floor(Date.now() / 1000) // Unix timestamp

      if (usage !== 0) {
        void pushTokensData(ctx, [
          {
            workspace,
            reason: 'complete',
            tokens: usage,
            date: new Date().toISOString()
          }
        ])
      }

      return { text, usage, created }
    } catch (error) {
      console.error('GigaChat chat completion error:', error)
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
    reason = 'chat'
  ): Promise<ChatCompletionWithToolsResult | undefined> {
    try {
      const isDirectMode = contextMode === 'direct'

      // Join all other system prompts in history
      const systemMessages = history.filter((it) => it.role === 'system')

      const systemPrompt = isDirectMode
        ? PROMPTS.DIRECT_CHAT_WITH_TOOLS({ assistantMemory, userMemory, sharedContext })
        : PROMPTS.THREAD_CHAT_WITH_TOOLS({ sharedContext }) + '\n\n' + systemMessages.map((it) => it.content).join('\n')

      // Note: GigaChat doesn't have the same tooling system as OpenAI, so we'll need to adapt
      // For now, we'll send the message without tools since GigaChat's function calling is different
      const response = await this.client.chat({
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          ...(history.filter((it) => it.role !== 'system') as any[]),
          message as any
        ],
        model: config.GigaChatModel ?? 'GigaChat',
        user
      })

      const str = response.choices?.[0]?.message?.content ?? undefined
      const usage = this.toTokens(response.usage)

      if (usage !== 0) {
        void pushTokensData(ctx, [
          {
            workspace,
            reason,
            tokens: usage,
            date: new Date().toISOString()
          }
        ])
      }

      return {
        completion: str ?? undefined,
        usage
      }
    } catch (error) {
      console.error('GigaChat tools completion error:', error)
    }

    return undefined
  }

  async requestSummary (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    personMemory: string,
    history: HistoryRecord[]
  ): Promise<RequestSummaryResult> {
    try {
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

      // Use the encoding to count tokens
      const tokens = response?.usage ?? this.countTokens([{ content: summary, role: 'assistant' as const }])

      if (tokens !== 0) {
        void pushTokensData(ctx, [
          {
            workspace,
            reason: 'summarize',
            tokens,
            date: new Date().toISOString()
          }
        ])
      }

      return { summary, tokens }
    } catch (error) {
      console.error('GigaChat request summary error:', error)
      return { tokens: 0 }
    }
  }

  countTokens (messages: ChatMessage[]): number {
    try {
      // For GigaChat, we'll use the cl100k_base encoding as an approximation
      // since GigaChat models aren't directly supported by js-tiktoken
      let text = ''
      for (const message of messages) {
        text += message.content + ' '
      }
      return this.encoding.encode(text).length
    } catch {
      // Best-effort fallback: return 0 if token counting fails for any reason
      return 0
    }
  }
}

/**
 * Helper factory to create GigaChat provider when GigaChat is configured.
 */
export function createGigaChatProvider (ctx: MeasureContext): LLMProvider | undefined {
  if (config.GigaChatCredentials !== '') {
    return new GigaChatProvider(ctx)
  }
  return undefined
}
