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
import { NavigationMenuPage } from '../model/recruiting/navigation-menu-page'
import { TalentDetailsPage } from '../model/recruiting/talent-details-page'
import { TalentsPage } from '../model/recruiting/talents-page'
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { prepareNewIssueWithOpenByApiStep } from '../tracker/common-steps'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: tags', () => {
  test('Labels quick-add creates one tag, not three', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()

    const tagTitle = `RageTag-${generateId()}`
    const tagTitle2 = `RageTag2-${generateId()}`

    const issuesDetailsPage = new IssuesDetailsPage(page)

    await prepareNewIssueWithOpenByApiStep(page, {
      title: `Rage labels issue-${generateId()}`,
      description: 'Issue for FUSIO-1584 rage click test',
      projectName: 'Default'
    })

    await issuesDetailsPage.buttonAddLabel().click()
    const searchInput = page.locator('div.selectPopup input')
    await searchInput.fill(tagTitle)
    const quickAdd = page.locator('div.selectPopup button.menu-item', { hasText: tagTitle })
    await expect(quickAdd).toBeVisible()

    await rageClick(quickAdd)

    await expect(issuesDetailsPage.textLabels().filter({ hasText: tagTitle })).toHaveCount(1)

    // Quick-add keeps the popup open for picking more tags - close it before reopening fresh.
    await page.keyboard.press('Escape')
    await expect(page.locator('div.selectPopup')).toHaveCount(0)

    // Button usable again: a second, distinct quick-add still creates exactly one tag.
    await issuesDetailsPage.buttonAddLabel().click()
    await searchInput.fill(tagTitle2)
    await page.locator('div.selectPopup button.menu-item', { hasText: tagTitle2 }).click()
    await expect(issuesDetailsPage.textLabels().filter({ hasText: tagTitle2 })).toHaveCount(1)
  })

  test('Skill remove icon runs once, button usable again', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/recruit`))?.finished()

    const skillTag = `RageSkill-${generateId()}`
    const skillTag2 = `RageSkill2-${generateId()}`

    const navigationMenuPage = new NavigationMenuPage(page)
    const talentsPage = new TalentsPage(page)
    const talentDetailsPage = new TalentDetailsPage(page)

    await navigationMenuPage.clickButtonTalents()
    const talentName = await talentsPage.createNewTalent()
    await talentsPage.openTalentByTalentName(talentName)
    await talentDetailsPage.addSkill(skillTag, 'Rage click skill')
    await talentDetailsPage.checkSkill(skillTag)

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const tagItem = page.locator('div.tag-item', { hasText: skillTag })
    await rageClick(tagItem.locator('button'))

    await expect(page.locator('div.tag-item', { hasText: skillTag })).toHaveCount(0)
    expect(errors).toEqual([])

    // Button usable again: a second skill can still be added and removed exactly once.
    await talentDetailsPage.addSkill(skillTag2, 'Rage click skill 2')
    await talentDetailsPage.checkSkill(skillTag2)
    await page.locator('div.tag-item', { hasText: skillTag2 }).locator('button').click()
    await expect(page.locator('div.tag-item', { hasText: skillTag2 })).toHaveCount(0)
  })
})
