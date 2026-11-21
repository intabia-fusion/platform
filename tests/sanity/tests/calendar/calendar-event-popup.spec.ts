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
import { expect, test, type Page } from '../fixtures'
import { generateId, PlatformSetting, PlatformURI } from '../utils'
import { CalendarPage } from '../model/calendar-page'
import { SidebarPage } from '../model/sidebar-page'
import { dropStaleCalendarEvents } from '../API/CalendarApi'

test.use({
  storageState: PlatformSetting
})

async function openCalendarWidget (page: Page): Promise<CalendarPage> {
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  const sidebarPage = new SidebarPage(page)
  await sidebarPage.clickSidebarPageButton('calendar')
  await sidebarPage.checkIfPlanerSidebarTabIsOpen(true)
  return new CalendarPage(page)
}

// Two regressions of the same popup: it could not be dismissed with an outside click, and the
// repeat form wrote the rule it was opened with, whatever the user had changed in it.
test.describe('Calendar event popup', () => {
  test.beforeAll(async () => {
    await dropStaleCalendarEvents(['Outside click ', 'Repeat period '])
  })

  test('A click outside the event popup closes it', async ({ page }) => {
    const calendarPage = await openCalendarWidget(page)
    await calendarPage.clickFreeCellInWidget()
    await calendarPage.inputEventTitle().fill(`Outside click ${generateId()}`)
    await expect(calendarPage.createEventPopup()).toBeVisible()

    await calendarPage.clickOutsideEventPopup()

    // The overlay has to go with the popup: a leftover overlay swallows every click that follows.
    await expect(calendarPage.createEventPopup()).toHaveCount(0)
    await expect(page.locator('div.modal-overlay')).toHaveCount(0)
  })

  test('A changed repeat period is what the popup shows and the series gets', async ({ page }) => {
    const title = `Repeat period ${generateId()}`
    const calendarPage = await openCalendarWidget(page)

    await calendarPage.clickFreeCellInWidget()
    await calendarPage.inputEventTitle().fill(title)
    await calendarPage.setRepeatInterval(2)

    // The preview follows the input: it used to stay on the rule the popup was opened with.
    await expect(calendarPage.repeatPreview()).toContainText('Every 2 Week')
    await calendarPage.buttonRepeatSave().click()

    // And Save puts that same rule into the event, not the initial one.
    await expect(calendarPage.buttonSavedRepeatRule()).toBeVisible()
    await expect(calendarPage.buttonSavedRepeatRule()).toContainText('Every 2 Week')

    await calendarPage.buttonCreateEventSubmit().click()
    await expect(calendarPage.createEventPopup()).toHaveCount(0)
  })
})
