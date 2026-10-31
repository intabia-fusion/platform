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

import { createRestClient, getWorkspaceToken, loadServerConfig, type RestClient } from '@hcengineering/api-client'
import core, { type Doc } from '@hcengineering/core'
import love, { type Floor, type Room } from '@hcengineering/love'
import { expect, type Locator, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { OfficePage } from '../model/love/office-page'
import { PlatformSetting, PlatformURI, PlatformUser, generateId, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.

const SANITY_WS = 'sanity-ws'

/** Plain-user REST client for sanity-ws: enough to count Room/Floor docs created by the UI. */
async function sanityRestClient (): Promise<RestClient> {
  const baseUrl = (PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUser, password: '1234', workspace: SANITY_WS },
    config
  )
  return createRestClient(token.endpoint, token.workspaceId, token.token)
}

async function enterFloorEditMode (office: OfficePage): Promise<void> {
  const page = office.page
  await (await page.goto(`${PlatformURI}/workbench/${SANITY_WS}/love`))?.finished()
  await expect(office.floorGrid()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: 'Edit office' }).click()
}

/** The "+" icon button has no accessible name (icon-only); it is the button right before
 *  "Done" in the header's actions slot - the only other button there. */
function addRoomButton (office: OfficePage): Locator {
  return office.page.getByRole('button', { name: 'Done' }).locator('xpath=preceding-sibling::button[1]')
}

// Background noise unrelated to any click under test: a periodic billing/limits poll that
// 401s for a non-owner account, independent of what the test does.
const IGNORED_ERROR = /billing|limitsindicator|tokenwindow|failed to load resource.*401/i

function watchErrors (page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    if (!IGNORED_ERROR.test(err.message)) errors.push(err.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORED_ERROR.test(msg.text())) errors.push(msg.text())
  })
  return errors
}

// Only the Office sidebar widget renders FloorPreview with per-floor delete buttons.
async function openOfficeWidget (page: Page): Promise<void> {
  // The bare workbench root can restore another test's Office tab for this shared account.
  await (await page.goto(`${PlatformURI}/workbench/${SANITY_WS}/tracker`))?.finished()
  // The main Office application has the same button id as the sidebar widget.
  await page.locator('#sidebar [id="app-love\\:string\\:Office"]').click()
}

