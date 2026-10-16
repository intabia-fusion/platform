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

import { expect, type Locator, type Page } from '@playwright/test'
import { test } from '../fixtures'
import { generateId, PlatformSetting, PlatformURI, rageClick } from '../utils'

test.use({
  storageState: PlatformSetting
})

function uniqueName (prefix: string): string {
  return `${prefix}-${generateId(6)}`
}

// The closest ".hulyNavGroup-container" ancestor of this project's own header label - not the
// outer "Projects" group, which textually contains every project and would match just as well.
function projectNavGroup (page: Page, projectName: string): Locator {
  return page
    .locator('span.overflow-label', { hasText: projectName })
    .locator('xpath=ancestor::div[contains(concat(" ", @class, " "), " hulyNavGroup-container ")][1]')
}

// Creates a fresh Test Management project with one test case in it, and leaves the page on that
// project's "Test library" view.
async function createProjectWithTestCase (page: Page, projectName: string, caseName: string): Promise<void> {
  await (await page.goto(`${PlatformURI}/workbench/sanity-ws/testManagement`))?.finished()

  // The "+" button next to "Projects" only turns opaque while the header row is hovered.
  await page.locator('.hulyNavGroup-header', { hasText: 'Projects' }).hover()
  await page.locator('#tree-projects').click()
  const projectForm = page.locator('div.popup, form').first()
  await projectForm.locator('input, [contenteditable="true"]').first().fill(projectName)
  await projectForm.getByRole('button', { name: 'Create', exact: true }).click()
  // Scope to this test's own project: .hulyNavGroup-container nests (outer "Projects" group wraps
  // every project's own group), so matching by text picks up every ancestor - take the closest one.
  const projectNav = projectNavGroup(page, projectName)
  await expect(projectNav.getByRole('button', { name: 'Test library', exact: true })).toBeVisible({ timeout: 10000 })

  await projectNav.getByRole('button', { name: 'Test library', exact: true }).click()
  await page.getByRole('button', { name: 'New test case', exact: true }).click()
  const caseForm = page.locator('div.popup, form.antiCard').first()
  await caseForm.locator('input, [contenteditable="true"]').first().fill(caseName)
  await caseForm.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText(caseName, { exact: true })).toBeVisible({ timeout: 10000 })
}

// The row's checkbox only renders at opacity 0 until the row is hovered.
async function selectTestCase (page: Page, caseName: string): Promise<void> {
  const row = page.locator('tr', { hasText: caseName })
  await row.scrollIntoViewIfNeeded()
  const box = await row.locator('label.checkbox-container').first().boundingBox()
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  }
  await row.locator('label.checkbox-container').first().click()
  await page
    .locator('div.popup', { hasText: 'Select test cases' })
    .getByRole('button', { name: 'Save', exact: true })
    .click()
}

// FUSIO-1584: a rage click on an async button runs its action once, and the button works again after.
test.describe('Rage click: test management', () => {
  test('"Save" on Create Test Plan creates one test plan', async ({ page }) => {
    const projectName = uniqueName('RageTMProj')
    const caseName = uniqueName('RageTMCase')
    const planName = uniqueName('RageTMPlan')
    await createProjectWithTestCase(page, projectName, caseName)

    const projectNav = projectNavGroup(page, projectName)
    await projectNav.getByRole('button', { name: 'Test plans', exact: true }).click()
    await page.getByRole('button', { name: 'New test plan', exact: true }).click()
    await page.getByPlaceholder('Test plan title').fill(planName)
    await page.getByRole('button', { name: 'Test cases not selected', exact: true }).click()
    await selectTestCase(page, caseName)

    const saveButton = page.getByRole('button', { name: 'Save', exact: true })
    await expect(saveButton).toBeEnabled({ timeout: 10000 })
    await rageClick(saveButton)

    // The panel closes back to the list on success - not stuck mid-save.
    await expect(page.getByRole('button', { name: 'New test plan', exact: true })).toBeVisible({ timeout: 10000 })
    // Without the guard, a rage click creates 3 TestPlan docs with the same name instead of 1 - each
    // test plan is its own row in the left column, named after the "name" field.
    await expect(page.getByRole('button', { name: planName, exact: true })).toHaveCount(1)

    // The button is usable again: opens a fresh, working create panel.
    await page.getByRole('button', { name: 'New test plan', exact: true }).click()
    await expect(page.getByPlaceholder('Test plan title')).toBeVisible({ timeout: 10000 })
  })

  test('"Save" on Create Test Run creates one test run', async ({ page }) => {
    const projectName = uniqueName('RageTMProj')
    const caseName = uniqueName('RageTMCase')
    const runName = uniqueName('RageTMRun')
    await createProjectWithTestCase(page, projectName, caseName)

    const projectNav = projectNavGroup(page, projectName)
    await projectNav.getByRole('button', { name: 'Test runs', exact: true }).click()
    await page.getByRole('button', { name: 'New test run', exact: true }).click()
    await page.getByPlaceholder('Test run name').fill(runName)
    await page.getByRole('button', { name: 'Test cases not selected', exact: true }).click()
    await selectTestCase(page, caseName)

    const saveButton = page.getByRole('button', { name: 'Save', exact: true })
    await expect(saveButton).toBeEnabled({ timeout: 10000 })
    await rageClick(saveButton)

    // Save navigates to the created run on success - not stuck mid-save.
    await expect(page).toHaveURL(/testRuns\?/, { timeout: 10000 })
    await projectNav.getByRole('button', { name: 'Test runs', exact: true }).click()
    // Without the guard, a rage click creates 3 TestRun docs with the same name instead of 1.
    await expect(page.getByRole('button', { name: runName, exact: true })).toHaveCount(1)

    // The button is usable again: opens a fresh, working create panel.
    await page.getByRole('button', { name: 'New test run', exact: true }).click()
    await expect(page.getByPlaceholder('Test run name')).toBeVisible({ timeout: 10000 })
  })
})
