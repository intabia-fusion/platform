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
import { PlanningNavigationMenuPage } from '../model/planning/planning-navigation-menu-page'
import { PlanningPage } from '../model/planning/planning-page'
import { enableJsonProtocol, trackTxFrames } from './tx-frames'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
// EditWorkSlot's only existing spec is a skipped drag-based test (plan.spec.ts) - this builds its
// own WorkSlot through the non-drag "Add Slot" flow instead.
test.describe('Rage click: planning (wire-level)', () => {
  test('WorkSlot Save sends one update, not three', async ({ page }) => {
    await enableJsonProtocol(page)
    const tracked = trackTxFrames(page)

    const title = `RageSlot-${generateId()}`
    const now = new Date()
    const today = {
      day: now.getDate().toString(),
      month: (now.getMonth() + 1).toString(),
      year: now.getFullYear().toString()
    }

    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/time`))?.finished()
    const planningPage = new PlanningPage(page)
    const nav = new PlanningNavigationMenuPage(page)
    await nav.clickOnButtonToDoAll()

    await planningPage.createNewToDo({
      title,
      slots: [{ dateStart: 'today', timeStart: '0100', dateEnd: today, timeEnd: '0200' }]
    })

    try {
      await expect(planningPage.eventInSchedule(title)).toBeVisible({ timeout: 10000 })
      await planningPage.eventInSchedule(title).first().click()

      const saveButton = page.getByRole('button', { name: 'Save', exact: true })
      await expect(saveButton).toBeVisible()
      const descriptionInput = page.locator('div.popup div.tiptap').last()
      await descriptionInput.fill('rage click edit')

      const updateFrames = (): number =>
        tracked.frames.filter(
          (tx) => tx._class === 'core:class:TxUpdateDoc' && tx.objectClass === 'time:class:WorkSlot'
        ).length

      tracked.frames.length = 0
      await rageClick(saveButton)
      await expect(page.locator('div.popup')).toHaveCount(0)
      expect(updateFrames()).toBe(1)

      // Button usable again: editing it again still sends exactly one update.
      await planningPage.eventInSchedule(title).first().click()
      await expect(saveButton).toBeVisible()
      await descriptionInput.fill('rage click edit 2')
      tracked.frames.length = 0
      await saveButton.click()
      await expect(page.locator('div.popup')).toHaveCount(0)
      expect(updateFrames()).toBe(1)
    } finally {
      const { client } = await connectTracker()
      try {
        const toDoClass = 'time:class:ToDo' as any
        const workSlotClass = 'time:class:WorkSlot' as any
        const todos = await client.findAll(toDoClass, { title })
        for (const todo of todos) {
          for (const slot of await client.findAll(workSlotClass, { attachedTo: todo._id } as any)) {
            await client.remove(slot)
          }
          await client.remove(todo)
        }
      } finally {
        await client.close()
      }
    }
  })
})
