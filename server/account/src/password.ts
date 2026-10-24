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

import {
  getPasswordViolations,
  type PasswordPolicy,
  type PasswordStrictness,
  type PasswordValidations
} from '@hcengineering/account-client'
import platform, { getMetadata, PlatformError, Severity, Status } from '@hcengineering/platform'
import { accountPlugin } from './plugin'

export const passwordRequirements: Record<PasswordStrictness, PasswordValidations> = {
  very_strict: {
    MinDigits: 4,
    MinLength: 32,
    MinLowerChars: 4,
    MinSpecialChars: 4,
    MinUpperChars: 4
  },
  strict: {
    MinDigits: 2,
    MinLength: 16,
    MinLowerChars: 2,
    MinSpecialChars: 2,
    MinUpperChars: 2
  },
  normal: {
    MinDigits: 1,
    MinLength: 8,
    MinLowerChars: 1,
    MinSpecialChars: 1,
    MinUpperChars: 1
  },
  none: {
    MinDigits: 0,
    MinLength: 0,
    MinLowerChars: 0,
    MinSpecialChars: 0,
    MinUpperChars: 0
  }
}

/**
 * Reads the preset name from the PASSWORD_STRICTNESS value. Anything unknown (a typo, a value from
 * a newer build) falls back to `none` instead of failing the service start.
 */
export function parsePasswordStrictness (value?: unknown): PasswordStrictness {
  const strictness = (typeof value === 'string' ? value.trim() : '') as PasswordStrictness
  return passwordRequirements[strictness] !== undefined ? strictness : 'none'
}

export function getPasswordStrictness (): PasswordStrictness {
  return parsePasswordStrictness(getMetadata(accountPlugin.metadata.PasswordStrictness))
}

export function resolvePasswordPolicy (): PasswordPolicy {
  const strictness = getPasswordStrictness()
  return { strictness, validations: passwordRequirements[strictness] }
}

/**
 * Throws `PasswordPolicyViolation` with the first unsatisfied rule. Call it in every handler that
 * stores a user-chosen password, before the password reaches `setPassword()`.
 */
export function assertPasswordPolicy (password: string): void {
  const [violation] = getPasswordViolations(password, resolvePasswordPolicy().validations)
  if (violation === undefined) {
    return
  }

  throw new PlatformError(
    new Status(Severity.ERROR, platform.status.PasswordPolicyViolation, {
      rule: violation.rule,
      count: violation.count
    })
  )
}
