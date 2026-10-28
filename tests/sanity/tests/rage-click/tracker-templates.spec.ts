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
import { TemplatePage } from '../model/tracker/templates-page'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: text templates', () => {
  test.beforeEach(async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
  })

  test('Save template creates one template, not three', async ({ page }, testInfo) => {
    const title = `RageTemplate-${generateId(6)}`
    const title2 = `RageTemplate2-${generateId(6)}`
    const templatePage = new TemplatePage(page)
    // .first(): the tree column and the view-mode content column share this class, and the
    // content column also renders the saved title as plain text once mode flips to View.
    const column = page.locator('div.hulyComponent-content__column').first()

    await templatePage.openProfileMenu()
    await templatePage.openSettings()
    await templatePage.goToNotifications()
    await templatePage.selectTextTemplates()

    await templatePage.createTemplateButton().click()
    await templatePage.newTemplateInput().fill(title)
    await templatePage.proseMirrorEditor().fill('rage click body')
    await expect(templatePage.saveTemplateButton()).toBeEnabled({ timeout: 15000 })

    await rageClick(templatePage.saveTemplateButton())
    await expect(templatePage.saveTemplateButton()).toHaveCount(0)
    await expect(column.getByText(title, { exact: true })).toHaveCount(1)

    // Button usable again: a second, distinct template still saves exactly once.
    await templatePage.createTemplateButton().click()
    await templatePage.newTemplateInput().fill(title2)
    await templatePage.proseMirrorEditor().fill('rage click body 2')
    await expect(templatePage.saveTemplateButton()).toBeEnabled({ timeout: 15000 })
    await templatePage.saveTemplateButton().click()
    await expect(column.getByText(title2, { exact: true })).toHaveCount(1)
  })
})
