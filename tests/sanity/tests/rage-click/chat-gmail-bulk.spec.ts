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
import { LeftSideMenuPage } from '../model/left-side-menu-page'
import { generateId, PlatformSetting, PlatformURI, PlatformUser, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// No gmail/pod-gmail service runs on this sanity stand, so every NewMessage doc created here is
// an inert DB write - no real email is attempted. Seeds a Gmail Integration + Email Channel on
// the logged-in user's own Person via REST (plain user token, no special access level needed).
async function seedGmailChannel (): Promise<void> {
  const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
    config
  )
  const rest = createRestClient(token.endpoint, token.workspaceId, token.token)

  const account = await rest.getAccount()
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
}

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again
// after. Unlike the single-recipient NewMessage, sendMsgInner() here calls `createDoc` with no
// explicit id, so a rage click without the `sending` guard would create real duplicate
// gmail:class:NewMessage docs - directly countable, no wire-level trick needed.
test.describe('Rage click: gmail bulk', () => {
  test('bulk "Send" ("Write Email" on a contact) creates exactly one message, and recovers', async ({ page }) => {
    await seedGmailChannel()

    await (await page.goto(`${PlatformURI}/workbench/sanity-ws`))?.finished()
    const left = new LeftSideMenuPage(page)
    await left.clickContacts()
    await new ContactsNavigationMenuPage(page).pageHeader().click()

    await page.locator('tr', { hasText: 'Appleseed John' }).first().click({ button: 'right' })
    await page
      .locator('.selectPopup button, .antiPopup button, .popup button')
      .filter({ hasText: 'Write Email' })
      .click()

    const subject = `Rage bulk ${generateId()}`
    await page.getByPlaceholder('Subject').fill(subject)
    const body = page.locator('div.text-editor-view').last()
    await expect(body).toBeVisible({ timeout: 10000 })
    await body.fill(`Rage bulk send ${generateId()}`)

    const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
    const config = await loadServerConfig(baseUrl)
    const token = await getWorkspaceToken(
      baseUrl,
      { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
      config
    )
    const rest = createRestClient(token.endpoint, token.workspaceId, token.token)

    await rageClick(page.getByRole('button', { name: 'Send', exact: true }))
    // sendMsg() finishes with saved/dispatch close; wait for the panel to settle before reading.
    await page.waitForTimeout(2000)

    const docs = await rest.findAll('gmail:class:NewMessage' as any, { subject } as any)
    expect(docs).toHaveLength(1)
  })
})
