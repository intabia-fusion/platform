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

import { expect } from '@playwright/test'
import { test } from '../fixtures'
import { waitStable } from '../retry'
import { PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: workbench tabs', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('"+" adds one tab, not three', async ({ page }) => {
    const bar = page.locator('div[id="workbench:component:WorkbenchTabs"]')
    const tabs = bar.locator('div.container.main')
    const addButton = bar.locator('button').last()
    const count = async (): Promise<number> => await tabs.count()

    // The tab bar carries leftover tabs from earlier runs on this shared account; read a settled
    // baseline instead of a raw count that can change under us while the list is still loading.
    const before = await waitStable(count, { stableFor: 1000, interval: 200, timeout: 10000 })

    await rageClick(addButton)
    const afterRage = await waitStable(count, { stableFor: 1000, interval: 200, timeout: 10000 })
    expect(afterRage).toBe(before + 1)

    // Button usable again: adding another tab still works exactly once.
    await addButton.click()
    const afterSingle = await waitStable(count, { stableFor: 1000, interval: 200, timeout: 10000 })
    expect(afterSingle).toBe(before + 2)

    // Tidy up: close the two tabs this test added.
    await tabs.last().locator('button').last().click()
    await tabs.last().locator('button').last().click()
    await expect(tabs).toHaveCount(before)
  })
})
