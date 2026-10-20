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

import contact from '@hcengineering/contact'
import { type AnyAttribute, type Ref, type TxOperations } from '@hcengineering/core'
import tracker from '@hcengineering/tracker'
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

// An issue without an assignee puts null among the ids the search is limited to, and Elastic
// rejected the whole query for it: the search found nobody.
test.describe('Tracker filter search', () => {
  let client: TxOperations
  let ctx: ProjectContext
  const id = generateId()
  const titlePrefix = `filter-search-${id}-`
  let attribute: Ref<AnyAttribute> | undefined

  test.beforeAll(async () => {
    client = (await connectTracker()).client
    ctx = await getProjectContext(client)
  })

  test.afterAll(async () => {
    if (client === undefined) return
    await deleteIssuesByTitlePrefix(client, titlePrefix)
    if (attribute !== undefined) await removeAttribute(client, attribute)
    await client.close()
  })

  test('Assignee filter finds a person by name next to unassigned issues', async ({ page }) => {
    const issuesPage = new IssuesPage(page)
    const assignee = await client.findOne(contact.class.Person, { name: 'Appleseed,John' })
    if (assignee === undefined) throw new Error('No person Appleseed John in sanity-ws')

    const assigned = `${titlePrefix}assigned`
    const unassigned = `${titlePrefix}unassigned`
    await createIssue(client, ctx, { title: assigned, status: 'Backlog', assignee: assignee._id })
    await createIssue(client, ctx, { title: unassigned, status: 'Backlog' })

    const projectPath = encodeURIComponent(ctx.project._id)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    await issuesPage.clickModelSelectorAll()

    await test.step('Search the assignee', async () => {
      await issuesPage.selectFilter('Assignee')
      await expect(issuesPage.menuPopupItemButton('Not selected')).toBeVisible()

      // IssuesPage.inputSearch is the list header search, not the popup one
      await page.locator('div.selectPopup input[placeholder="Search..."]').fill('Appleseed')
      await expect(issuesPage.menuPopupItemButton('Appleseed John')).toBeVisible({ timeout: 15000 })
    })

    await test.step('Filter by the found assignee', async () => {
      await issuesPage.menuPopupItemButton('Appleseed John').click()
      await page.keyboard.press('Escape')
      await issuesPage.checkFilter('Assignee', 'is')
      await issuesPage.checkFilteredIssueExist(assigned)
      await issuesPage.checkFilteredIssueNotExist(unassigned)
    })
  })

  // Picking a value after a search switches the filter to "is either of" and clears the search, which
  // re-queries the values; the filter used to be built from that re-query and stayed empty when it was slow.
  test('Value picked after a search filters the list when values load slowly', async ({ page }) => {
    const issuesPage = new IssuesPage(page)
    const label = `Search pick field ${id}`
    const attr = await createCustomStringAttribute(client, tracker.class.Issue, label)
    attribute = attr._id

    const picked = `${titlePrefix}picked`
    const other = `${titlePrefix}other`
    await createIssue(client, ctx, { title: picked, status: 'Backlog', attributes: { [attr.name]: `pick-a-${id}` } })
    await createIssue(client, ctx, { title: other, status: 'Backlog', attributes: { [attr.name]: `pick-b-${id}` } })

    // Delaying server frames in the browser is the only way to make the re-query outlast the 200 ms
    // filter debounce without thousands of issues; the order of frames is kept.
    let delayMs = 0
    let lastAt = 0
    await page.routeWebSocket(/.*/, (ws) => {
      const server = ws.connectToServer()
      ws.onMessage((message) => {
        server.send(message)
      })
      server.onMessage((message) => {
        const at = Math.max(lastAt, Date.now() + delayMs)
        lastAt = at
        setTimeout(() => {
          ws.send(message)
        }, at - Date.now())
      })
    })

    const projectPath = encodeURIComponent(ctx.project._id)
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    await issuesPage.clickModelSelectorAll()

    await issuesPage.selectFilter(label)
    await page.locator(`div.selectPopup input[placeholder="${label}"]`).fill('pick-')
    await expect(issuesPage.menuPopupItemButton(`pick-a-${id}`)).toBeVisible({ timeout: 15000 })
    await expect(issuesPage.menuPopupItemButton(`pick-b-${id}`)).toBeVisible()

    delayMs = 600
    await issuesPage.menuPopupItemButton(`pick-a-${id}`).click()
    await page.keyboard.press('Escape')

    await issuesPage.checkFilteredIssueExist(picked)
    await issuesPage.checkFilteredIssueNotExist(other)
  })
})
