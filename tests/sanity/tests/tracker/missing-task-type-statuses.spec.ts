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

import task from '@hcengineering/task'
import tracker from '@hcengineering/tracker'
import { expect, test } from '../fixtures'
import { connectTracker, createIssue, findProjectByName, getProjectContext } from '../API/TrackerApi'
import { SettingsPage } from '../model/settings-page'
import { IssuesPage } from '../model/tracker/issues-page'
import { NewProjectPage } from '../model/tracker/new-project-page'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { createAccountAndWorkspace, generateId, generateTestData, setTestOptions } from '../utils'
import { generateProjectId } from './tracker.utils'

test('adds the original status missing from a task type in both settings views', async ({ page }) => {
  const data = generateTestData()
  const { ws } = await createAccountAndWorkspace(page, page.request, data)
  await setTestOptions(page)
  await page.reload()

  const settings = new SettingsPage(page)
  const issues = new IssuesPage(page)
  const navigation = new TrackerNavigationMenuPage(page)
  const newProject = new NewProjectPage(page)
  const typeName = `Missing-${generateId(4)}`
  const projectName = `Missing-${generateId(4)}`
  const statusName = `Detached-${generateId(4)}`

  await settings.openProfileMenu()
  await settings.openSettings()
  await settings.createSpaceType(typeName, 'Tracker')
  await settings.openTaskType('Classic Issue')
  await settings.addState(statusName)

  await issues.clickOnApplicationButton()
  await navigation.pressCreateProjectButton()
  await newProject.createNewProject({ title: projectName, identifier: generateProjectId(), type: typeName })
  await navigation.checkProjectExist(projectName)

  const { client } = await connectTracker(ws.workspaceUrl, data.userName)
  try {
    const project = await findProjectByName(client, projectName)
    if (project === undefined) throw new Error(`Project not found: ${projectName}`)
    const context = await getProjectContext(client, project._id)
    const status = await client.findOne(tracker.class.IssueStatus, { name: statusName })
    if (status === undefined) throw new Error(`Status not found: ${statusName}`)
    const issueId = await createIssue(client, context, { title: `Detached-${generateId(4)}`, status: status._id })
    const taskType = await client.findOne(task.class.TaskType, { _id: context.taskType })
    if (taskType === undefined) throw new Error('Task type not found')
    await client.update(taskType, { statuses: taskType.statuses.filter((id) => id !== status._id) })
    const projectType = await client.findOne(task.class.ProjectType, { _id: project.type })
    if (projectType === undefined) throw new Error('Project type not found')
    await client.update(projectType, { statuses: projectType.statuses.filter((entry) => entry._id !== status._id) })

    await settings.openProfileMenu()
    await settings.openSettings()
    await settings.selectSpaceType(typeName, 'Tracker')
    const row = settings.taskTypeRow('Classic Issue').locator('xpath=..')
    await expect(row.locator('[data-id="missing-task-type-statuses"]')).toContainText(statusName)

    await settings.openTaskType('Classic Issue')
    const missing = page.locator('#statuses [data-id="missing-task-type-statuses"]')
    await expect(missing).toContainText(statusName)
    await missing.locator(`[data-status-id="${status._id}"] [data-id="add-missing-task-type-status"]`).click()
    await expect(missing).toHaveCount(0)

    const updatedTaskType = await client.findOne(task.class.TaskType, { _id: context.taskType })
    const updatedIssue = await client.findOne(tracker.class.Issue, { _id: issueId })
    expect(updatedTaskType?.statuses).toContain(status._id)
    expect(updatedIssue?.status).toBe(status._id)
    const updatedProjectType = await client.findOne(task.class.ProjectType, { _id: project.type })
    expect(updatedProjectType?.statuses.some((entry) => entry._id === status._id)).toBe(true)

    if (updatedTaskType === undefined) throw new Error('Updated task type not found')
    await client.update(updatedTaskType, { statuses: updatedTaskType.statuses.filter((id) => id !== status._id) })

    await settings.selectSpaceType(typeName, 'Tracker')
    const listMissing = settings
      .taskTypeRow('Classic Issue')
      .locator('xpath=..')
      .locator('[data-id="missing-task-type-statuses"]')
    await expect(listMissing).toContainText(statusName)
    const projectTypeUrl = page.url()
    await listMissing.locator(`[data-status-id="${status._id}"] [data-id="add-missing-task-type-status"]`).click()
    await expect(page).toHaveURL(projectTypeUrl)
    await expect(listMissing).toHaveCount(0)
    expect((await client.findOne(tracker.class.Issue, { _id: issueId }))?.status).toBe(status._id)
  } finally {
    await client.close()
  }
})
