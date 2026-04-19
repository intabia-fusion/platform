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
import config from '../config'
import { countTokens } from '@hcengineering/openai'
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
import { CompletionUsage } from 'openai/resources/completions'

export default class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI
  private readonly encoding: Tiktoken

  constructor (readonly ctx: MeasureContext) {
    this.client = new OpenAI({
      apiKey: config.OpenAIKey,
      baseURL: config.OpenAIBaseUrl === '' ? undefined : config.OpenAIBaseUrl
    })

    // Try to obtain encoding for configured model; fallback to universal encoding.
    this.encoding = (() => {
      try {
        return encodingForModel(config.OpenAIModel as any)
      } catch {
        return getEncoding('cl100k_base')
      }
    })()
  }

  toTokens (usage?: CompletionUsage): number {
    if (usage === undefined) {
      return 0
    }
    return usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)
  }

  async translateHtml (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    html: string,
    lang: string
  ): Promise<string | undefined> {
    const response = await this.client.chat.completions.create({
      model: config.OpenAISummaryModel,
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

    const usage = this.toTokens(response.usage)
    if (usage !== 0) {
      void pushTokensData(ctx, [
        {
          workspace,
          reason: 'manual-translate',
          tokens: usage,
          date: new Date((response.created ?? Date.now() / 1000) * 1000).toISOString()
        }
      ])
    }

    return responseText
  }

  async summarizeMessages (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    messages: PersonMessage[],
    lang: string
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
      model: config.OpenAIModel,
      messages: [
        {
          role: 'system',
          content: PROMPTS.SUMMARIZE_MESSAGES(lang)
        },
        {
          role: 'user',
          content: text
        }
      ]
    })

    const usage = this.toTokens(response.usage)
    if (usage !== 0) {
      void pushTokensData(ctx, [
        {
          workspace,
          reason: 'summarize',
          tokens: usage,
          date: new Date((response.created ?? Date.now() / 1000) * 1000).toISOString()
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
    reason = 'chat'
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
          model: config.OpenAIModel,
          user,
          stream: false
        },
        opt
      )

      const text = response.choices?.[0]?.message?.content ?? undefined
      const created = response.created

      const usage = this.toTokens(response.usage)
      if (usage !== 0) {
        void pushTokensData(ctx, [
          {
            workspace,
            reason,
            tokens: usage,
            date: new Date((response.created ?? Date.now() / 1000) * 1000).toISOString()
          }
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
    reason = 'chat'
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
          model: config.OpenAIModel,
          user,
          tools
        },
        opt
      )

      let str = await res.finalContent()
      const usage = await res.totalUsage()

      const pos = (str ?? '').indexOf('</think>')
      if (pos > 0) {
        str = (str ?? '').substring(pos + 8)
      }

      const tu = this.toTokens(usage)
      if (tu !== 0) {
        void pushTokensData(ctx, [
          {
            workspace,
            reason,
            tokens: tu,
            date: date.toISOString()
          }
        ])
      }

      return {
        completion: str ?? undefined,
        usage: usage?.completion_tokens
      }
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

    const tokens = response?.usage ?? countTokens([{ content: summary, role: 'assistant' }], this.encoding)

    if (tokens !== 0) {
      void pushTokensData(ctx, [
        {
          workspace,
          reason: 'manual-translate',
          tokens,
          date: new Date((response?.created ?? Date.now() / 1000) * 1000).toISOString()
        }
      ])
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
 * Helper factory to create OpenAI provider when OpenAI is configured.
 */
export function createOpenAIProvider (ctx: MeasureContext): LLMProvider | undefined {
  if (config.OpenAIKey !== '') {
    return new OpenAIProvider(ctx)
  }
  return undefined
}
