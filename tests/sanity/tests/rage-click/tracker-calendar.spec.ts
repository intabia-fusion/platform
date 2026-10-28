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
import { deleteEventsByTitle } from '../API/CalendarApi'
import { CalendarPage } from '../model/calendar-page'
import { SidebarPage } from '../model/sidebar-page'
import { enableJsonProtocol, trackTxFrames } from './tx-frames'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: calendar', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('Create event "Create" opens one event, not three', async ({ page }, testInfo) => {
    const title = `Rage event-${generateId(6)}`
    const title2 = `Rage event2-${generateId(6)}`

    const sidebarPage = new SidebarPage(page)
    await sidebarPage.clickSidebarPageButton('calendar')

    const calendarPage = new CalendarPage(page)
    try {
      await calendarPage.clickFreeCellInWidget()
      await calendarPage.inputEventTitle().fill(title)

      await rageClick(calendarPage.buttonCreateEventSubmit())
      await expect(calendarPage.createEventPopup()).toHaveCount(0)
      await expect(calendarPage.eventInCalendarWidget(title)).toHaveCount(1)

      // Button usable again: creating a second, distinct event still succeeds exactly once.
      await calendarPage.createEventInWidget(title2)
      await expect(calendarPage.eventInCalendarWidget(title2)).toHaveCount(1)
    } finally {
      await deleteEventsByTitle(title)
      await deleteEventsByTitle(title2)
    }
  })
})

// A second describe block: enableJsonProtocol() must run via addInitScript before the first
// navigation, so this can't share the describe above's beforeEach (which already navigated).
test.describe('Rage click: calendar (wire-level)', () => {
  test('Edit event Save sends one update, not three', async ({ page }) => {
    await enableJsonProtocol(page)
    const tracked = trackTxFrames(page)

    const title = `RageEditEvent-${generateId()}`
    const titleEdited = `${title}-edited`
    const titleEdited2 = `${title}-edited2`

    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
    const sidebarPage = new SidebarPage(page)
    await sidebarPage.clickSidebarPageButton('calendar')
    const calendarPage = new CalendarPage(page)
    const saveButton = page.getByRole('button', { name: 'Save', exact: true })
    const titleInput = page.locator('input[placeholder="Event title"]').last()
    const updateFramesFor = (objectClass: string): number =>
      tracked.frames.filter((tx) => tx._class === 'core:class:TxUpdateDoc' && tx.objectClass === objectClass).length

    try {
      await calendarPage.createEventInWidget(title)
      await calendarPage.eventInCalendarWidget(title).first().click()
      await expect(saveButton).toBeVisible()
      await titleInput.fill(titleEdited)

      tracked.frames.length = 0
      await rageClick(saveButton)
      await expect(page.locator('div.popup div.eventPopup-container')).toHaveCount(0)
      expect(updateFramesFor('calendar:class:Event')).toBe(1)
      await expect(calendarPage.eventInCalendarWidget(titleEdited)).toHaveCount(1)

      // Button usable again: editing it again still sends exactly one update.
      await calendarPage.eventInCalendarWidget(titleEdited).first().click()
      await expect(saveButton).toBeVisible()
      await titleInput.fill(titleEdited2)
      tracked.frames.length = 0
      await saveButton.click()
      await expect(page.locator('div.popup div.eventPopup-container')).toHaveCount(0)
      expect(updateFramesFor('calendar:class:Event')).toBe(1)
      await expect(calendarPage.eventInCalendarWidget(titleEdited2)).toHaveCount(1)
    } finally {
      await deleteEventsByTitle(title)
      await deleteEventsByTitle(titleEdited)
      await deleteEventsByTitle(titleEdited2)
    }
  })
})
