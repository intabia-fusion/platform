//
// Copyright © 2022 Hardcore Engineering Inc.
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

import { type PasswordRule, getPasswordViolations, measurePassword, passwordRules } from '@hcengineering/account-client'
import type { PasswordValidationError } from '@hcengineering/login'
import platform, { type IntlString, getMetadata, Severity, Status } from '@hcengineering/platform'

import login from './plugin'
import type { Field } from './types'

const passwordRuleStrings: Record<PasswordRule, IntlString<{ count: number }>> = {
  MinLength: login.string.PasswordMinLength,
  MinSpecialChars: login.string.PasswordMinSpecialChars,
  MinDigits: login.string.PasswordMinDigits,
  MinUpperChars: login.string.PasswordMinUpperChars,
  MinLowerChars: login.string.PasswordMinLowerChars
}

/**
 * Builds the form rules from the policy the account service served. Thresholds come as data
 * (`login.metadata.PasswordValidations`) and the counting itself from `@hcengineering/account-client`,
 * so the form and the server-side check cannot disagree. No metadata means `none`: every rule passes.
 */
export function getPasswordValidationRules (): Field['rules'] {
  const validations = getMetadata(login.metadata.PasswordValidations)

  return passwordRules.map((rule) => ({
    rule: (value: string) => measurePassword(value)[rule] >= (validations?.[rule] ?? 0),
    notMatch: false,
    ruleDescr: passwordRuleStrings[rule],
    ruleDescrParams: { count: validations?.[rule] ?? 0 }
  }))
}

/**
 * First rule the password does not satisfy, already resolved to its translated message. Used by
 * screens that do not use `Form` (the settings page) to show the same hint the login form shows.
 */
export function getPasswordValidationError (password: string): PasswordValidationError | undefined {
  const [violation] = getPasswordViolations(password, getMetadata(login.metadata.PasswordValidations))
  if (violation === undefined) {
    return undefined
  }

  return { label: passwordRuleStrings[violation.rule], params: { count: violation.count } }
}

/**
 * Turns a server-side `PasswordPolicyViolation` into the same per-rule message the form shows.
 * Only reachable when the cached policy is stale or the client is not the login UI.
 */
export function mapPasswordPolicyStatus (status: Status<any>): Status<any> {
  if (status.code !== platform.status.PasswordPolicyViolation) {
    return status
  }

  const rule = status.params?.rule as PasswordRule | undefined
  const ruleDescr = rule !== undefined ? passwordRuleStrings[rule] : undefined

  if (ruleDescr === undefined) {
    return status
  }

  return new Status(Severity.INFO, ruleDescr, { count: status.params?.count })
}
