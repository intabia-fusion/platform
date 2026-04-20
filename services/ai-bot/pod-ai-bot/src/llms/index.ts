//
// Copyright © 2025 Hardcore Engineering Inc.
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

import type { MeasureContext } from '@hcengineering/core'
import { ClisrServer } from '@intabiafusion/clisr'
import config from '../config'

import { createOpenAIProvider } from './openai'
import { createGigaChatProvider } from './gigachat'
import { createServerLLMProvider } from './server'
import { LLMProvider } from './types'

// Re-export types for convenience
export type {
  LLMProvider,
  ChatMessage,
  ChatCompletionResult,
  ChatCompletionWithToolsResult,
  RequestSummaryResult,
  ContextMode,
  LLMFactory
} from './types'

// Re-export server provider request types
export type {
  TranslateHtmlRequest,
  SummarizeMessagesRequest,
  ChatCompletionRequest,
  ChatCompletionWithToolsRequest,
  RequestSummaryRequest,
  CountTokensRequest,
  LLMRequest
} from './server'

// Re-export prompts for consistency
export { PROMPTS } from './prompts'

// Re-export provider factory for direct usage if needed
export { createOpenAIProvider } from './openai'
export { createGigaChatProvider } from './gigachat'
export { createServerLLMProvider } from './server'

/**
 * LLM provider type enumeration
 */
export type LLMProviderType = 'openai' | 'gigachat' | 'server'

/**
 * Create an LLM provider instance based on runtime configuration.
 *
 * Provider selection logic:
 * - 'server': Use server provider to distribute requests to connected clients via Clisr
 * - 'gigachat': Use GigaChat provider when credentials are present
 * - 'openai': Use OpenAI provider when API key is present (default)
 *
 * @param ctx - Measure context for logging
 * @param server - Optional ClisrServer instance (required for 'server' provider)
 * @returns LLM provider instance or undefined if configuration is invalid
 */
export function createLLMFromConfig (ctx: MeasureContext, server?: ClisrServer): LLMProvider | undefined {
  // Check for explicit provider selection (via config.LLMProvider)
  const rawLlmProvider = config.LLMProvider ?? ''
  const providerType = rawLlmProvider.trim() === '' ? undefined : rawLlmProvider.trim().toLowerCase()

  switch (providerType) {
    case 'server': {
      if (server === undefined) {
        ctx.error('LLM server provider requires ClisrServer instance')
        return undefined
      }
      ctx.info('Creating server LLM provider', { provider: 'server' })
      return createServerLLMProvider(ctx, server)
    }
    case 'gigachat': {
      const gigachatProvider = createGigaChatProvider(ctx)
      if (gigachatProvider !== undefined) {
        ctx.info('Creating GigaChat LLM provider', { provider: 'gigachat' })
        return gigachatProvider
      }
      ctx.warn('GigaChat credentials not configured, trying fallback')
      break
    }
    case 'openai':
    default: {
      const openaiProvider = createOpenAIProvider(ctx)
      if (openaiProvider !== undefined) {
        ctx.info('Creating OpenAI LLM provider', { provider: 'openai' })
        return openaiProvider
      }
      if (providerType === 'openai') {
        ctx.warn('OpenAI API key not configured')
      }
      break
    }
  }

  // Fallback: try GigaChat if OpenAI is not configured
  if (providerType === undefined || providerType === 'openai') {
    const gigachatProvider = createGigaChatProvider(ctx)
    if (gigachatProvider !== undefined) {
      ctx.info('Creating GigaChat LLM provider (fallback)', { provider: 'gigachat' })
      return gigachatProvider
    }
  }

  // No provider configured
  if (providerType === undefined) {
    ctx.info('LLM provider not configured, disabled')
  } else {
    ctx.warn('No LLM provider configured', { provider: providerType })
  }
  return undefined
}