test.describe('Rage click: love (office)', () => {
  test('AddRoomPopup "Meeting room" creates one room, not three', async ({ page }) => {
    test.setTimeout(60000)
    const office = new OfficePage(page)
    const sys = await sanityRestClient()
    const before = await sys.findAll<Room>(love.class.Room, {})
    const beforeIds = new Set(before.map((r) => r._id))
    let newDocs: Doc[] = []

    try {
      await enterFloorEditMode(office)
      await addRoomButton(office).click()
      const popup = page.locator('.antiPopup')
      const meetingRoomBtn = popup.getByRole('button', { name: 'Meeting room', exact: true })
      await expect(meetingRoomBtn).toBeVisible({ timeout: 5000 })

      await rageClick(meetingRoomBtn)

      await expect
        .poll(async () => (await sys.findAll<Room>(love.class.Room, {})).length, { timeout: 15000 })
        .toBe(before.length + 1)
      const after = await sys.findAll<Room>(love.class.Room, {})
      newDocs = after.filter((r) => !beforeIds.has(r._id))
      expect(newDocs).toHaveLength(1)

      // Works again: the popup closed after the single create: it can be reopened and the
      // button is not stuck in a loading state.
      await addRoomButton(office).click()
      const meetingRoomBtnAgain = page.locator('.antiPopup').getByRole('button', { name: 'Meeting room', exact: true })
      await expect(meetingRoomBtnAgain).toBeEnabled({ timeout: 5000 })
      await page.keyboard.press('Escape')
    } finally {
      await Promise.all(newDocs.map((d) => sys.removeDoc(d._class, d.space, d._id).catch(() => {})))
    }
  })

  test('AddRoomPopup "Floor" creates one floor, not three', async ({ page }) => {
    test.setTimeout(60000)
    const office = new OfficePage(page)
    const sys = await sanityRestClient()
    const before = await sys.findAll<Floor>(love.class.Floor, {})
    const beforeIds = new Set(before.map((f) => f._id))
    let newDocs: Doc[] = []

    try {
      await enterFloorEditMode(office)
      await addRoomButton(office).click()
      const popup = page.locator('.antiPopup')
      const floorBtn = popup.getByRole('button', { name: 'Floor', exact: true })
      await expect(floorBtn).toBeVisible({ timeout: 5000 })

      await rageClick(floorBtn)

      await expect
        .poll(async () => (await sys.findAll<Floor>(love.class.Floor, {})).length, { timeout: 15000 })
        .toBe(before.length + 1)
      const after = await sys.findAll<Floor>(love.class.Floor, {})
      newDocs = after.filter((f) => !beforeIds.has(f._id))
      expect(newDocs).toHaveLength(1)

      // Works again: creating a floor switches onto it and closes the popup; reopening and
      // the Floor button must not be stuck loading.
      await addRoomButton(office).click()
      const floorBtnAgain = page.locator('.antiPopup').getByRole('button', { name: 'Floor', exact: true })
      await expect(floorBtnAgain).toBeEnabled({ timeout: 5000 })
      await page.keyboard.press('Escape')
    } finally {
      await Promise.all(newDocs.map((d) => sys.removeDoc(d._class, d.space, d._id).catch(() => {})))
    }
  })

  test('Media settings button opens one popup, not three', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/${SANITY_WS}`))?.finished()

    const mediaButton = page.locator('.hot-controls-container button').first()
    await expect(mediaButton).toBeVisible({ timeout: 15000 })

    await rageClick(mediaButton)

    await expect(page.locator('.antiPopup.mediaPopup')).toHaveCount(1, { timeout: 5000 })

    await page.keyboard.press('Escape')
    await expect(page.locator('.antiPopup.mediaPopup')).toHaveCount(0)

    // Works again: not stuck `pressed`/disabled after the popup closed.
    await mediaButton.click()
    await expect(page.locator('.antiPopup.mediaPopup')).toHaveCount(1)
    await page.keyboard.press('Escape')
  })

  test('FloorPreview trash icon removes the floor once, not three times', async ({ page }) => {
    test.setTimeout(60000)
    const sys = await sanityRestClient()
    const errors = watchErrors(page)
    const floorName = `Rage click floor ${generateId(8)}`
    const floorId = await sys.createDoc(love.class.Floor, core.space.Workspace, { name: floorName })
    let removed = false

    try {
      await openOfficeWidget(page)
      // `id={'floor-' + floor._id}` (FloorPreview.svelte) is passed to AccordionItem only as a
      // collapse-state key (`getTreeCollapsed`/`setTreeCollapsed`, packages/ui) - it is never
      // bound to the DOM, so the row is found by its (REST-unique) name instead. The whole row
      // (title + the "actions" slot) renders as one `<button class="hulyAccordionItem-header">`.
      const item = page.locator('.hulyAccordionItem-header', { hasText: floorName }).first()
      // The rail icon toggles the widget: if it was already open (state restored for this shared
      // account), the first click closes it. Click again until the floor list shows.
      await expect(async () => {
        if (!(await item.isVisible())) await page.locator('#sidebar [id="app-love\\:string\\:Office"]').click()
        await expect(item).toBeVisible({ timeout: 3000 })
      }).toPass({ timeout: 15000 })
      // The delete icon only renders for an empty floor (rooms.length === 0, true here) and is
      // the first of the (at most two) actions buttons - the "..." menu is the second. Nested
      // inside the header button, so plain CSS rather than `getByRole`.
      const trashBtn = item.locator('.hulyAccordionItem-header__tools button').first()
      await expect(trashBtn).toBeVisible({ timeout: 5000 })
      errors.length = 0

      await rageClick(trashBtn)
      removed = true

      await expect(item).toHaveCount(0, { timeout: 15000 })
      await expect
        .poll(async () => await sys.findOne(love.class.Floor, { _id: floorId }), { timeout: 5000 })
        .toBe(undefined)
      // A second/third `client.remove()` on an already-removed floor is exactly the race the
      // guard prevents - it would surface as a console error here.
      expect(errors, `console/page errors from the rage click: ${errors.join('; ')}`).toEqual([])
    } finally {
      if (!removed) {
        await sys.removeDoc(love.class.Floor, core.space.Workspace, floorId).catch(() => {})
      }
    }
  })
})
