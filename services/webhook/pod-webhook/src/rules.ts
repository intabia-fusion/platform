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

import type { ApiKeyCheck } from '@hcengineering/account-client'
import type { RestClient } from '@hcengineering/api-client'
import contact from '@hcengineering/contact'
import type { WorkspaceUuid } from '@hcengineering/core'
import setting, { type WebhookIncomingRule, type WebhookRegexTest } from '@hcengineering/setting'
import vm from 'vm'

// Read with a system token that sees every space, so a member could name someone else's keyId on a
// rule they create - `rule.space` being the key creator's PersonSpace is the only proof it's theirs.
async function resolveRules (rest: RestClient, check: ApiKeyCheck): Promise<WebhookIncomingRule[]> {
  const person = await rest.findOne(contact.class.Person, { personUuid: check.createdBy })
  if (person === undefined) return []
  const space = await rest.findOne(contact.class.PersonSpace, { person: person._id })
  if (space === undefined) return []
  const rules = await rest.findAll(setting.class.WebhookIncomingRule, {
    keyId: check.keyId,
    space: space._id,
    enabled: true
  })
  return [...rules].sort((a, b) => a.rank.localeCompare(b.rank))
}

// Reloaded no more often than this, so a rule edited in the settings UI applies within a bounded lag.
export const RULES_RELOAD_MS = 10_000

interface RulesEntry {
  rules: WebhookIncomingRule[]
  loadedAt: number
}

// Cached for the process lifetime, keyed by workspace:keyId - modelled on the space index cache in
// targets.ts. Single-replica only; a second replica needs a shared cache instead.
const rulesCache = new Map<string, Promise<RulesEntry>>()

export async function loadRules (
  rest: RestClient,
  workspace: WorkspaceUuid,
  check: ApiKeyCheck
): Promise<WebhookIncomingRule[]> {
  const cacheKey = `${workspace}:${check.keyId}`
  const cached = rulesCache.get(cacheKey)
  const entry = cached !== undefined ? await cached.catch(() => undefined) : undefined
  if (entry !== undefined && Date.now() - entry.loadedAt < RULES_RELOAD_MS) return entry.rules

  const promise = resolveRules(rest, check).then((rules) => ({ rules, loadedAt: Date.now() }))
  rulesCache.set(cacheKey, promise)
  promise.catch(() => {
    if (rulesCache.get(cacheKey) === promise) rulesCache.delete(cacheKey)
  })
  return (await promise).rules
}

const MAX_PATTERN_LENGTH = 200
const MAX_VALUE_LENGTH = 2000
const REGEX_TIMEOUT_MS = 50

// User-written patterns run against third-party input on a shared pod - a catastrophic pattern
// (ReDoS) is a real DoS, so it runs in a throwaway vm context under a hard timeout.
const regexScript = new vm.Script('new RegExp(pattern).test(value)')

export const safeRegexTest: WebhookRegexTest = (pattern, value) => {
  if (pattern.length > MAX_PATTERN_LENGTH || value.length > MAX_VALUE_LENGTH) return false
  try {
    const context = vm.createContext({ pattern, value })
    return regexScript.runInContext(context, { timeout: REGEX_TIMEOUT_MS }) === true
  } catch {
    return false
  }
}
