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
import { ContactsNavigationMenuPage } from '../model/contacts/navigation-menu-page'
import { EmployeesPage } from '../model/contacts/employees-page'
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { generateId, PlatformSetting, PlatformURI, PlatformUser, rageClick } from '../utils'
import { enableJsonProtocol, trackTxFrames } from './tx-frames'

test.use({
  storageState: PlatformSetting
})

// No gmail/pod-gmail service runs on this sanity stand (tests/docker-compose.yaml has neither),
// so creating a gmail:class:NewMessage doc is an inert DB write - no real email is attempted.
// Seeds its own Gmail Integration + Email Channel on the logged-in user via REST (plain user
// token - setting:class:Integration and contact:class:Channel carry no special access level).
async function seedGmailChannel (): Promise<{ email: string }> {
  const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
    config
  )
  const rest = createRestClient(token.endpoint, token.workspaceId, token.token)

  const account = await rest.getAccount()
  // Main.svelte only offers an Integration as "mine" when createdBy is one of my own
  // EMAIL-type social ids - the REST token's default identity is the "huly" one, so it must be
  // passed explicitly as modifiedBy.
  const emailSocialId = (account as any).fullSocialIds.find((s: any) => s.type === 'email')?._id
  await rest.createDoc(
    'setting:class:Integration' as any,
    'core:space:Workspace' as any,
    { type: 'gmail:integrationType:Gmail', disabled: false, value: 'rage-click@example.com' } as any,
    undefined,
    undefined,
    emailSocialId
  )

  const me = (await rest.findOne('contact:class:Person' as any, { name: 'Appleseed,John' } as any)) as any
  const email = `rage-${generateId(8)}@example.com`
  await rest.addCollection(
    'contact:class:Channel' as any,
    'contact:space:Contacts' as any,
    me._id,
    me._class,
    'channels',
    { provider: 'contact:channelProvider:Email', value: email } as any
  )
  return { email }
}

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. NewMessage's sendMsg() reuses the same `objectId` across concurrent calls (it is only
// regenerated after a successful send), so without the `sending` guard the 2nd/3rd clicks would
// not create distinguishable duplicate docs - they would instead race duplicate-id createDoc
// calls. The guard's real, provable effect is on the wire: how many `gmail:class:NewMessage`
// create tx frames the client actually sends. See ./tx-frames.ts.
test.describe('Rage click: gmail', () => {
  test('"Send" creates exactly one NewMessage, and the dialog works again after', async ({ page }) => {
    const { email } = await seedGmailChannel()

    await enableJsonProtocol(page)
    const tx = trackTxFrames(page)

    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
    const left = new LeftSideMenuPage(page)
    await left.clickContacts()
    await new ContactsNavigationMenuPage(page).pageHeader().click()
    await new EmployeesPage(page).openEmployeeByName('Appleseed John')

    await page.getByText(email).first().click()
    await expect(page.locator('.antiDialog')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Create message' }).click()

    const body = page.locator('.input div.text-editor-view')
    await expect(body).toBeVisible({ timeout: 10000 })
    await body.fill(`Rage send ${generateId()}`)

    const before = tx.frames.length
    await rageClick(page.getByRole('button', { name: 'Send', exact: true }))
    // sendMsg() dispatches 'close' on success, which returns the dialog to the Chats list.
    await expect(page.getByRole('button', { name: 'Create message' })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1000)

    const created = tx.frames
      .slice(before)
      .filter((f) => f._class === 'core:class:TxCreateDoc' && f.objectClass === 'gmail:class:NewMessage')
    expect(created).toHaveLength(1)

    // Usable again: a second message can still be composed and sent from the same dialog.
    await page.getByRole('button', { name: 'Create message' }).click()
    await body.fill(`Rage send again ${generateId()}`)
    const before2 = tx.frames.length
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Create message' })).toBeVisible({ timeout: 15000 })
    const created2 = tx.frames
      .slice(before2)
      .filter((f) => f._class === 'core:class:TxCreateDoc' && f.objectClass === 'gmail:class:NewMessage')
    expect(created2).toHaveLength(1)
  })
})
