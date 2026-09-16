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

import { type Employee } from '@hcengineering/contact'
import { getCurrentAccount, TxFactory, type WithLookup } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'

import contact from './plugin'

function detectBrowserTimezone (): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz !== '' ? tz : undefined
  } catch {
    return undefined
  }
}

const timezoneSyncKey = 'contact_timezone_synced'
let timezoneSynced = false

/**
 * @public
 *
 * FUSIO-1344: the employee store also fires on my other sessions' changes, so two devices in
 * different zones overwrote each other forever. Write only when THIS device's own zone changed.
 */
export async function syncMyEmployeeTimezone (employee: WithLookup<Employee> | undefined): Promise<void> {
  if (timezoneSynced || employee === undefined) return
  const browserTz = detectBrowserTimezone()
  if (browserTz === undefined) return

  timezoneSynced = true
  if (employee.timezone === browserTz) return
  try {
    // A private window denies storage; that must not escape as an unhandled rejection.
    if (localStorage.getItem(timezoneSyncKey) === browserTz) return
    // Derived: the browser restates a device fact, there is nothing to keep in the tx log.
    const factory = new TxFactory(getCurrentAccount().primarySocialId, true)
    await getClient().tx(
      factory.createTxMixin(employee._id, contact.class.Person, employee.space, contact.mixin.Employee, {
        timezone: browserTz
      })
    )
    localStorage.setItem(timezoneSyncKey, browserTz)
  } catch (err) {
    console.error('Failed to sync employee timezone', err)
  }
}
