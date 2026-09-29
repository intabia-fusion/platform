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

import { type AnyAttribute, type Class, type Ref, type TxOperations } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { type Issue } from '@hcengineering/tracker'
import { expect, test } from '../fixtures'
import {
  connectTracker,
  createCustomStringAttribute,
  createIssue,
  deleteIssuesByTitlePrefix,
  getProjectContext,
  removeAttribute,
  type ProjectContext
} from '../API/TrackerApi'
import { IssuesPage } from '../model/tracker/issues-page'
import { PlatformSetting, PlatformURI, generateId } from '../utils'

test.use({
  storageState: PlatformSetting
})

// Custom fields of a task type live on its target class - a subclass of Issue, not a mixin - and
// used to be missing from the Filter popup while the column settings showed them.
test.describe('Tracker filters by custom attributes', () => {
  let client: TxOperations
  let ctx: ProjectContext
  let taskTypeClass: Ref<Class<Issue>>
  const attributes: Array<Ref<AnyAttribute>> = []
  const id = generateId()
  const titlePrefix = `custom-attr-filter-${id}-`

  test.beforeAll(async () => {
    client = (await connectTracker()).client
    ctx = await getProjectContext(client)
    const taskType = await client.findOne(task.class.TaskType, { _id: ctx.taskType })
    if (taskType?.targetClass === undefined) throw new Error(`No target class for task type ${ctx.taskType}`)
    taskTypeClass = taskType.targetClass as Ref<Class<Issue>>
  })

  test.afterAll(async () => {
    if (client === undefined) return
    await deleteIssuesByTitlePrefix(client, titlePrefix)
    for (const attr of attributes) {
      await removeAttribute(client, attr)
    }
    await client.close()
  })

  test('Task type and Issue custom attributes are in their own sections and filter issues', async ({ page }) => {
    const issuesPage = new IssuesPage(page)
    const issueLabel = `Issue field ${id}`
    const taskTypeLabel = `Task type field ${id}`

    const issueAttr = await createCustomStringAttribute(client, tracker.class.Issue, issueLabel)
    attributes.push(issueAttr._id)
    const taskTypeAttr = await createCustomStringAttribute(client, taskTypeClass, taskTypeLabel)
    attributes.push(taskTypeAttr._id)

    const matching = `${titlePrefix}matching`
    const other = `${titlePrefix}other`
    await createIssue(client, ctx, {
      title: matching,
      status: 'Backlog',
      _class: taskTypeClass,
      attributes: { [issueAttr.name]: `issue-value-${id}`, [taskTypeAttr.name]: `type-value-${id}` }
    })
    await createIssue(client, ctx, {
      title: other,
      status: 'Backlog',
      _class: taskTypeClass,
      attributes: { [issueAttr.name]: 'issue-value-other', [taskTypeAttr.name]: 'type-value-other' }
    })

    const projectPath = encodeURIComponent(ctx.project._id)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    await issuesPage.clickModelSelectorAll()

    await test.step('Custom attributes are listed under section headers', async () => {
      const sectionOf = (label: string): ReturnType<typeof page.locator> =>
        page
          .locator('div.selectPopup button.menu-item', { hasText: label })
          .locator('xpath=preceding-sibling::div[contains(@class, "menu-group__header")][1]')

      await issuesPage.buttonFilter().click()
      await expect(sectionOf(issueLabel)).toHaveText('Custom attributes')
      await expect(sectionOf(taskTypeLabel)).toHaveCount(1)
      await expect(sectionOf(taskTypeLabel)).not.toHaveText('Custom attributes')
      await page.keyboard.press('Escape')
    })

    await test.step('Filter by the task type attribute', async () => {
      await issuesPage.applyStringFilter(taskTypeLabel, `type-value-${id}`)
      await issuesPage.checkFilteredIssueExist(matching)
      await issuesPage.checkFilteredIssueNotExist(other)
      await issuesPage.buttonClearFilters().click()
    })

    await test.step('Filter by the Issue attribute', async () => {
      await issuesPage.applyStringFilter(issueLabel, `issue-value-${id}`)
      await issuesPage.checkFilteredIssueExist(matching)
      await issuesPage.checkFilteredIssueNotExist(other)
    })
  })
})
