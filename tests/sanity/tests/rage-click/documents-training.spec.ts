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
import { expect, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { generateId, PlatformSetting, PlatformURI, PlatformUser, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

// Training (plugins/training-resources) is permission-gated: creating a course needs a role in
// the "Trainings" workspace settings. Grant once, idempotently - the role assignment is shared
// workspace state, not per-test data.
async function ensureQualifiedUserRole (page: Page): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/setting`))?.finished()
  await page.getByRole('button', { name: 'Trainings', exact: true }).click()
  // The role row is an icon-only "Members" button - it never renders member names inline, so
  // membership is read from the popup's check icon. The "selection" class is only the keyboard highlight.
  const membersButton = page
    .locator('div.labelOnPanel', { hasText: 'Qualified Users' })
    .locator('xpath=following-sibling::button[1]')
  await membersButton.click()
  const appleseedItem = page.locator('div.selectPopup div.list-item, div.popup div.list-item', {
    hasText: 'Appleseed John'
  })
  await expect(appleseedItem).toBeVisible({ timeout: 5000 })
  const isMember = (await appleseedItem.locator('.check svg').count()) > 0
  if (!isMember) {
    await appleseedItem.click()
    // AccountArrayEditor saves the selection 500ms after the last change - close only after that.
    await page.waitForTimeout(1000)
  }
  await page.keyboard.press('Escape')
}

// spaceSecurity broadcasts objects of a public space with members only to those members. The
// autoJoin "Trainings" space is created by migration after user1 already exists, so user1 is not
// joined, misses every live update and the panels keep showing stale state until a reload.
async function joinTrainingsSpace (): Promise<void> {
  const baseUrl = PlatformURI.replace(/\/_account\/?$/, '')
  const config = await loadServerConfig(baseUrl)
  const token = await getWorkspaceToken(
    baseUrl,
    { email: PlatformUser, password: '1234', workspace: 'sanity-ws' },
    config
  )
  const rest = createRestClient(token.endpoint, token.workspaceId, token.token)
  const account = JSON.parse(Buffer.from(token.token.split('.')[1], 'base64url').toString()).account
  const space = (await rest.findOne('core:class:Space' as any, { _id: 'training:space:Trainings' } as any)) as any
  if (space.members.includes(account) === true) return
  await rest.updateDoc(
    'core:class:TypedSpace' as any,
    'core:space:Space' as any,
    'training:space:Trainings' as any,
    { $push: { members: account } } as any
  )
}

// Creates a released Training course and a request assigning it to the current user (Appleseed
// John, trainer and trainee at once) - lands the page on the TrainingRequestPanel for the trainee.
async function createReleasedTrainingWithRequest (page: Page, title: string): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/training`))?.finished()
  await page.getByRole('button', { name: 'My trainings', exact: true }).click()

  await page.getByRole('button', { name: 'Training', exact: true }).click()
  const titleField = page.locator('div.popup, form').first().locator('input, [contenteditable="true"]').first()
  await titleField.click()
  await page.keyboard.type(title)
  await page.locator('div.popup, form').first().getByRole('button', { name: 'Create', exact: true }).click()

  await page.getByRole('button', { name: 'Release', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Assign request', exact: true })).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Assign request', exact: true }).click()

  await page.getByRole('button', { name: 'Trainees', exact: true }).click()
  await page.locator('div.selectPopup div.list-item, div.popup div.list-item', { hasText: 'Appleseed John' }).click()
  await page.keyboard.press('Escape')

  const assignForm = page.locator('form[id="training:string:TrainingRequestAssign"]')
  await assignForm.getByRole('button', { name: 'Assign request', exact: true }).click()
  await expect(page).toHaveURL(/training\/requests\//, { timeout: 10000 })
}

async function openMyRequest (page: Page, title: string): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/training/my-requests`))?.finished()
  await page.locator('tr.antiTable-body__row', { hasText: title }).locator('a').first().click()
}

// Navigates away to the request list to read the "Attempt" cell (latest own attempt's seqNumber) -
// call this only after the page under test (the attempt's Submit button) has already been checked.
async function expectAttemptsCount (page: Page, title: string, expected: string): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/training/my-requests`))?.finished()
  await expect(page.locator('tr.antiTable-body__row', { hasText: title }).locator('td').nth(4)).toHaveText(expected, {
    timeout: 10000
  })
}

function uniqueTitle (prefix: string): string {
  return `${prefix}-${generateId(6)}`
}

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: training', () => {
  test.beforeEach(async ({ page }) => {
    await joinTrainingsSpace()
    await ensureQualifiedUserRole(page)
  })

  test('"Take training" creates one attempt', async ({ page }) => {
    const title = uniqueTitle('RageTrainTake')
    await createReleasedTrainingWithRequest(page, title)

    const takeButton = page.getByRole('button', { name: 'Take training', exact: true })
    await expect(takeButton).toBeVisible({ timeout: 10000 })
    await rageClick(takeButton)

    // The button is usable again: landed on a fresh, working attempt page, not stuck mid-creation.
    await expect(page).toHaveURL(/training\/attempts\//, { timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled({ timeout: 10000 })

    // Without the guard, a rage click creates 3 TrainingAttempt docs (seqNumber up to 3) instead of 1.
    await expectAttemptsCount(page, title, '1/∞')
  })

  test('"Retry" on the request panel creates one more attempt', async ({ page }) => {
    const title = uniqueTitle('RageTrainReqRetry')
    await createReleasedTrainingWithRequest(page, title)

    await page.getByRole('button', { name: 'Take training', exact: true }).click()
    await expect(page).toHaveURL(/training\/attempts\//, { timeout: 10000 })
    // 0 questions -> score 0 < passingScore 100 -> the attempt fails, which is what unlocks Retry.
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({ timeout: 10000 })

    await openMyRequest(page, title)
    const retryButton = page.getByRole('button', { name: 'Retry', exact: true })
    await expect(retryButton).toBeVisible({ timeout: 10000 })
    await rageClick(retryButton)

    await expect(page).toHaveURL(/training\/attempts\//, { timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled({ timeout: 10000 })

    // Without the guard, a rage click here creates 2 more attempts (3 total) instead of 1 more (2 total).
    await expectAttemptsCount(page, title, '2/∞')
  })

  test('"Retry" on the attempt panel creates one more attempt', async ({ page }) => {
    const title = uniqueTitle('RageTrainAttemptRetry')
    await createReleasedTrainingWithRequest(page, title)

    await page.getByRole('button', { name: 'Take training', exact: true }).click()
    await expect(page).toHaveURL(/training\/attempts\//, { timeout: 10000 })
    await page.getByRole('button', { name: 'Submit', exact: true }).click()

    // Still on the failed attempt's own page (TrainingAttemptPanel), which carries its own Retry button.
    const retryButton = page.getByRole('button', { name: 'Retry', exact: true })
    await expect(retryButton).toBeVisible({ timeout: 10000 })
    const urlBeforeRetry = page.url()
    await rageClick(retryButton)

    await expect(page).not.toHaveURL(urlBeforeRetry, { timeout: 10000 })
    await expect(page).toHaveURL(/training\/attempts\//, { timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled({ timeout: 10000 })

    // Without the guard, a rage click here creates 2 more attempts (3 total) instead of 1 more (2 total).
    await expectAttemptsCount(page, title, '2/∞')
  })
})
