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

import type { MeasureContext } from '@hcengineering/core'

import { createOpenAIProvider } from './openai'
import { createGigaChatProvider } from './gigachat'
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

// Re-export prompts for consistency
export { PROMPTS } from './prompts'

// Re-export provider factory for direct usage if needed
export { createOpenAIProvider } from './openai'
export { createGigaChatProvider } from './gigachat'

/**
 * Create an LLM provider instance based on runtime configuration.
 *
 * Currently this delegates to OpenAI provider when OpenAI credentials are present,
 * or GigaChat when GigaChat credentials are present.
 * In future we can extend this to choose provider by name (e.g. process.env.LLM_PROVIDER)
 * or other configuration.
 */
export function createLLMFromConfig (ctx: MeasureContext): LLMProvider | undefined {
  // Check for explicit provider selection
  const providerType = process.env.LLM_PROVIDER?.toLowerCase()

  switch (providerType) {
    case 'gigachat': {
      const gigachatProvider = createGigaChatProvider(ctx)
      if (gigachatProvider !== undefined) return gigachatProvider
      break
    }
    case 'openai':
    default: {
      const openaiProvider = createOpenAIProvider(ctx)
      if (openaiProvider !== undefined) return openaiProvider
      break
    }
  }

  // Fallback: try GigaChat if OpenAI is not configured
  if (providerType === undefined) {
    const gigachatProvider = createGigaChatProvider(ctx)
    if (gigachatProvider !== undefined) return gigachatProvider
  }

  // No provider configured
  return undefined
}
