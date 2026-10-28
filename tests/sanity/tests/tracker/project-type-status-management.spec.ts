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

import { expect, test, type Page } from '../fixtures'
import { SettingsPage } from '../model/settings-page'
import { IssuesDetailsPage } from '../model/tracker/issues-details-page'
import { IssuesPage } from '../model/tracker/issues-page'
import { NewProjectPage } from '../model/tracker/new-project-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { createAccountAndWorkspace, generateId, generateTestData, setTestOptions } from '../utils'
import { generateProjectId } from './tracker.utils'

test.describe.configure({ mode: 'serial' })

test.describe('Status management in a project type', () => {
  let page: Page
  let settings: SettingsPage
  let navigation: TrackerNavigationMenuPage
  let newProject: NewProjectPage
  let issues: IssuesPage
  let details: IssuesDetailsPage

  const typeName = `Manage-${generateId(4)}`
  const secondType = `Second-${generateId(4)}`
  const renamedStatus = `Renamed-${generateId(4)}`
  const doomedType = `Doomed-${generateId(4)}`
  const keptStatus = `Kept-${generateId(4)}`
  const goneStatus = `Gone-${generateId(4)}`
  const bareStatus = `Bare-${generateId(4)}`

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext()
    page = await context.newPage()
    await createAccountAndWorkspace(page, page.request, generateTestData())
    await setTestOptions(page)
    await page.reload()
    settings = new SettingsPage(page)
    navigation = new TrackerNavigationMenuPage(page)
    newProject = new NewProjectPage(page)
    issues = new IssuesPage(page)
    details = new IssuesDetailsPage(page)
    await settings.openProfileMenu()
    await settings.openSettings()
    await settings.createSpaceType(typeName, 'Tracker')
    await settings.checkOpened(typeName)
  })

  test('the plus button of the Statuses section creates a status outside any task type', async () => {
    await settings.addProjectTypeStatus(bareStatus)

    await settings.openTaskType('Classic Issue')
    await settings.checkState('Backlog')
    await expect(settings.stateButton(bareStatus)).toHaveCount(0)

    await settings.selectSpaceType(typeName, 'Tracker')
    await settings.projectStatusRow(bareStatus).click()
    const aside = settings.statusEditorAside()
    await expect(aside.getByText('Task types', { exact: true })).toBeVisible()
    await expect(aside.getByText('Workflows', { exact: true })).toBeVisible()
    await expect(aside.getByText('Not used', { exact: true })).toHaveCount(2)
  })

  test('a status of a just added task type is renamed without a concurrent change error', async () => {
    await settings.selectSpaceType(typeName, 'Tracker')
    await settings.addTaskType(secondType)
    await settings.openTaskType(secondType)

    await settings.changeState('Todo', renamedStatus)
    await expect(settings.stateButton(renamedStatus)).toBeVisible()
    await expect(settings.stateButton('Todo')).toHaveCount(0)
    await expect(page.getByText('Statuses were not created', { exact: false })).toHaveCount(0)
  })

  test('an unused status is deleted after a plain confirmation', async () => {
    await settings.selectSpaceType(typeName, 'Tracker')
    await settings.projectStatusRow(bareStatus).click()
    await settings.deleteStateButton().click()
    await expect(page.getByText('The status is not used by any task or workflow.')).toBeVisible()
    await settings.popupDeleteButton().click()
    await expect(settings.projectStatusRow(bareStatus)).toHaveCount(0)
  })

  test('a used status is deleted by merging its issues into a picked status', async () => {
    const usedStatus = `Used-${generateId(4)}`
    const projectTitle = `Proj-${generateId(4)}`
    const issueTitle = `Issue-${generateId(4)}`

    await settings.selectSpaceType(typeName, 'Tracker')
    await settings.openTaskType('Classic Issue')
    await settings.addState(usedStatus)

    await issues.clickOnApplicationButton()
    await navigation.pressCreateProjectButton()
    await newProject.createNewProject({ title: projectTitle, identifier: generateProjectId(), type: typeName })
    await navigation.checkProjectExist(projectTitle)
    await navigation.openIssuesForProject(projectTitle)
    await issues.createNewIssue({ title: issueTitle, description: 'd', status: usedStatus, projectName: projectTitle })
    await issues.searchIssueByName(issueTitle)
    await issues.openIssueByName(issueTitle)
    await details.checkIssue({ title: issueTitle, description: 'd', status: usedStatus })

    await settings.openProfileMenu()
    await settings.openSettings()
    await settings.selectSpaceType(typeName, 'Tracker')
    await settings.projectStatusRow(usedStatus).click()
    await settings.deleteStateButton().click()
    await expect(page.getByText('The status is in use. Tasks: 1, workflows: 0.')).toBeVisible()
    await page.getByRole('button', { name: 'In Progress', exact: true }).click()
    await page
      .locator('div.selectPopup button')
      .filter({ has: page.getByText('Todo', { exact: true }) })
      .click()
    await settings.popupDeleteButton().click()
    // Merge confirmation: lists what moves, the delete happens on its confirm
    await expect(page.getByText(`"${usedStatus}"`).first()).toBeVisible()
    await settings.popupDeleteButton().click()
    await expect(settings.projectStatusRow(usedStatus)).toHaveCount(0)

    await issues.clickOnApplicationButton()
    await navigation.openIssuesForProject(projectTitle)
    await issues.searchIssueByName(issueTitle)
    await issues.openIssueByName(issueTitle)
    await details.checkIssue({ title: issueTitle, description: 'd', status: 'Todo' })
  })

  test('statuses of a deleted project type are listed as not linked', async () => {
    // The previous test ends on the issue page
    await settings.openProfileMenu()
    await settings.openSettings()
    await settings.createSpaceType(doomedType, 'Tracker')
    await settings.checkOpened(doomedType)
    await settings.addProjectTypeStatus(keptStatus)
    await settings.addProjectTypeStatus(goneStatus)
    await settings.deleteOpenedSpaceType()
    await expect(settings.spaceTypeButton(doomedType)).toHaveCount(0)

    await settings.selectSpaceType(typeName, 'Tracker')
    await expect(settings.orphansBlock().getByText(/Not linked to project types \(\d+\)/)).toBeVisible()
    await expect(settings.orphanRow(keptStatus)).toBeVisible()
    await expect(settings.orphanRow(goneStatus)).toBeVisible()
    await expect(settings.projectStatusRow(keptStatus)).toHaveCount(0)
  })

  test('a not linked status is added to the project type', async () => {
    await settings.orphanRow(keptStatus).getByRole('button', { name: 'Add to project type' }).click()
    await expect(settings.projectStatusRow(keptStatus)).toBeVisible()
    await expect(settings.orphanRow(keptStatus)).toHaveCount(0)
  })

  test('a not linked status is deleted after a plain confirmation', async () => {
    await settings.orphanRow(goneStatus).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('The status is not used by any task or workflow.')).toBeVisible()
    await settings.popupDeleteButton().click()
    await expect(settings.orphanRow(goneStatus)).toHaveCount(0)
  })

  test('a parent and a child task type are added and removed with the hierarchy chips', async () => {
    await settings.selectSpaceType(typeName, 'Tracker')
    await settings.openTaskType(secondType)

    // A new task type accepts any parent, and Classic Issue is already its child
    await settings.removeHierarchyType(settings.hierarchyParents(), 'Any task type')
    await settings.addHierarchyType(settings.hierarchyParents(), 'Classic Issue')
    await settings.removeHierarchyType(settings.hierarchyParents(), 'Classic Issue')

    await settings.removeHierarchyType(settings.hierarchyChildren(), 'Classic Issue')
    await settings.addHierarchyType(settings.hierarchyChildren(), 'Classic Issue')
  })
})
