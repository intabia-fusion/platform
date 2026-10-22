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
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { MilestonesPage } from '../model/tracker/milestones-page'
import { TemplatePage } from '../model/tracker/templates-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { prepareNewIssueWithOpenByApiStep } from '../tracker/common-steps'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: tracker', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('Milestone "+" opens one create dialog', async ({ page }) => {
    const milestonesPage = new MilestonesPage(page)
    const form = page.locator('form[id="tracker:string:NewMilestone"]')
    await new TrackerNavigationMenuPage(page).openMilestonesForProject('Default')

    await rageClick(milestonesPage.buttonCreateNewMilestone())
    await expect(form).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(form).toHaveCount(0)
    await milestonesPage.buttonCreateNewMilestone().click()
    await expect(form).toHaveCount(1)
  })

  test('Template "+" opens one create-template dialog', async ({ page }) => {
    const templatePage = new TemplatePage(page)
    const form = page.locator('form[id$="NewProcess"]')
    await new TrackerNavigationMenuPage(page).openTemplateForProject('Default')

    await rageClick(templatePage.buttonNewTemplate())
    await expect(form).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(form).toHaveCount(0)
    await templatePage.buttonNewTemplate().click()
    await expect(form).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Milestone field opens one picker popup', async ({ page }, testInfo) => {
    const issuesDetailsPage = new IssuesDetailsPage(page)
    const issueTitle = `Rage milestone issue-${generateId(6)}`

    await prepareNewIssueWithOpenByApiStep(page, {
      title: issueTitle,
      description: 'Issue for FUSIO-1584 rage click test',
      projectName: 'Default'
    })

    await rageClick(issuesDetailsPage.buttonMilestone())
    await expect(issuesDetailsPage.popup()).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(issuesDetailsPage.popup()).toHaveCount(0)
    await issuesDetailsPage.buttonMilestone().click()
    await expect(issuesDetailsPage.popup()).toHaveCount(1)
    await page.keyboard.press('Escape')
  })
})
