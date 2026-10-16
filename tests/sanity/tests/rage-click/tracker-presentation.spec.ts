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
import { ApplicationsPage } from '../model/recruiting/applications-page'
import { NavigationMenuPage } from '../model/recruiting/navigation-menu-page'
import { VacanciesPage } from '../model/recruiting/vacancies-page'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
//
// This test needs the stand rebuilt with the packages/presentation/src/components/DocPopup.svelte
// fix (component branch of onCreate() now resets `creating` in the create dialog's onClose). On the
// currently running (not-yet-rebuilt) stand it reliably opens 3 stacked "Create Candidate" popups
// instead of 1 - see tracker.result.json for the root-cause writeup. Run the rest of the rage-click
// suite with `--grep-invert "Talent selector"` until the stand picks up the fix.
test.describe('Rage click: object picker "+" (DocPopup)', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/recruit`))?.finished()
  })

  test('Talent selector "+" opens one Create Candidate form, not three', async ({ page }, testInfo) => {
    const vacancyName = `Rage vacancy-${generateId(6)}`
    const navigationMenuPage = new NavigationMenuPage(page)
    const vacanciesPage = new VacanciesPage(page)
    const applicationsPage = new ApplicationsPage(page)

    await navigationMenuPage.clickButtonVacancies()
    await vacanciesPage.createNewVacancy({
      title: vacancyName,
      description: 'Vacancy for FUSIO-1584 rage click test',
      location: 'Rage click'
    })
    await navigationMenuPage.clickButtonApplications()
    await applicationsPage.selectType('Default vacancy (custom)', true)
    await applicationsPage.buttonCreateApplication().click()
    await applicationsPage.buttonTalentSelector().click()

    const addButton = page.locator('div.selectPopup button[data-id="btnAdd"]')
    const createCandidateForm = page.locator('div.popup form[id="recruit:string:CreateTalent"]')

    await rageClick(addButton)
    await expect(createCandidateForm).toHaveCount(1)

    // Close without creating a talent; just prove the picker still works afterwards.
    await page.keyboard.press('Escape')
    await expect(createCandidateForm).toHaveCount(0)
    await addButton.click()
    await expect(createCandidateForm).toHaveCount(1)
    await page.keyboard.press('Escape')
  })
})
