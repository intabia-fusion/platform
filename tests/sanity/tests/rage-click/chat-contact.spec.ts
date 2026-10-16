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
import { ContractPage } from '../model/contacts/contract-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { TeamPage } from '../model/team-page'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: contact', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('"+ Add member" opens one popup, adds the member once', async ({ page }) => {
    const orgId = `Company-${generateId()}`
    const contractPage = new ContractPage(page)

    await contractPage.clickAppContact()
    await contractPage.clickEmployeeNavElement('Company')
    await contractPage.clickAddCompany()
    await contractPage.fillCompanyInput(orgId)
    await contractPage.clickCreateCompany()
    await contractPage.waitForFormAntiCardDetached()
    await contractPage.clickCompanyByName(orgId)

    // addingMember stays true for as long as the popup is open: without the guard, a rage click
    // opens one stacked UsersPopup per click.
    await rageClick(contractPage.addMember())
    await expect(page.locator('div.selectPopup')).toHaveCount(1)

    await contractPage.clickEmployeeButton('Chen Rosamund')
    await contractPage.clickSelectMember()
    await contractPage.clickOpenNewMember(orgId)
    await contractPage.checkIfNewMemberIsAdded()
    await expect(page.locator('.antiTable-body__row', { hasText: 'Chen Rosamund' })).toHaveCount(1)

    // Usable again: the "+" still opens a (single) popup afterwards.
    await contractPage.clickAddMember()
    await expect(page.locator('div.selectPopup')).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('Team Planner "Members" picker opens one popup and commits one pick', async ({ page }) => {
    const leftSideMenuPage = new LeftSideMenuPage(page)
    const teamPage = new TeamPage(page)

    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/time`))?.finished()
    await page.evaluate(() => {
      localStorage.removeItem('planner_extra_persons')
    })
    await leftSideMenuPage.clickPlanner()
    await teamPage.checkTeamPageIsOpened()

    // The button's own locator is filtered by hasText 'Members', which stops matching once a pick
    // replaces that label - find its position in the group once, reuse the button by position.
    const actionButtons = page.locator('div.hulyHeader-container .hulyHeader-buttonsGroup.actions button')
    const actionCount = await actionButtons.count()
    let memberButtonIndex = -1
    for (let i = 0; i < actionCount; i++) {
      if ((await actionButtons.nth(i).innerText()).includes('Members')) {
        memberButtonIndex = i
        break
      }
    }
    expect(memberButtonIndex).toBeGreaterThanOrEqual(0)
    const memberButton = actionButtons.nth(memberButtonIndex)

    // popupResult guards showPopup itself (synchronous): without it, a rage click stacks one
    // UsersPopup per click, each able to fire its own competing dispatch('update').
    await rageClick(memberButton)
    await expect(page.locator('div.selectPopup')).toHaveCount(1)

    await teamPage.selectMenuItem(page, 'Dirak Kainin')
    await page.keyboard.press('Escape')

    // persons.length === 1 replaces the "Members" label with the picked person's name - proof
    // only one update landed, not reverted/overwritten by a second stacked popup.
    await expect(memberButton).toContainText('Dirak Kainin')
    await expect(memberButton).not.toContainText('Members')
  })
})
