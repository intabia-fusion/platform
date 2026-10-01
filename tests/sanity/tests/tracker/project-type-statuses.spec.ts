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
import { IssuesPage } from '../model/tracker/issues-page'
import { NewProjectPage } from '../model/tracker/new-project-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { createAccountAndWorkspace, generateId, generateTestData, setTestOptions } from '../utils'
import { generateProjectId, setViewGroup, ViewletSelectors } from './tracker.utils'

// Statuses of the "Classic Issue" task type a new tracker project type starts with
const baseStatuses = ['Backlog', 'Todo', 'In Progress', 'Done', 'Canceled']

test.describe.configure({ mode: 'serial' })

test.describe('Statuses of a project type in tracker', () => {
  let context: BrowserContext
  let page: Page
  let settings: SettingsPage
  let navigation: TrackerNavigationMenuPage
  let newProject: NewProjectPage
  let issues: IssuesPage

  const plainType = `Plain-${generateId(4)}`
  const extendedType = `Extended-${generateId(4)}`
  const extraStatus = `Extra-${generateId(4)}`
  const plainProject = `Plain-${generateId(4)}`
  const extendedProject = `Extended-${generateId(4)}`

  const listHeader = (name: string): Locator => page.locator('.categoryHeader').getByText(name, { exact: true })
  const boardColumn = (name: string): Locator =>
    page.locator('[data-id="kanban-column"]').getByText(name, { exact: true })

  async function openIssues (project: string, viewlet: string): Promise<void> {
    await navigation.openIssuesForProject(project)
    await page.locator('label[data-id="tab-all"]').click()
    await page.locator(viewlet).click()
  }

  // View options are kept per project page, so the toggle is set where it is needed
  async function setShowEmptyGroups (on: boolean): Promise<void> {
    // The Board tooltip covers the view options button
    await page.mouse.move(0, 0)
    await issues.viewButton().click()
    const toggle = issues.shouldShowAllToggle().locator('input[type="checkbox"]')
    if ((await toggle.isChecked()) !== on) {
      await issues.shouldShowAllToggle().locator('label.toggle').click()
    }
    await expect(toggle).toBeChecked({ checked: on })
    await page.keyboard.press('Escape')
  }

  async function createProject (title: string, type: string): Promise<void> {
    await navigation.pressCreateProjectButton()
    await newProject.createNewProject({ title, identifier: generateProjectId(), type })
    await navigation.checkProjectExist(title)
  }

  test.beforeAll(async ({ browser }) => {
    // An explicit context: a test opens settings in a second tab of it
    context = await browser.newContext()
    page = await context.newPage()
    await createAccountAndWorkspace(page, page.request, generateTestData())
    await setTestOptions(page)
    await page.reload()

    settings = new SettingsPage(page)
    navigation = new TrackerNavigationMenuPage(page)
    newProject = new NewProjectPage(page)
    issues = new IssuesPage(page)

    await settings.openProfileMenu()
    await settings.openSettings()
  })

  test.afterAll(async () => {
    await context.close()
  })

  test('a new project type opens with its own Classic Issue task type and base statuses', async () => {
    await settings.createSpaceType(plainType, 'Tracker')
    // The created type opens without selecting it in the list
    await settings.checkOpened(plainType)
    await settings.checkTaskType('Classic Issue')
    await settings.openTaskType('Classic Issue')
    for (const status of baseStatuses) {
      await settings.checkState(status)
    }
  })

  test('a status added to one project type stays in it', async () => {
    await settings.createSpaceType(extendedType, 'Tracker')
    await settings.checkOpened(extendedType)
    await settings.openTaskType('Classic Issue')
    await settings.addState(extraStatus)

    await settings.selectSpaceType(plainType, 'Tracker')
    await settings.openTaskType('Classic Issue')
    await settings.checkState('Backlog')
    await expect(settings.stateButton(extraStatus)).toHaveCount(0)
  })

  test('projects of both types are created', async () => {
    await issues.clickOnApplicationButton()
    await createProject(plainProject, plainType)
    await createProject(extendedProject, extendedType)
  })

  test('a project without issues shows a placeholder when there are no groups', async () => {
    await openIssues(plainProject, ViewletSelectors.Table)
    // Assignee has no empty groups: without issues the list has nothing to show
    await setViewGroup(page, 'Assignee')
    await expect(page.getByText('No issues yet', { exact: true })).toBeVisible()
    await setViewGroup(page, 'Status')
    await expect(page.getByText('No issues yet', { exact: true })).toBeVisible()
  })

  test('the list shows empty groups only for statuses of the project type', async () => {
    await setShowEmptyGroups(true)
    for (const status of baseStatuses) {
      await expect(listHeader(status)).toBeVisible()
    }
    await expect(page.getByText('No issues yet', { exact: true })).toHaveCount(0)
    await expect(listHeader(extraStatus)).toHaveCount(0)

    await openIssues(extendedProject, ViewletSelectors.Table)
    await setShowEmptyGroups(true)
    await expect(listHeader(extraStatus)).toBeVisible()
    await expect(listHeader('Backlog')).toBeVisible()
  })

  test('a status added, renamed or deleted in settings changes an open project list', async () => {
    // The list of the extended project stays open with empty groups shown
    const lateStatus = `Late-${generateId(4)}`
    const renamedStatus = `Renamed-${generateId(4)}`
    const headerNames = async (): Promise<string[]> =>
      (await page.locator('.categoryHeader').allInnerTexts()).map((it) => it.split('\n')[0].trim())
    const settingsTab = await context.newPage()
    try {
      await settingsTab.goto(page.url())
      const tabSettings = new SettingsPage(settingsTab)
      await tabSettings.openProfileMenu()
      await tabSettings.openSettings()
      await tabSettings.selectSpaceType(extendedType, 'Tracker')
      // With two task types the groups come from all task types of the project type
      await tabSettings.addTaskType(`Second-${generateId(4)}`)
      await tabSettings.openTaskType('Classic Issue')

      await tabSettings.addState(lateStatus)
      await expect(listHeader(lateStatus)).toBeVisible()
      const position = (await headerNames()).findIndex((it) => it.startsWith(lateStatus))

      // A renamed status keeps its place and shows the new name without a reload
      await tabSettings.changeState(lateStatus, renamedStatus)
      await expect(listHeader(renamedStatus)).toBeVisible()
      await expect(listHeader(lateStatus)).toHaveCount(0)
      await expect.poll(async () => (await headerNames()).findIndex((it) => it.startsWith(renamedStatus))).toBe(position)

      await tabSettings.deleteState(renamedStatus)
      await expect(listHeader(renamedStatus)).toHaveCount(0)
      await expect(listHeader(extraStatus)).toBeVisible()
    } finally {
      await settingsTab.close()
    }
  })

  test('the board shows columns only for statuses of the project type', async () => {
    await openIssues(extendedProject, ViewletSelectors.Board)
    await setShowEmptyGroups(true)
    await expect(boardColumn(extraStatus)).toBeVisible()
    await expect(boardColumn('Backlog')).toBeVisible()

    await openIssues(plainProject, ViewletSelectors.Board)
    await setShowEmptyGroups(true)
    await expect(boardColumn('Backlog')).toBeVisible()
    await expect(boardColumn('Todo')).toBeVisible()
    await expect(boardColumn(extraStatus)).toHaveCount(0)
  })
})
