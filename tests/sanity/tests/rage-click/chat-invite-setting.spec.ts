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

import { createRestClient, type RestClient, getWorkspaceToken, loadServerConfig } from '@hcengineering/api-client'
import { expect } from '@playwright/test'
import { test } from '../fixtures'
import { UserProfilePage } from '../model/profile/user-profile-page'
import { OwnersPage } from '../model/workspace/owner-pages'
import { ButtonType, WorkspaceSettingsPage } from '../model/workspace/workspace-settings-page'
import { PlatformSetting, PlatformURI, PlatformUser, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

async function restClient (): Promise<RestClient> {
  const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
    config
  )
  return createRestClient(token.endpoint, token.workspaceId, token.token)
}

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. InviteSettings is a single doc per workspace, so the create-vs-update race the `saving`
// guard fixes only exists while none exists yet. sanity-ws is shared and persistent, so this test
// forces that precondition itself: read the current doc via REST, delete it, run the rage click,
// then restore the original doc (same _id) in `finally` so no other test's assumptions change.
test.describe('Rage click: invite settings', () => {
  test('Save creates exactly one InviteSettings doc on the first-ever save, and restores state', async ({ page }) => {
    const rest = await restClient()
    const existing = await rest.findAll('setting:class:InviteSettings' as any, {} as any)
    for (const doc of existing) {
      await rest.removeDoc('setting:class:InviteSettings' as any, 'core:space:Workspace' as any, (doc as any)._id)
    }

    try {
      await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
      const userProfilePage = new UserProfilePage(page)
      await userProfilePage.clickSettings()
      await new WorkspaceSettingsPage(page).selectWorkspaceSettingsTab(ButtonType.InviteSettings)

      const ownersPage = new OwnersPage(page)
      await expect(ownersPage.linkValidFor()).toBeVisible({ timeout: 10000 })
      await ownersPage.linkValidFor().fill('72')

      // setInviteSettings() takes the create branch only while existingInviteSettings is empty -
      // without the `saving` guard, 3 rapid clicks would each read that same empty snapshot and
      // each call createDoc, producing 3 separate InviteSettings docs for the workspace.
      await rageClick(ownersPage.saveButton())
      await page.waitForTimeout(1000)

      const afterSave = await rest.findAll('setting:class:InviteSettings' as any, {} as any)
      expect(afterSave).toHaveLength(1)
      expect((afterSave[0] as any).expirationTime).toBe(72)

      // Usable again: a second, normal save still works (now on the update branch).
      await ownersPage.linkValidFor().fill('96')
      await ownersPage.saveButton().click()
      await page.waitForTimeout(1000)
      const afterSecondSave = await rest.findAll('setting:class:InviteSettings' as any, {} as any)
      expect(afterSecondSave).toHaveLength(1)
      expect((afterSecondSave[0] as any).expirationTime).toBe(96)
    } finally {
      const mine = await rest.findAll('setting:class:InviteSettings' as any, {} as any)
      for (const doc of mine) {
        await rest.removeDoc('setting:class:InviteSettings' as any, 'core:space:Workspace' as any, (doc as any)._id)
      }
      for (const doc of existing) {
        const { _id, _class, space, modifiedBy, modifiedOn, createdBy, createdOn, ...attrs } = doc as any
        await rest.createDoc('setting:class:InviteSettings' as any, 'core:space:Workspace' as any, attrs as any, _id)
      }
    }
  })
})
