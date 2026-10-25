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

import { createRestClient } from '@hcengineering/api-client'
import core, { generateId, type AccountUuid, type Data, type Ref, type TxOperations } from '@hcengineering/core'
import task from '@hcengineering/task'
import tracker, {
  cardFields,
  IssuePriority,
  type Board,
  type CardField,
  type IssueStatus,
  type Project
} from '@hcengineering/tracker'
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
import { getSecondPage, PlatformURI } from '../utils'
import { ViewletSelectors } from './tracker.utils'

// Boards cover Second Project only: a project kanban opens the first board of the project
// by default, and the kanban specs of the default project must not meet them.
test.describe('task boards', () => {
  test.describe.configure({ mode: 'serial' })

  let client: TxOperations
  let ctx: ProjectContext
  let project: Project | undefined
  let boardId: Ref<Board>
  let author: AccountUuid
  const titlePrefix = `boards-spec-${generateId()}-`

  const readBoardById = async (id: Ref<Board>): Promise<Board | undefined> =>
    await client.findOne(tracker.class.Board, { _id: id })

  const readBoard = async (): Promise<Board | undefined> => await readBoardById(boardId)

  // Boards of the tests below: same project, own columns; the afterAll removes them by the title prefix
  const makeBoard = async (name: string, patch: Partial<Data<Board>> = {}): Promise<Ref<Board>> =>
    await client.createDoc(tracker.class.Board, core.space.Workspace, {
      title: `${titlePrefix}${name}`,
      projects: [project?._id as Ref<Project>],
      visibility: 'all',
      author,
      editors: [],
      filter: '',
      columns: [],
      swimlanes: [],
      quickFilters: [],
      colorRules: [],
      density: 'normal',
      ...patch
    })

  const statusId = (name: 'Backlog' | 'Todo' | 'In Progress' | 'Cancelled'): Ref<IssueStatus> =>
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
    // The REST client sets no current account: ask the server who the test user is
    const { workspaceToken } = conn
    author = (
      await createRestClient(workspaceToken.endpoint, workspaceToken.workspaceId, workspaceToken.token).getAccount()
    ).uuid
    project = await findProjectByName(client, 'Second Project')
    if (project === undefined) return
    ctx = await getProjectContext(client, project._id)
    const status = (name: 'Backlog' | 'Todo' | 'In Progress'): Ref<IssueStatus> =>
      ctx.statuses.get(name) as Ref<IssueStatus>
    await createIssue(client, ctx, { title: `${titlePrefix}backlog`, status: 'Backlog' })
    await createIssue(client, ctx, { title: `${titlePrefix}todo`, status: 'Todo' })
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
          statuses: [status('Backlog'), status('Todo')],
          limit: 1
        },
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [status('In Progress')] }
      ],
      swimlanes: [],
      quickFilters: [],
      colorRules: [],
      density: 'normal'
    })
    // The project issues bar shows only the boards the user put on it
    await client.createDoc(tracker.class.BoardPreference, core.space.Workspace, { attachedTo: boardId })
  })

  test.beforeEach(() => {
    test.skip(project === undefined, 'Second Project not seeded')
  })

  test.afterAll(async () => {
    if (client === undefined) return
    // Every board of the spec, including the one the navigator test created
    const boards = await client.findAll(tracker.class.Board, {})
    for (const board of boards) {
      if (!board.title.startsWith(titlePrefix) && board.title !== 'New board') continue
      for (const pref of await client.findAll(tracker.class.BoardPreference, { attachedTo: board._id })) {
        await client.remove(pref)
      }
      await client.remove(board)
    }
    await deleteIssuesByTitlePrefix(client, titlePrefix)
  })

  test('columns of a board hold several statuses and the WIP limit turns red', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)

    await expect(boards.columns()).toHaveCount(2)
    // Backlog and Todo share the first column
    await expect(boards.columns().first().locator('[data-id="kanban-card"]')).toHaveCount(2)
    await expect(boards.columns().last().locator('[data-id="kanban-card"]')).toHaveCount(1)
    // 2 cards over the limit of 1: only the limit is red
    await expect(boards.wipLimit()).toHaveClass(/over/)
  })

  test('the board opens from the navigator', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
    const boards = new BoardsPage(page)
    await expect(boards.navItems()).toContainText(`${titlePrefix}board`)
    await boards.navItems().getByText(`${titlePrefix}board`).click()
    await expect(page).toHaveURL(new RegExp(`/tracker/boards/${boardId}`))
    await expect(boards.columns().first()).toBeVisible()
  })

  test('closing an issue opened from a board keeps the board', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await boards.columns().first().locator('.tracker-card').first().click()
    await expect(page.locator('#btnPClose')).toBeVisible()
    await page.locator('#btnPClose').click()
    await expect(page.locator('#btnPClose')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/tracker/boards/${boardId}$`))
    await expect(boards.columns()).toHaveCount(2)
    await expect(page.getByText('Board not found')).toHaveCount(0)
  })

  test('closing an issue opened from a board in a project keeps the board', async ({ page }) => {
    const boards = new BoardsPage(page)
    await (await page.goto(boards.projectBoardUrl(project?._id ?? '', boardId)))?.finished()
    await boards.columns().first().waitFor({ state: 'visible', timeout: 15000 })
    await boards.columns().first().locator('.tracker-card').first().click()
    await page.locator('#btnPClose').click()
    await expect(page.locator('#btnPClose')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/issues/${boardId}$`))
    await expect(boards.columns()).toHaveCount(2)
  })

  test('a board project the user cannot see gets its own chip', async ({ page }) => {
    const id = await makeBoard('hidden-project', {
      projects: [project?._id as Ref<Project>, generateId<Project>()],
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }]
    })
    const boards = new BoardsPage(page)
    await boards.open(id)
    await expect(boards.unavailable()).toBeVisible()
    await expect(boards.unavailable()).toContainText('1 project unavailable')
    await boards.unavailable().hover()
    await expect(page.getByText('hidden project')).toBeVisible()
  })

  test('the board without hidden projects has no unavailable chip', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await expect(boards.settingsButton()).toBeVisible()
    await expect(boards.unavailable()).toHaveCount(0)
  })

  test('card density follows the board', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await expect(boards.card('normal').first()).toBeVisible()

    const board = await readBoard()
    if (board === undefined) throw new Error('board is gone')
    await client.update(board, { density: 'dense' })
    await expect(boards.card('dense').first()).toBeVisible()
  })

  test('settings: a column is renamed and the board density is picked by a click', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)

    await boards.settingsButton().click()
    await expect(boards.settings()).toBeVisible()
    await boards.settings().getByText('Columns', { exact: true }).click()
    await expect(boards.settingsColumns()).toBeVisible()
    const title = boards.settingsColumn().first().locator('input').first()
    await title.fill('Waiting')
    await title.blur()
    await expect.poll(async () => (await readBoard())?.columns[0].title).toBe('Waiting')

    await boards.settings().getByText('Card', { exact: true }).click()
    await boards.density('compact').click()
    await expect.poll(async () => (await readBoard())?.density).toBe('compact')

    await boards.settingsBack().click()
    await expect(boards.columns().first()).toBeVisible()
    await expect(boards.columns().first().locator('.header')).toContainText('Waiting')
  })

  test('a project kanban stays the plain kanban even when the project has a board', async ({ page }) => {
    const projectPath = encodeURIComponent(project?._id ?? '')
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    await page.locator('label[data-id="tab-all"]').click()
    await page.locator(ViewletSelectors.Board).click()
    await page.locator('[data-id="kanban-column"], [data-id="kanban-swimlane"]').first().waitFor({ timeout: 15000 })
    await expect(page).not.toHaveURL(new RegExp(`/tracker/boards/${boardId}`))
  })

  test('the project issues header lists the project board and opens it in place', async ({ page }) => {
    const projectPath = encodeURIComponent(project?._id ?? '')
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    const boards = new BoardsPage(page)
    await boards.projectBoard(`${titlePrefix}board`).click()
    // The board replaces the view of the project issues: same project path, its segment selected
    await expect(page).toHaveURL(new RegExp(`/tracker/${projectPath}/issues/${boardId}`))
    await expect(boards.projectBoard(`${titlePrefix}board`)).toHaveAttribute('aria-checked', 'true')
    await expect(boards.columns()).toHaveCount(2)
    await expect(boards.settingsButton()).toBeVisible()

    // No viewlet is marked on the board; picking one closes the board in that view
    await expect(page.locator(ViewletSelectors.Table).locator('input')).not.toBeChecked()
    await expect(page.locator(ViewletSelectors.Board).locator('input')).not.toBeChecked()
    await page.locator(ViewletSelectors.Table).click()
    await expect(page).toHaveURL(new RegExp(`/tracker/${projectPath}/issues$`))
    await expect(page.locator(ViewletSelectors.Table).locator('input')).toBeChecked()
    await expect(boards.projectBoard(`${titlePrefix}board`)).toHaveAttribute('aria-checked', 'false')
  })

  test('the project boards menu takes a board off the bar and puts it back', async ({ page }) => {
    const projectPath = encodeURIComponent(project?._id ?? '')
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker/${projectPath}/issues`))?.finished()
    const boards = new BoardsPage(page)
    await boards.projectBoardsMenu().click()
    const item = boards.menuItem(`${titlePrefix}board`)
    await expect(item).toHaveAttribute('aria-checked', 'true')
    // The menu stays open while boards go on and off the bar
    await item.click()
    await expect(item).toHaveAttribute('aria-checked', 'false')
    await expect(boards.projectBoard(`${titlePrefix}board`)).toHaveCount(0)
    await item.click()
    await expect(item).toHaveAttribute('aria-checked', 'true')
    await expect(boards.projectBoard(`${titlePrefix}board`)).toBeVisible()
  })

  test('a board is created from the navigator and its settings open', async ({ page }) => {
    await (await page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
    const boards = new BoardsPage(page)
    await boards.createFromNavigator()
    await expect(page).toHaveURL(/\/tracker\/boards\/.+\/settings/)
  })

  test('card fields: a field is hidden on the board cards and the preview, and comes back when checked', async ({
    page
  }) => {
    const title = `${titlePrefix}rich`
    // A closed status keeps the card away from the columns of the other tests
    await createIssue(client, ctx, {
      title,
      status: 'Cancelled',
      priority: IssuePriority.High,
      dueDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
      estimation: 120
    })
    const id = await makeBoard('cards', {
      columns: [
        { id: 'closed', title: 'Closed', category: task.statusCategory.Lost, statuses: [statusId('Cancelled')] }
      ]
    })
    const boards = new BoardsPage(page)
    const visibleFields = async (): Promise<CardField[] | undefined> => (await readBoardById(id))?.cardFields
    const richCard = boards.card('normal').filter({ hasText: title })

    await (await page.goto(boards.boardUrl(id, true, 'card')))?.finished()
    await expect(boards.settingsCard()).toBeVisible()
    // A board without the setting shows every field, the detailed preview too
    for (const field of cardFields) {
      await expect(boards.cardFieldMark(boards.preview('detailed'), field), field).toHaveCount(1)
    }

    await boards.cardFieldLabel('priority').click()
    await expect.poll(async () => (await visibleFields())?.includes('priority')).toBe(false)
    await boards.cardFieldLabel('dueDate').click()
    await expect.poll(async () => (await visibleFields())?.includes('dueDate')).toBe(false)
    expect(await visibleFields()).toHaveLength(cardFields.length - 2)
    await expect(boards.cardFieldMark(boards.preview('detailed'), 'priority')).toHaveCount(0)
    await expect(boards.cardFieldMark(boards.preview('detailed'), 'dueDate')).toHaveCount(0)
    await expect(boards.cardFieldMark(boards.preview('detailed'), 'estimation')).toHaveCount(1)

    await boards.settingsBack().click()
    await expect(richCard).toBeVisible()
    await expect(boards.cardFieldMark(richCard, 'priority')).toHaveCount(0)
    await expect(boards.cardFieldMark(richCard, 'dueDate')).toHaveCount(0)
    await expect(boards.cardFieldMark(richCard, 'estimation')).toHaveCount(1)

    await boards.settingsButton().click()
    await boards.settings().getByText('Card', { exact: true }).click()
    await boards.cardFieldLabel('priority').click()
    await expect.poll(async () => (await visibleFields())?.includes('priority')).toBe(true)
    await boards.cardFieldLabel('dueDate').click()
    await expect.poll(async () => (await visibleFields())?.length).toBe(cardFields.length)
    await boards.settingsBack().click()
    await expect(boards.cardFieldMark(richCard, 'priority')).toHaveCount(1)
    await expect(boards.cardFieldMark(richCard, 'dueDate')).toHaveCount(1)
  })

  test('swimlanes "None" is kept after a reload', async ({ page }) => {
    const id = await makeBoard('lanes', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }],
      swimlanes: [
        { id: 'first', title: 'First', condition: '' },
        { id: 'rest', title: 'Others', condition: '' }
      ]
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'swimlanes')))?.finished()
    await expect(boards.settingsTab('swimlanes')).toBeVisible()
    await expect(boards.radioInput('boardSwimlanesByFilters')).toBeChecked()
    await expect(boards.swimlaneRules()).toHaveCount(1)

    await boards.radio('boardSwimlanesNone').click()
    await page.locator('.popup').getByRole('button', { name: 'Ok', exact: true }).click()
    await expect(boards.radioInput('boardSwimlanesNone')).toBeChecked()
    await expect.poll(async () => (await readBoardById(id))?.swimlanes.length).toBe(0)

    await page.reload()
    await expect(boards.settingsTab('swimlanes')).toBeVisible()
    await expect(boards.radioInput('boardSwimlanesNone')).toBeChecked()
    await expect(boards.radioInput('boardSwimlanesByFilters')).not.toBeChecked()
    await expect(boards.swimlaneRules()).toHaveCount(0)

    await boards.open(id)
    await expect(boards.swimlanes()).toHaveCount(0)
  })

  test('swimlanes "None" stays unchecked when the confirmation is cancelled', async ({ page }) => {
    const id = await makeBoard('lanes-cancel', {
      columns: [{ id: 'queue', title: 'Queue', category: task.statusCategory.ToDo, statuses: [statusId('Todo')] }],
      swimlanes: [
        { id: 'first', title: 'First', condition: '' },
        { id: 'rest', title: 'Others', condition: '' }
      ]
    })
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'swimlanes')))?.finished()
    await expect(boards.radioInput('boardSwimlanesByFilters')).toBeChecked()

    await boards.radio('boardSwimlanesNone').click()
    await page.locator('.popup').getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(boards.radioInput('boardSwimlanesByFilters')).toBeChecked()
    await expect(boards.radioInput('boardSwimlanesNone')).not.toBeChecked()
    await expect(boards.swimlaneRules()).toHaveCount(1)
    expect((await readBoardById(id))?.swimlanes).toHaveLength(2)
  })

  test('card field clicks in a row are all kept', async ({ page }) => {
    const id = await makeBoard('fast-clicks')
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(id, true, 'card')))?.finished()
    await expect(boards.settingsCard()).toBeVisible()
    // No wait between the clicks: each one must build on the previous change
    await boards.cardFieldLabel('priority').click()
    await boards.cardFieldLabel('dueDate').click()
    await boards.cardFieldLabel('labels').click()
    await expect
      .poll(async () => (await readBoardById(id))?.cardFields)
      .toEqual(cardFields.filter((f) => !['priority', 'dueDate', 'labels'].includes(f)))
  })

  // Goes through the navigator section "Boards": needs the build with the fixed navigator model
  test('a board of another user leaves the navigator when it becomes personal', async ({ page, browser }) => {
    const id = await makeBoard('nav-visibility')
    using second = await getSecondPage(browser)
    const boards = new BoardsPage(page)
    const boards2 = new BoardsPage(second.page)
    await (await second.page.goto(`${PlatformURI}/workbench/sanity-ws/tracker`))?.finished()
    await expect(boards2.navItems()).toContainText(`${titlePrefix}nav-visibility`)

    await (await page.goto(boards.boardUrl(id, true)))?.finished()
    await boards.radio('boardVisibilityMe').click()
    await expect(boards2.navItems()).not.toContainText(`${titlePrefix}nav-visibility`)
  })

  test('a quick filter narrows the cards and a second click takes it off', async ({ page }) => {
    const id = await makeBoard('quick', {
      columns: [
        {
          id: 'queue',
          title: 'Queue',
          category: task.statusCategory.ToDo,
          statuses: [statusId('Backlog'), statusId('Todo')]
        },
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ],
      quickFilters: [{ id: 'todo', title: 'Todo only', condition: statusCondition(statusId('Todo')) }]
    })
    const boards = new BoardsPage(page)
    const card = (name: string): Locator => boards.card('normal').filter({ hasText: `${titlePrefix}${name}` })
    await boards.open(id)
    await expect(card('backlog')).toBeVisible()
    await expect(card('todo')).toBeVisible()
    await expect(card('doing')).toBeVisible()

    await boards.quickFilter('Todo only').click()
    await expect(boards.quickFilter('Todo only')).toHaveAttribute('aria-pressed', 'true')
    await expect(card('todo')).toBeVisible()
    await expect(card('backlog')).toHaveCount(0)
    await expect(card('doing')).toHaveCount(0)

    await boards.quickFilter('Todo only').click()
    await expect(boards.quickFilter('Todo only')).toHaveAttribute('aria-pressed', 'false')
    await expect(card('backlog')).toBeVisible()
    await expect(card('doing')).toBeVisible()
  })

  test('statuses without a column raise a warning with a popup that leads on', async ({ page }) => {
    const id = await makeBoard('uncovered', {
      columns: [
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ]
    })
    const boards = new BoardsPage(page)
    await boards.open(id)
    await expect(boards.uncovered()).toBeVisible()
    await expect(boards.uncovered()).toContainText('without a column')

    await boards.uncovered().click()
    await expect(boards.uncoveredPopup()).toBeVisible()
    await expect(boards.uncoveredPopup()).toContainText('Backlog')
    await expect(boards.uncoveredPopup()).toContainText('Todo')

    // The author may add the status to a column: the columns tab opens
    await boards.uncoveredAdd().click()
    await expect(page).toHaveURL(new RegExp(`/tracker/boards/${id}/settings\\?tab=columns`))
    await expect(boards.settingsColumns()).toBeVisible()

    // The other way out lists the issues in the statuses the board misses
    await boards.open(id)
    await boards.uncovered().click()
    await boards.uncoveredShow().click()
    await expect(page).toHaveURL(/\/tracker\/all-issues$/)
    await expect(page.getByText(`${titlePrefix}todo`).first()).toBeVisible()
    await expect(page.getByText(`${titlePrefix}backlog`).first()).toBeVisible()
    await expect(page.getByText(`${titlePrefix}doing`)).toHaveCount(0)
  })

  test('a personal board disappears for another user and comes back with the team visibility', async ({
    page,
    browser
  }) => {
    const id = await makeBoard('visibility', {
      columns: [
        { id: 'doing', title: 'Doing', category: task.statusCategory.Active, statuses: [statusId('In Progress')] }
      ]
    })
    const boards = new BoardsPage(page)
    using second = await getSecondPage(browser)
    const boards2 = new BoardsPage(second.page)
    await boards2.open(id)

    await (await page.goto(boards.boardUrl(id, true)))?.finished()
    await boards.radio('boardVisibilityMe').click()
    await expect.poll(async () => (await readBoardById(id))?.visibility).toBe('me')
    // The viewer lives on: the board leaves the page of the second user without a reload
    await expect(boards2.columns()).toHaveCount(0)
    await expect(second.page.getByText('Board not found')).toBeVisible()

    await boards.radio('boardVisibilityAll').click()
    await expect(boards2.columns().first()).toBeVisible()
  })

  test('the board filter does not offer the project as a condition', async ({ page }) => {
    const boards = new BoardsPage(page)
    await (await page.goto(boards.boardUrl(boardId, true)))?.finished()
    await expect(boards.settingsGeneral()).toBeVisible()
    await boards.filterAdd().click()
    await expect(boards.popupItem('Status')).toBeVisible()
    await expect(boards.popupItem('Priority')).toBeVisible()
    await expect(boards.popupItem('Project')).toHaveCount(0)
  })

  test('the settings open on the tab of the link, in the project and on the board page', async ({ page }) => {
    const boards = new BoardsPage(page)
    const projectId = project?._id ?? ''
    const tabs: Array<[string, () => Locator]> = [
      ['card', boards.settingsCard],
      ['columns', boards.settingsColumns],
      ['swimlanes', () => boards.settingsTab('swimlanes')],
      ['quickFilters', () => boards.settingsTab('quickFilters')],
      ['colorRules', () => boards.settingsTab('colorRules')]
    ]
    for (const [tab, locator] of tabs) {
      await (await page.goto(boards.boardUrl(boardId, true, tab)))?.finished()
      await expect(locator(), tab).toBeVisible()
      await expect(boards.settingsGeneral(), tab).toHaveCount(0)
    }

    await (await page.goto(boards.projectBoardUrl(projectId, boardId, true, 'quickFilters')))?.finished()
    await expect(boards.settingsTab('quickFilters')).toBeVisible()

    // A tab nobody knows gives the first one
    await (await page.goto(boards.boardUrl(boardId, true, 'nonsense')))?.finished()
    await expect(boards.settingsGeneral()).toBeVisible()
  })

  test('the board switcher lists the boards and creates a new one', async ({ page }) => {
    const boards = new BoardsPage(page)
    await boards.open(boardId)
    await boards.switcher().click()
    await expect(boards.menuItem(`${titlePrefix}board`)).toBeVisible()
    await boards.menuItem('Create board').click()
    await expect(page).toHaveURL(/\/tracker\/boards\/.+\/settings/)
    await expect(boards.settings()).toBeVisible()

    // A new board of the project with a column per status of the project
    const created = new URL(page.url()).pathname.split('/')[5] as Ref<Board>
    const board = await readBoardById(created)
    expect(board?.title).toBe('New board')
    expect(board?.projects).toEqual([project?._id])
    expect(board?.columns.length).toBeGreaterThan(0)
  })
})
