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

import { createRestClient, getWorkspaceToken, loadServerConfig } from '@hcengineering/api-client'
import { expect } from '@playwright/test'
import { test } from '../fixtures'
import { ChannelPage } from '../model/channel-page'
import { ChunterPage } from '../model/chunter-page'
import { ContactsNavigationMenuPage } from '../model/contacts/navigation-menu-page'
import { EmployeeDetailsPage } from '../model/contacts/employee-details-page'
import { EmployeesPage } from '../model/contacts/employees-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { SidebarPage } from '../model/sidebar-page'
import { generateId, getSecondPage, PlatformSetting, PlatformURI, PlatformUser, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: chunter', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/chunter`))?.finished()
  })

  test('Join overlay joins the channel exactly once', async ({ page, browser }) => {
    const channelName = `RageJoin${generateId()}`
    const chunterPage = new ChunterPage(page)
    const channelPage = new ChannelPage(page)
    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(channelName, false)
    await channelPage.checkIfChannelDefaultExist(true, channelName)

    // Second user, not a member: open the channel via the browse table's name link, not its row
    // "Join" action (a different, unguarded view action) - this mounts ChannelView.svelte, whose
    // own overlay "Join" button carries the guard under test.
    using _page2 = await getSecondPage(browser)
    const page2 = _page2.page
    await (await page2.goto(`${PlatformURI}/workbench/sanity-ws/chunter`))?.finished()
    const channelPage2 = new ChannelPage(page2)
    await channelPage2.clickChannelTab()
    await channelPage2.checkIfChannelTableExist(channelName, true)
    await page2.getByRole('table').getByRole('row').filter({ hasText: channelName }).locator('a').first().click()

    const joinButton = page2.locator('button[data-id="btnJoin"]')
    await expect(joinButton).toBeVisible()
    await rageClick(joinButton)
    await expect(joinButton).toHaveCount(0, { timeout: 15000 })

    // $push is not deduped server-side: a bug here means the account's uuid lands in `members`
    // more than once, invisible in the UI (member lists render from a de-duplicated Set).
    const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
    const config = await loadServerConfig(baseUrl)
    const token = await getWorkspaceToken(
      baseUrl,
      { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
      config
    )
    const rest = createRestClient(token.endpoint, token.workspaceId, token.token)
    const channel = (await rest.findOne('chunter:class:Channel' as any, { name: channelName } as any)) as any
    const occurrences = (channel.members as string[]).filter((m) => m === token.info.account).length
    expect(occurrences).toBe(1)

    // The channel must be usable now - no stuck overlay, messages go through.
    await channelPage2.sendMessage(`hello ${generateId()}`)
  })

  test('"Message" opens one direct chat, and the button works again after', async ({ page }) => {
    const left = new LeftSideMenuPage(page)
    await left.clickContacts()
    await new ContactsNavigationMenuPage(page).pageHeader().click()
    await new EmployeesPage(page).openEmployeeByName('Dirak Kainin')

    const employeeDetailsPage = new EmployeeDetailsPage(page)
    const sidebarPage = new SidebarPage(page)
    await expect(employeeDetailsPage.buttonDirectMessage()).toBeVisible()

    await rageClick(employeeDetailsPage.buttonDirectMessage())

    // openDirectForPerson races a find-or-create: unguarded, 3 near-simultaneous calls can each
    // create their own DirectMessage doc and open their own sidebar tab for the same person.
    await expect(sidebarPage.verticalTabByName('Dirak Kainin')).toHaveCount(1, { timeout: 15000 })

    // Still usable: closing and reopening does not add a second tab.
    await sidebarPage.closeOpenedVerticalTab()
    await employeeDetailsPage.buttonDirectMessage().click()
    await expect(sidebarPage.verticalTabByName('Dirak Kainin')).toHaveCount(1, { timeout: 15000 })
  })

  test('"Save for later" saves the message exactly once, and recovers', async ({ page }) => {
    const chunterPage = new ChunterPage(page)
    const channelPage = new ChannelPage(page)
    const channelName = `RageSave${generateId()}`
    const message = `Rage save me ${generateId()}`

    await chunterPage.clickAddChannel()
    await chunterPage.createChannel(channelName, true)
    await channelPage.sendMessage(message)
    await channelPage.checkMessageExist(message, true, message)

    // saveForLater() is an unconditional createDoc, not a toggle - 3 rapid clicks before the
    // button swaps to "Remove from saved" would create 3 duplicate SavedMessage docs.
    const saveButton = channelPage.messageActionButton(message, 'data-id$="SaveForLaterAction"')
    await channelPage.textMessage(message).last().hover()
    await expect(saveButton).toBeVisible()
    await rageClick(saveButton)
    await expect(channelPage.messageSaveMarker()).toBeVisible()

    await channelPage.clickSaveMessageTab()
    await expect(page.locator('.activityMessage', { hasText: message })).toHaveCount(1)

    // Usable again: remove it from saved and it disappears from the Saved tab.
    await channelPage.removeMessageFromSaved(message)
    await expect(page.locator('.activityMessage', { hasText: message })).toHaveCount(0)
  })
})
