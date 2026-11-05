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

import { expect, test } from './fixtures'
import { PlatformSetting, PlatformURI } from './utils'
import { RecruitingPage } from './model/recruiting/recruiting-page'

test.use({
  storageState: PlatformSetting
})
test.describe('workbench tests', () => {
  let recruitingPage: RecruitingPage
  test.beforeEach(async ({ page }) => {
    recruitingPage = new RecruitingPage(page)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('navigator', async ({ page }) => {
    const platformUri = `${PlatformURI}/workbench/sanity-ws`

    await recruitingPage.navigateToRecruitApplication(platformUri)
    await recruitingPage.openRecruitApplication()
    await recruitingPage.checkApplicationsVisibility()
    await recruitingPage.verifyTalentSection()
    await recruitingPage.navigateToVacanciesAndCheckSoftwareEngineer()
    await recruitingPage.navigateToGeneralChatAndContacts()
  })
  test('check-for-last-loc', async ({ page }) => {
    await page.click('[id="app-recruit\\:string\\:RecruitApplication"]')
    await expect(page).toHaveURL(`${PlatformURI}/workbench/sanity-ws/recruit`)
    const urlToCheck = page.url()
    await page.goto(`${PlatformURI}`)
    await expect(page).toHaveURL(urlToCheck)
  })
})

// Notifications have a separate button; the remaining modules use Applications.
for (const { alias, label } of [
  { alias: 'love', label: 'love:string:Office' },
  { alias: 'notification', label: 'notification:string:Inbox' },
  { alias: 'tracker', label: 'tracker:string:TrackerApplication' },
  { alias: 'chunter', label: 'chunter:string:ApplicationLabelChunter' },
  { alias: 'document', label: 'document:string:DocumentApplication' },
  { alias: 'time', label: 'time:string:Planner' }
]) {
  test(`active module click preserves context and menu: ${alias}`, async ({ page }) => {
    const previousAlias = alias === 'tracker' ? 'chunter' : 'tracker'
    await page.addInitScript(() => {
      localStorage.setItem('hiddenNavigator', 'false')
      localStorage.setItem('love-visibleNav', 'true')
    })
    await page.goto(`${PlatformURI}/workbench/sanity-ws/${previousAlias}`)
    const app = page.locator(`[id="app-${label}"]`)
    await expect(page.locator(`.antiPanel-application button.selected[id^="app-${previousAlias}:"]`)).toBeVisible()
    await app.click()
    await expect(app).toHaveClass(/selected/)
    await expect(page).toHaveURL(new RegExp(`/workbench/sanity-ws/${alias}(?:[/?#]|$)`))

    const hideMenu = page.locator('[id="app-workbench:string:HideMenu"]')
    const showMenu = page.locator('[id="app-workbench:string:ShowMenu"]')
    if (alias === 'love') {
      await expect(hideMenu).toBeHidden()
      await expect(showMenu).toBeHidden()
      await expect(page.locator('.antiPanel-navigator')).toHaveCount(0)
      const currentUrl = page.url()
      await app.click()
      await expect(page).toHaveURL(currentUrl)
      await expect(app).toHaveClass(/selected/)
      await expect(hideMenu).toBeHidden()
      await expect(showMenu).toBeHidden()
      return
    }
    await expect(hideMenu).toBeVisible()
    await expect(hideMenu.locator('use')).toHaveAttribute('href', /#arrow-bar-to-left$/)
    if (alias === 'tracker') {
      await page.locator('.antiPanel-navigator a[href$="all-issues"]').click()
      await expect(page).toHaveURL(/\/tracker\/all-issues(?:[/?#]|$)/)
    }
    const currentUrl = page.url()
    await app.click()
    await expect(hideMenu).toBeVisible()
    await expect(page).toHaveURL(currentUrl)
    await expect(app).toHaveClass(/selected/)

    await hideMenu.click()
    await expect(showMenu).toBeVisible()
    await expect(showMenu.locator('use')).toHaveAttribute('href', /#arrow-bar-to-right$/)
    await app.click()
    await expect(showMenu).toBeVisible()
    await expect(page).toHaveURL(currentUrl)
    await expect(app).toHaveClass(/selected/)

    await showMenu.click()
    await expect(hideMenu).toBeVisible()
  })
}
