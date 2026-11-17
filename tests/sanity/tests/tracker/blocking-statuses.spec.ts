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

import { expect, test, type BrowserContext, type Locator, type Page } from '../fixtures'
import { SettingsPage } from '../model/settings-page'
import { WorkflowPage } from '../model/workflow-page'
import { createAccountAndWorkspace, generateId, generateTestData, setTestOptions } from '../utils'

test.describe.configure({ mode: 'serial' })

test.describe('Statuses without outgoing transitions in workflow settings', () => {
  let context: BrowserContext
  let page: Page
  let settings: SettingsPage
  let workflows: WorkflowPage
  const data = generateTestData()
  const typeName = `Blocked-${generateId(4)}`
  const workflowName = `Flow-${generateId(4)}`
  const deadEnd = `Dead-${generateId(4)}`
  let workflowCreated = false

  const missingInList = (): Locator => workflows.workflowRow(workflowName).locator('[data-id="workflow-no-outgoing"]')
  const missingInEditor = (): Locator => page.locator('[data-id="workflow-no-outgoing"]')

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    await page.addInitScript(() => {
      localStorage.setItem('lang', 'en')
    })
    await createAccountAndWorkspace(page, page.request, data)
    await setTestOptions(page)
    await page.reload()
    settings = new SettingsPage(page)
    workflows = new WorkflowPage(page)
    await settings.openProfileMenu()
    await settings.openSettings()
    await settings.createSpaceType(typeName, 'Tracker')
    await settings.openTaskType('Classic Issue')
  })

  test.afterAll(async () => {
    try {
      await settings.selectSpaceType(typeName, 'Tracker')
      if (workflowCreated) {
        await workflows.openWorkflow(workflowName)
        await workflows.deleteWorkflow()
        await settings.selectSpaceType(typeName, 'Tracker')
      }
      await settings.deleteOpenedSpaceType()
    } finally {
      await context.close()
    }
  })

  test('shows statuses without outgoing transitions in the list and editor', async () => {
    await settings.addState(deadEnd)
    await settings.selectSpaceType(typeName, 'Tracker')
    await workflows.createWorkflow(workflowName)
    workflowCreated = true

    await expect(missingInList()).toContainText('No transitions')
    await expect(missingInList()).toContainText(deadEnd)
    await expect(missingInList()).not.toContainText('Done')

    await workflows.openWorkflow(workflowName)
    await expect(missingInEditor()).toContainText('No transitions')
    await expect(missingInEditor()).toContainText(deadEnd)
    await workflows.addTransition('Finish', 'Any status', 'Done')
    await expect(missingInEditor()).toHaveCount(0)

    await settings.selectSpaceType(typeName, 'Tracker')
    await expect(missingInList()).toHaveCount(0)
  })

  test('updates chips after transition changes and ignores cycles with outgoing transitions', async () => {
    await workflows.openWorkflow(workflowName)
    await workflows.openTransition('Finish')
    await workflows.removeTransition()
    await workflows.addTransition('Plan', ['Backlog'], 'Todo')
    await workflows.addTransition('Start', ['Todo'], 'In Progress')
    await workflows.addTransition('Return', ['In Progress'], 'Todo')

    await expect(missingInEditor()).toContainText(deadEnd)
    await expect(missingInEditor()).not.toContainText('Todo')
    await expect(missingInEditor()).not.toContainText('In Progress')

    await settings.selectSpaceType(typeName, 'Tracker')
    await expect(missingInList()).toContainText(deadEnd)
    await expect(missingInList()).not.toContainText('Todo')

    await workflows.openWorkflow(workflowName)
    await workflows.addTransition('Complete', ['In Progress'], 'Done')
    await expect(missingInEditor()).toContainText(deadEnd)
    await expect(missingInEditor()).not.toContainText('In Progress')
  })
})
