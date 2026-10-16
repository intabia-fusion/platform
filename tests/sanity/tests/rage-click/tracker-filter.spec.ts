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
import { connectTracker } from '../API/TrackerApi'
import { enableJsonProtocol, trackTxFrames } from './tx-frames'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. FilterBar's Save (for a diverged filtered view) sends an idempotent client.update diff,
// so the only observable signal is on the wire - see tx-frames.ts.
test.describe('Rage click: filter bar (wire-level)', () => {
  test('Save on a diverged filtered view sends one update, not three', async ({ page }) => {
    await enableJsonProtocol(page)
    const tracked = trackTxFrames(page)

    const viewName = `RageFilterView-${generateId()}`
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
    await page.locator('a[href$="all-issues"]').click()

    try {
      // Add a filter: Priority is Urgent.
      await page.getByTestId('contentPanel').getByRole('button', { name: 'Filter' }).click()
      await page.locator('div.selectPopup [class*="menu"]', { hasText: 'Priority' }).click()
      await page.locator('div.selectPopup button.menu-item', { hasText: 'Urgent' }).click()
      await page.keyboard.press('Escape')

      // Save it as a view.
      await page.getByRole('button', { name: 'Save as', exact: true }).click()
      await page.locator('div.popup input[type="text"]').fill(viewName)
      await page.locator('div.popup').getByRole('button', { name: 'Create', exact: true }).click()
      await expect(page.locator('div.popup form')).toHaveCount(0)

      // The "Filtered views" live query does not pick up a view created in the same session -
      // a reload is the only way found to make it show (and the filter persists across it).
      await page.reload()
      await expect(page.locator('.antiPanel-navigator', { hasText: viewName })).toBeVisible({ timeout: 15000 })

      // Select it (only this - not just creating it - sets selectedFilterStore, see
      // SavedView.svelte's load()), which is what makes FilterBar's Save button appear at all.
      await page.locator('span', { hasText: viewName }).last().click()

      const saveButton = page.getByRole('button', { name: 'Save', exact: true })
      const updateFrames = (): number =>
        tracked.frames.filter(
          (tx) => tx._class === 'core:class:TxUpdateDoc' && tx.objectClass === 'view:class:FilteredView'
        ).length

      // Diverge: reopen the Priority category via FilterBar's own "+" (unambiguous, unlike the
      // header "Filter" button once a "Filtered views" section exists) and add a second value.
      await page.locator('.filterbar-container .add-filter button').click()
      await page.locator('div.selectPopup [class*="menu"]', { hasText: 'Priority' }).click()
      await page.locator('div.selectPopup button.menu-item', { hasText: 'High' }).click()
      await page.keyboard.press('Escape')
      await expect(saveButton).toBeVisible()

      tracked.frames.length = 0
      await rageClick(saveButton)
      await page.waitForTimeout(1000)
      expect(updateFrames()).toBe(1)

      // Button usable again: the Save button is still clickable and sends exactly one more
      // update (not stuck disabled/loading from the rage click above).
      await expect(saveButton).toBeEnabled()
      tracked.frames.length = 0
      await saveButton.click()
      await page.waitForTimeout(1000)
      expect(updateFrames()).toBe(1)
    } finally {
      const { client } = await connectTracker()
      try {
        const filteredViewClass = 'view:class:FilteredView' as any
        for (const fv of await client.findAll(filteredViewClass, { name: viewName })) {
          await client.remove(fv)
        }
      } finally {
        await client.close()
      }
    }
  })
})
