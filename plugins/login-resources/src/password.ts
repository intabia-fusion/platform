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

import { getClient, type PasswordValidations } from '@hcengineering/account-client'
import { getMetadata, setMetadata } from '@hcengineering/platform'

import login from './plugin'

// Short on purpose: this runs when a password form is about to be shown, and a slow account must
// not hold it back. A failure leaves the form without inline rules - the server still enforces the
// policy and answers with the violated rule.
const passwordPolicyTimeoutMs = 2000

/**
 * Resolves with `fallback` when `promise` has not settled within `ms`. The promise itself is not
 * cancelled, the caller just stops waiting for it.
 */
async function withDeadline<T> (promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallback)
    }, ms)
  })

  return await Promise.race([promise, deadline]).finally(() => {
    clearTimeout(timer)
  })
}

async function loadPasswordValidations (): Promise<PasswordValidations | undefined> {
  const accountsUrl = getMetadata(login.metadata.AccountsUrl)
  if (accountsUrl == null || accountsUrl === '') {
    return undefined
  }

  // The third argument is the retry budget for network errors, not a request deadline: a connection
  // that gets no answer at all is bounded by withDeadline instead.
  return await withDeadline(
    getClient(accountsUrl, undefined, passwordPolicyTimeoutMs)
      .getPasswordPolicy()
      .then((policy) => policy.validations)
      .catch((err: any) => {
        console.warn('Failed to load the password policy', err)
        return undefined
      }),
    passwordPolicyTimeoutMs,
    undefined
  )
}

// One request per app session, and only when a password form is opened. A logged-in user who never
// edits a password pays nothing.
let policyPromise: Promise<PasswordValidations | undefined> | undefined

/**
 * Publishes the policy as `login.metadata.PasswordValidations`, which is what the form rules are
 * built from. Password-bearing screens await this before rendering, so the policy is requested only
 * on those screens. Resolves even when the policy cannot be loaded.
 */
export async function ensurePasswordValidations (): Promise<void> {
  policyPromise ??= loadPasswordValidations()
  const validations = await policyPromise

  if (validations !== undefined) {
    setMetadata(login.metadata.PasswordValidations, validations)
  }
}
