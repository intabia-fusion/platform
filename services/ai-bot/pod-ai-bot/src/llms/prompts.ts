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
 * Shared prompts used across different LLM providers.
 *
 * Templates live in prompts.yaml (override via PROMPTS_PATH). There are no built-in
 * fallbacks: a missing file or key throws on first use. See promptStore.ts.
 */

import { loadPromptTemplates, renderPrompt, type PromptTemplates } from './promptStore'

export interface PromptParams {
  lang?: string
  contextMode?: 'direct' | 'thread'
  assistantMemory?: string
  userMemory?: string
  sharedContext?: string
}

let cached: PromptTemplates | undefined

/** Load templates once. Throws if prompts.yaml is missing/incomplete. */
function templates (): PromptTemplates {
  if (cached === undefined) {
    cached = loadPromptTemplates()
  }
  return cached
}

/** Reset the cache (tests / hot-reload). */
export function reloadPrompts (filePath?: string): void {
  cached = loadPromptTemplates(filePath)
}

export const PROMPTS = {
  TRANSLATE_HTML: (lang: string): string => renderPrompt(templates().translateHtml, { lang }),

  SUMMARIZE_MESSAGES: (lang: string, description?: string): string =>
    renderPrompt(templates().summarizeMessages, { lang, description: description?.trim() ?? '' }),

  DIRECT_CHAT_WITH_TOOLS: (params: PromptParams): string =>
    renderPrompt(templates().directChatWithTools, {
      assistantMemory: params.assistantMemory ?? '',
      userMemory: params.userMemory ?? '',
      sharedContext: params.sharedContext ?? ''
    }),

  THREAD_CHAT_WITH_TOOLS: (params: PromptParams): string =>
    renderPrompt(templates().threadChatWithTools, { sharedContext: params.sharedContext ?? '' }),

  get SUMMARY_SYSTEM_PROMPT (): string {
    return templates().summarySystemPrompt
  },

  SUMMARY_USER_PROMPT: (history: Array<{ role: string, message: string }>): string =>
    renderPrompt(templates().summaryUserPrompt, {
      history: history.map((msg) => `${msg.role}: ${msg.message}`).join('\n')
    })
}
