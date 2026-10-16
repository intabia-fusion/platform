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
import { DocumentsPage } from '../model/documents/documents-page'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. plugins/view-resources/src/components/navigator/TreeElement.svelte's shared inlineBusy
// guard covers every NavGroup/NavItem inline-action icon - Tracker's own Project rows never render
// this shape (always 3+ actions, so they fall to the unguarded "more" overflow instead), but
// Document Teamspace rows do: models/document/src/index.ts registers document.action.CreateDocument
// with inline:true, which renders as the NavGroup inline-action icon (TreeElement.svelte's "Spot A").
test.describe('Rage click: navigator tree (wire-level)', () => {
  test('Teamspace inline "+" creates one document, not three', async ({ page }) => {
    const teamspaceName = `RageTeamspace-${generateId()}`
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/document`))?.finished()
    const documentsPage = new DocumentsPage(page)

    try {
      await documentsPage.createNewTeamspace({ title: teamspaceName })
      await documentsPage.checkTeamspaceExist(teamspaceName)

      const header = page.locator('button.hulyNavGroup-header span[class*="label"]', { hasText: teamspaceName })
      const inlineAdd = page.locator(
        `xpath=//span[text()="${teamspaceName}"]/../../div[@class="hulyNavGroup-header__tools"]/button[1]`
      )
      const docRows = header.locator('xpath=../../following-sibling::div[1]').locator('button.hulyNavItem-container')

      await header.hover()
      await expect(inlineAdd).toBeVisible()
      await rageClick(inlineAdd)
      await expect(docRows).toHaveCount(1, { timeout: 10000 })

      // Button usable again: a plain click still creates exactly one more document.
      await header.hover()
      await expect(inlineAdd).toBeVisible()
      await inlineAdd.click()
      await expect(docRows).toHaveCount(2, { timeout: 10000 })
    } finally {
      const { client } = await connectTracker()
      try {
        const teamspaceClass = 'document:class:Teamspace' as any
        const documentClass = 'document:class:Document' as any
        for (const ts of await client.findAll(teamspaceClass, { name: teamspaceName })) {
          for (const doc of await client.findAll(documentClass, { space: ts._id } as any)) {
            await client.remove(doc)
          }
          await client.remove(ts)
        }
      } finally {
        await client.close()
      }
    }
  })
})
