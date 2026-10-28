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
import { UserProfilePage } from '../model/profile/user-profile-page'
import { generateId, PlatformSetting, PlatformURI, PlatformUser, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. NestedDropdown (packages/ui) has no data-id/distinguishing label - both class pickers
// default to the same "Select Item" text - so class A/B are targeted by their shared ancestor:
// AssociationEditor.svelte wraps each side in its own `.flex-col.p-4.flex-gap-2`, with a small
// `.flex-col-center` "A"/"B" marker next to it; the NestedDropdown button is the only <button> in
// that wrapper (the name EditBox is an <input>).
test.describe('Rage click: association editor', () => {
  test('Save creates exactly one Association on the first save, and recovers', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
    const userProfilePage = new UserProfilePage(page)
    await userProfilePage.clickSettings()
    await page.locator('#navGroup-setting').getByRole('button', { name: 'Relations' }).click()
    await page.getByRole('button', { name: 'Add relation' }).click()

    const sideA = page.locator('div.flex-col.p-4.flex-gap-2', {
      has: page.locator('div.flex-col-center', { hasText: 'A' })
    })
    const sideB = page.locator('div.flex-col.p-4.flex-gap-2', {
      has: page.locator('div.flex-col-center', { hasText: 'B' })
    })

    await sideA.locator('button').click()
    await page.locator('.selectPopup button.menu-item', { hasText: 'Document' }).click()
    await sideB.locator('button').click()
    await page.locator('.selectPopup button.menu-item', { hasText: 'File' }).first().click()

    const nameA = `RageA-${generateId(8)}`
    const nameB = `RageB-${generateId(8)}`
    await sideA.locator('input').fill(nameA)
    await sideB.locator('input').fill(nameB)

    // saving guards the whole body (createDoc + dispatch('create')/dispatch('close')); without it,
    // 3 rapid clicks on the still-empty (new) association would each call createDoc - no explicit
    // id is passed, so each call produces its own distinct Association doc.
    await rageClick(page.getByRole('button', { name: 'Save', exact: true }))
    await page.waitForTimeout(1000)

    const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
    const config = await loadServerConfig(baseUrl)
    const token = await getWorkspaceToken(
      baseUrl,
      { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
      config
    )
    const rest = createRestClient(token.endpoint, token.workspaceId, token.token)
    const docs = await rest.findAll('core:class:Association' as any, { nameA } as any)
    expect(docs).toHaveLength(1)
    expect((docs[0] as any).nameB).toBe(nameB)

    // Recovered: a successful create closes the editor (dispatch('close')) - the list on the left
    // now shows the new relation exactly once, and clicking "Add relation" again still works.
    await expect(page.locator('button.list-item', { hasText: nameA })).toHaveCount(1)
    await page.getByRole('button', { name: 'Add relation' }).click()
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  })
})
