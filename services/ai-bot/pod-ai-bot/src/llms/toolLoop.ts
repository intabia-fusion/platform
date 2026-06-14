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

import type { TokenUsage, ToolCall, ToolResult } from './types'
import { totalTokens } from './types'
import type { ChatCompletionWithToolsReply } from './server'

/**
 * One round of asking the model: send accumulated tool results, get back either
 * a final completion or a new batch of tool calls to execute.
 */
export type AskModel = (priorToolResults: ToolResult[]) => Promise<ChatCompletionWithToolsReply | undefined>

/** Execute a single tool call (on the pod, where WorkspaceClient context lives). */
export type ExecuteTool = (call: ToolCall) => Promise<string>

export interface ToolLoopResult {
  completion?: string
  usage?: TokenUsage
}

/**
 * Drive the model<->tool loop for the clisr provider.
 *
 * The clisr client only runs the model and returns `toolCalls`; the pod executes
 * them (`execute`) and resubmits the results until the model returns a final
 * `completion` or `maxIterations` is reached. Usage is summed across rounds.
 *
 * Pure orchestration: the network call (`ask`) and tool execution (`execute`) are
 * injected, so this is unit-testable without clisr or a real WorkspaceClient.
 */
export async function runToolCalls (
  ask: AskModel,
  execute: ExecuteTool,
  maxIterations: number
): Promise<ToolLoopResult | undefined> {
  let priorToolResults: ToolResult[] = []
  let promptTokens = 0
  let completionTokens = 0
  let sawUsage = false

  for (let iter = 0; iter < maxIterations; iter++) {
    const reply = await ask(priorToolResults)
    if (reply === undefined) {
      return undefined
    }

    if (reply.usage !== undefined) {
      sawUsage = true
      promptTokens += reply.usage.promptTokens
      completionTokens += reply.usage.completionTokens
    }

    const calls = reply.toolCalls ?? []
    if (calls.length === 0) {
      // Final answer.
      return {
        completion: reply.content,
        usage: sawUsage ? { promptTokens, completionTokens } : undefined
      }
    }

    // Execute every requested tool on the pod, feed results into the next round.
    priorToolResults = await Promise.all(
      calls.map(async (call) => ({
        id: call.id,
        name: call.name,
        arguments: call.arguments,
        content: await execute(call)
      }))
    )
  }

  // Exhausted iterations without a final answer: return what we have.
  return {
    completion: undefined,
    usage: sawUsage ? { promptTokens, completionTokens } : undefined
  }
}

/** Sum usage across reply rounds (exported for reuse/testing). */
export function sumReplyUsage (replies: Array<ChatCompletionWithToolsReply | undefined>): TokenUsage | undefined {
  let promptTokens = 0
  let completionTokens = 0
  let sawUsage = false
  for (const r of replies) {
    if (r?.usage !== undefined) {
      sawUsage = true
      promptTokens += r.usage.promptTokens
      completionTokens += r.usage.completionTokens
    }
  }
  return sawUsage ? { promptTokens, completionTokens } : undefined
}

/** Convenience: total tokens of a usage record (re-export keeps callers local). */
export function loopTotalTokens (usage?: TokenUsage): number {
  return totalTokens(usage)
}
