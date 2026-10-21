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
 * Password policy shared by the account service and the login UI.
 * @public
 */
export type PasswordStrictness = 'very_strict' | 'strict' | 'normal' | 'none'

/**
 * One minimum a password has to reach.
 * @public
 */
export type PasswordRule = 'MinLength' | 'MinSpecialChars' | 'MinDigits' | 'MinUpperChars' | 'MinLowerChars'

/**
 * Minimum counts a password must reach. An undefined policy (or `none`) means no restrictions.
 * @public
 */
export type PasswordValidations = Record<PasswordRule, number>

/**
 * Counts actually measured in a password, keyed by the rule they are compared against.
 * @public
 */
export type PasswordMetrics = Record<PasswordRule, number>

/**
 * @public
 */
export interface PasswordPolicy {
  strictness: PasswordStrictness
  validations: PasswordValidations
}

/**
 * @public
 */
export interface PasswordPolicyViolation {
  rule: PasswordRule
  /** The minimum the password did not reach. */
  count: number
}

/**
 * Rule order shared by the server error and the UI, so the reported rule is always the same one.
 * @public
 */
export const passwordRules: PasswordRule[] = [
  'MinLength',
  'MinSpecialChars',
  'MinDigits',
  'MinUpperChars',
  'MinLowerChars'
]

function countMatches (value: string, re: RegExp): number {
  return value.match(re)?.length ?? 0
}

/**
 * Measures a password against every rule. The result uses the validation keys so a caller can
 * compare it with the policy directly.
 * @public
 */
export function measurePassword (value: string): PasswordMetrics {
  const password = value ?? ''

  return {
    MinLength: [...password].length,
    MinSpecialChars: countMatches(password, /[^\p{L}\p{N}]/gu),
    MinDigits: countMatches(password, /\p{N}/gu),
    MinUpperChars: countMatches(password, /\p{Lu}/gu),
    MinLowerChars: countMatches(password, /\p{Ll}/gu)
  }
}

/**
 * Lists the rules the password does not satisfy, in `passwordRules` order.
 * `undefined` validations mean the policy is not configured, so nothing is violated.
 * @public
 */
export function getPasswordViolations (
  password: string,
  validations: PasswordValidations | undefined
): PasswordPolicyViolation[] {
  if (validations == null) {
    return []
  }

  const metrics = measurePassword(password)
  const violations: PasswordPolicyViolation[] = []

  for (const rule of passwordRules) {
    const count = validations[rule] ?? 0
    if (metrics[rule] < count) {
      violations.push({ rule, count })
    }
  }

  return violations
}

/**
 * @public
 */
export function isPasswordValid (password: string, validations: PasswordValidations | undefined): boolean {
  return getPasswordViolations(password, validations).length === 0
}
