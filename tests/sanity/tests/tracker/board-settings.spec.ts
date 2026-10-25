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

import { createRestClient } from '@hcengineering/api-client'
import core, { generateId, type AccountUuid, type Ref, type TxOperations } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, { type Board, type IssueStatus, type Project } from '@hcengineering/tracker'
import { expect, test, type Locator } from '../fixtures'
import {
  connectTracker,
  createIssue,
  deleteIssuesByTitlePrefix,
  findProjectByName,
  getProjectContext,
  type ProjectContext
} from '../API/TrackerApi'
import { BoardsPage } from '../model/tracker/boards-page'

// Settings of a board on Second Project: the boards of boards.spec.ts live there too, own prefix keeps them apart
test.describe('board settings', () => {
  test.describe.configure({ mode: 'serial' })

  let client: TxOperations
  let ctx: ProjectContext
  let project: Project | undefined
  let boardId: Ref<Board>
  const titlePrefix = `board-settings-spec-${generateId()}-`

  const statusId = (name: 'Backlog' | 'In Progress' | 'Cancelled'): Ref<IssueStatus> =>
    ctx.statuses.get(name) as Ref<IssueStatus>

  // The JSON of a "Status is ..." condition, as the settings editor stores it
  const statusCondition = (...statuses: Array<Ref<IssueStatus>>): string => {
    const attribute = client.getHierarchy().getAttribute(tracker.class.Issue, 'status')
    return JSON.stringify([
      {
        key: {
          _class: tracker.class.Issue,
          key: 'status',
          attribute,
          label: attribute.label,
          component: 'task:component:StatusFilter',
          group: 'top'
        },
        value: statuses,
        index: 1,
        modes: ['view:filter:FilterObjectIn', 'view:filter:FilterObjectNin'],
        mode: 'view:filter:FilterObjectIn'
      }
    ])
  }

  test.beforeAll(async () => {
    const conn = await connectTracker()
    client = conn.client
    const { workspaceToken } = conn
    const author = (
      await createRestClient(workspaceToken.endpoint, workspaceToken.workspaceId, workspaceToken.token).getAccount()
    ).uuid as AccountUuid
    project = await findProjectByName(client, 'Second Project')
    if (project === undefined) return
    ctx = await getProjectContext(client, project._id)
    await createIssue(client, ctx, { title: `${titlePrefix}backlog`, status: 'Backlog' })
    await createIssue(client, ctx, { title: `${titlePrefix}doing`, status: 'In Progress' })
    boardId = await client.createDoc(tracker.class.Board, core.space.Workspace, {
      title: `${titlePrefix}board`,
      projects: [project._id],
      visibility: 'all',
      author,
      editors: [],
      filter: '',
      columns: [
        {
          id: 'queue',
          title: 'Queue',
          category: task.statusCategory.ToDo,
          statuses: [statusId('Backlog')],
          limit: 5
        },
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ],
      swimlanes: [
        { id: 'lane-doing', title: 'In work', condition: statusCondition(statusId('In Progress')) },
        { id: 'lane-rest', title: 'The rest', condition: '' }
      ],
      quickFilters: [{ id: 'qf', title: 'Doing only', condition: statusCondition(statusId('In Progress')) }],
      // The third rule fits no issue: the example says so
      colorRules: [
        { id: 'rule-doing', color: 3, condition: statusCondition(statusId('In Progress')) },
        { id: 'rule-backlog', color: 5, condition: statusCondition(statusId('Backlog')) },
        { id: 'rule-cancelled', color: 7, condition: statusCondition(statusId('Cancelled')) }
      ],
      density: 'normal'
    })
  })

  test.beforeEach(() => {
    test.skip(project === undefined, 'Second Project not seeded')
  })

  test.afterAll(async () => {
    if (client === undefined) return
    for (const board of await client.findAll(tracker.class.Board, {})) {
      if (board.title.startsWith(titlePrefix)) await client.remove(board)
    }
    await deleteIssuesByTitlePrefix(client, titlePrefix)
  })

  const openTab = async (boards: BoardsPage, tab: string): Promise<void> => {
    await (await boards.page.goto(boards.boardUrl(boardId, true, tab)))?.finished()
    await expect(boards.settings()).toBeVisible()
  }

  test('visibility reads "Visible to everyone" and "Only me" with the hint', async ({ page }) => {
    const boards = new BoardsPage(page)
    await openTab(boards, 'general')
    await expect(boards.radio('boardVisibilityAll')).toHaveText(/^\s*Visible to everyone\s*$/)
    await expect(boards.radio('boardVisibilityMe')).toHaveText(/^\s*Only me\s*$/)
    await expect(boards.settingsGeneral()).toContainText('A personal board, shown in My boards')
    await expect(boards.settingsGeneral()).not.toContainText('All project members')
  })

  test('the board switcher in the header is a dropdown with a chevron', async ({ page }) => {
    const boards = new BoardsPage(page)
    await openTab(boards, 'general')
    const switcher = page.locator('[data-id="boardSettingsSwitcher"]')
    await expect(switcher).toContainText(`${titlePrefix}board`)
    await expect(switcher.locator('svg').last()).toBeVisible()
  })

  test('colors: the example shows a card with the border of each rule that has an issue, and says so for the rest', async ({
    page
  }) => {
    const boards = new BoardsPage(page)
    await openTab(boards, 'colorRules')
    const example = page.locator('[data-id="boardColorExample"]')
    await expect(example).toBeVisible()
    await expect(example.locator('[data-id="boardColorSample"]')).toHaveCount(2)
    await expect(example.locator('[data-id="boardColorSample"]').first()).toContainText(`${titlePrefix}doing`)
    await expect(example.locator('[data-id="boardColorSample"]').last()).toContainText(`${titlePrefix}backlog`)
    await expect(example.locator('[data-id="boardColorSample"] .tracker-card.accent')).toHaveCount(2)
    await expect(example.locator('[data-id="boardColorSampleNone"]')).toHaveCount(1)
    await expect(example.locator('[data-id="boardColorSampleNone"]')).toContainText(
      'No issue of the board fits this rule'
    )
  })

  test('controls without a model field are absent while the flags are off', async ({ page }) => {
    const boards = new BoardsPage(page)
    const absent: Record<string, string[]> = {
      general: ['boardHideDone', 'boardCardOrder'],
      columns: ['boardWipMin', 'boardDaysInColumn'],
      swimlanes: ['boardSwimlanesAssignee', 'boardSwimlanesPriority', 'boardSwimlanesRelation', 'boardLaneExample'],
      quickFilters: ['boardQuickFilterOnBoard'],
      colorRules: ['boardColorBy'],
      card: ['boardCardField-daysInColumn']
    }
    for (const [tab, ids] of Object.entries(absent)) {
      await openTab(boards, tab)
      // The tab content is up before the absence counts
      const ready: Record<string, () => Locator> = {
        general: boards.settingsGeneral,
        columns: boards.settingsColumns,
        card: boards.settingsCard
      }
      await expect((ready[tab] ?? (() => boards.settingsTab(tab)))()).toBeVisible()
      for (const id of ids) {
        await expect(page.locator(`[data-id="${id}"]`), `${tab}: ${id}`).toHaveCount(0)
      }
    }
    // What stays: the max limit field of the open column editor and the rule rows
    await openTab(boards, 'columns')
    await expect(boards.settingsColumns()).toBeVisible()
    await expect(boards.settingsColumn()).toHaveCount(2)
    await expect(boards.settingsColumns().locator('input[type="number"]')).toHaveCount(2)
  })
})
